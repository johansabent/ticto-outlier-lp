import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env.server';
import { getClientEnv } from '@/lib/env.client';
import { verifyTypeformSignature } from '@/lib/webhook-auth';
import { parseAnswers, type TypeformAnswer } from '@/lib/typeform-fields';
import { mapUtms, buildDatacrazyPayload } from '@/lib/utm-mapping';
import { postLead } from '@/lib/datacrazy';
import { logger, redactEmail, redactPhone } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Typeform payloads in practice are ~5-20KB. Cap well above that (64KB) to
// reject unauthenticated large-body DoS without truncating legitimate
// deliveries. Check runs before arrayBuffer() materializes anything.
const MAX_BODY_BYTES = 64 * 1024;

// Landing URL validation: `hidden.landing_page` is populated client-side
// from localStorage (see <TypeformEmbed>), which means a page visitor can
// stuff arbitrary strings into it before submitting the form. Cap + URL-
// validate at the trust boundary so Datacrazy records don't accumulate
// garbage. Lenient-with-fallback: invalid values fall back to NEXT_PUBLIC_SITE_URL
// rather than rejecting the lead.
const MAX_LANDING_URL_LENGTH = 2048;

function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeLandingUrl(
  candidate: string | undefined,
  fallback: string,
): string {
  if (!candidate || candidate.length > MAX_LANDING_URL_LENGTH) return fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

export async function POST(req: Request) {
  const requestId = newRequestId();
  const t0 = Date.now();
  const serverEnv = getServerEnv();
  const clientEnv = getClientEnv();

  // 0. Body-size guard — rejects oversized uploads before HMAC computation
  // bills CPU on attacker-controlled bytes. content-length can lie, but any
  // sane client sets it; bodies that spoof past the check still hit the
  // same guard via Buffer length below.
  const declaredLen = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    logger.warn({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: `payload_too_large: declared ${declaredLen}`,
    });
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  // 1. Read raw body bytes BEFORE JSON.parse — HMAC must run on exact bytes.
  // Buffer.from(arrayBuffer) preserves the exact bytes Typeform signed; a
  // string round-trip (req.text()) would survive here because our validator
  // re-encodes to utf8, but Buffer keeps the plan's stated intent explicit
  // and avoids any future drift if we change the HMAC path.
  const bodyBytes = Buffer.from(await req.arrayBuffer());
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    logger.warn({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: `payload_too_large: actual ${bodyBytes.byteLength}`,
    });
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  // 2. Verify Typeform HMAC signature on exact bytes.
  const sigHeader = req.headers.get('typeform-signature');
  const authResult = verifyTypeformSignature({
    rawBody: bodyBytes,
    signatureHeader: sigHeader,
    secret: serverEnv.TYPEFORM_WEBHOOK_SECRET,
  });

  logger.info({
    event: 'lead.received',
    request_id: requestId,
    auth_mode: 'hmac',
    auth_valid: authResult.valid,
    timing_ms: Date.now() - t0,
  });

  if (!authResult.valid) {
    // Split status by reason: post-HMAC structural failures (malformed_payload)
    // mean the sender authenticated but sent a broken body. Typeform treats
    // 401 as permanent (stops retrying) and 400 as "don't retry, fix the
    // payload" — semantically correct for each case.
    const status = authResult.reason === 'malformed_payload' ? 400 : 401;
    const errorClass =
      authResult.reason === 'malformed_payload' ? 'parse_error' : 'auth_invalid';
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: errorClass,
      error_message: authResult.reason,
    });
    return NextResponse.json(
      { error: status === 400 ? 'malformed_payload' : 'unauthorized' },
      { status },
    );
  }

  // 3. Parse body only after HMAC passes. Convert authenticated bytes to
  // string for JSON.parse; the validator has already accepted these bytes.
  const rawBody = bodyBytes.toString('utf8');
  let body: {
    form_response?: {
      answers?: TypeformAnswer[];
      hidden?: Record<string, string>;
      token?: string;
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: 'invalid_json',
    });
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.form_response) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: 'missing_form_response',
    });
    return NextResponse.json({ error: 'missing_form_response' }, { status: 400 });
  }

  // 4. Extract fields by ref.
  let answers;
  try {
    answers = parseAnswers(body.form_response.answers ?? []);
  } catch (err) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: err instanceof Error ? err.message : 'field_extraction_failed',
    });
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  // 5. Extract UTMs from form_response.hidden.
  const utms = mapUtms(body.form_response.hidden);
  const utmKeysPresent = Object.entries(utms)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  logger.info({
    event: 'lead.mapped',
    request_id: requestId,
    submission_id: body.form_response.token,
    field_count_mapped: 5,
    utm_keys_present: utmKeysPresent,
  });

  // Landing URL: read from the submitter-declared `landing_page` hidden field.
  // Typeform webhooks are server-to-server so `Referer` is either absent or
  // points at a Typeform CDN, never at the visitor's landing page.
  // `form_response.hidden.landing_page` is injected by <TypeformEmbed> from
  // first-touch localStorage, so it carries the real visitor URL including
  // query string. Validate + fall back to NEXT_PUBLIC_SITE_URL on invalid or
  // absent value — visitors can stuff arbitrary strings into localStorage.
  const landingUrl = sanitizeLandingUrl(
    body.form_response.hidden?.landing_page,
    clientEnv.NEXT_PUBLIC_SITE_URL,
  );

  // 6. Build Datacrazy payload.
  const datacrazyPayload = buildDatacrazyPayload({
    answers,
    utms,
    landingUrl,
    capturedAt: new Date().toISOString(),
  });

  // 7. POST to Datacrazy (sync — no waitUntil needed for 72h scope).
  // KNOWN GAP: no idempotency dedup. If postLead's 429 retry or Typeform's
  // own retry (triggered by our 5xx) re-enters this flow, Datacrazy may
  // accept duplicate leads keyed on `form_response.token`. A KV/Redis-backed
  // token LRU would close this; it's out of the 72h scope per the plan
  // (Task 8 commit message deferred event_id dedup to "when persistence is
  // provisioned"). Accept the duplicate risk for now.
  const crmT0 = Date.now();
  const crm = await postLead(datacrazyPayload);
  const crmMs = Date.now() - crmT0;

  if (!crm.ok) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      submission_id: body.form_response.token,
      error_class: crm.errorClass,
      // bodySnippet comes from Datacrazy's own error body (capped at 512 chars
      // by safeRead) — safe to include for observability.
      error_message: `datacrazy ${crm.status}: ${crm.bodySnippet}`,
    });
    return NextResponse.json({ error: 'crm_failed' }, { status: 500 });
  }

  // 8. Success — PII-redacted log. Full values already sent to Datacrazy;
  // logs only get masked hints per the AGENTS.md PII invariant.
  logger.info({
    event: 'lead.forwarded',
    request_id: requestId,
    submission_id: body.form_response.token,
    datacrazy_status: crm.status,
    datacrazy_lead_id: crm.leadId,
    timing_ms: crmMs,
    email_hint: redactEmail(answers.email),
    phone_hint: redactPhone(answers.telefone),
    name_hint: `${answers.nome.split(' ')[0]} ***`,
  });

  return NextResponse.json({ ok: true, request_id: requestId }, { status: 200 });
}

export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
