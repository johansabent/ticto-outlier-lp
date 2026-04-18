import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env.server';
import { getClientEnv } from '@/lib/env.client';
import { verifyTypeformSignature } from '@/lib/webhook-auth';
import { parseAnswers, type TypeformAnswer } from '@/lib/typeform-fields';
import { mapUtms, buildDatacrazyPayload } from '@/lib/utm-mapping';
import { postLead } from '@/lib/datacrazy';
import { logger, redactEmail, redactName, redactPhone } from '@/lib/logger';

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

type BodyReadResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; tooLarge: true; bytesRead: number };

async function readBodyWithCap(
  req: Request,
  maxBytes: number,
): Promise<BodyReadResult> {
  // Stream the body and bail as soon as we exceed maxBytes, before the full
  // payload materializes in memory. Fixes the P1 codex finding: the prior
  // `await req.arrayBuffer()` + post-check allowed an unauthenticated
  // attacker to force allocation of a full body whose `content-length` was
  // missing or mis-declared (chunked transfer).
  const reader = req.body?.getReader();
  if (!reader) return { ok: true, bytes: Buffer.alloc(0) };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true, bytesRead: total };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return { ok: true, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c)), total) };
}

export async function POST(req: Request) {
  const requestId = newRequestId();
  const t0 = Date.now();
  const serverEnv = getServerEnv();
  const clientEnv = getClientEnv();

  // 0. Fast-reject via content-length. Belt-and-suspenders on top of the
  // streaming cap below; lets well-behaved clients fail cheaply.
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

  // 1. Read raw body bytes with a streaming cap BEFORE JSON.parse — HMAC must
  // run on exact bytes. readBodyWithCap streams and aborts as soon as the cap
  // is exceeded, so an unauthenticated attacker can't force memory allocation
  // past MAX_BODY_BYTES even with chunked transfer or a missing/spoofed
  // content-length header.
  const read = await readBodyWithCap(req, MAX_BODY_BYTES);
  if (!read.ok) {
    logger.warn({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: `payload_too_large: streamed ${read.bytesRead}`,
    });
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  const bodyBytes = read.bytes;

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
      form_id?: string;
      answers?: TypeformAnswer[];
      hidden?: Record<string, string>;
      token?: string;
      // ISO-8601 from Typeform. Used as `capturedAt` for Datacrazy so lead
      // attribution reflects when the user actually submitted, not when our
      // webhook happened to run (could be seconds-to-minutes later on retries).
      submitted_at?: string;
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

  if (body.form_response.form_id !== serverEnv.TYPEFORM_FORM_ID) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      submission_id: body.form_response.token,
      error_class: 'form_id_mismatch',
      error_message: `unexpected_form_id: ${body.form_response.form_id ?? 'missing'}`,
    });
    return NextResponse.json({ error: 'unexpected_form_id' }, { status: 403 });
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
    // Derive from actual parsed answers rather than hardcoding 5 — stays
    // accurate if the field registry grows, and reflects what was truly
    // extracted (parseAnswers would have already thrown on missing required).
    field_count_mapped: Object.keys(answers).length,
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

  // 6. Build Datacrazy payload. capturedAt prefers Typeform's submitted_at
  // (authoritative for lead attribution) and only falls back to wall-clock
  // if Typeform omits it — matters for retries/delayed webhooks where our
  // processing time could lag the real submission by minutes.
  const datacrazyPayload = buildDatacrazyPayload({
    answers,
    utms,
    landingUrl,
    capturedAt: body.form_response.submitted_at ?? new Date().toISOString(),
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
    name_hint: redactName(answers.nome),
  });

  return NextResponse.json({ ok: true, request_id: requestId }, { status: 200 });
}

export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
