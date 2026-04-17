import { createHmac, timingSafeEqual } from 'node:crypto';

export type ValidationFailure =
  | 'hmac_missing'
  | 'hmac_bad_format'
  | 'hmac_header_too_long'
  | 'hmac_length_mismatch'
  | 'hmac_mismatch'
  | 'malformed_payload'
  | 'replay_window_exceeded';

export type ValidationResult = { valid: true } | { valid: false; reason: ValidationFailure };

export interface VerifyTypeformInput {
  // Prefer Buffer — we compute the HMAC over the exact bytes Typeform signed,
  // so re-serializing a parsed body (e.g. JSON.stringify on req.json() output)
  // reorders keys and breaks the signature. Accept string for test ergonomics;
  // Buffer.from(str, 'utf8') runs internally in that case.
  rawBody: string | Buffer;
  signatureHeader: string | null;
  secret: string;
  // Injectable for tests; defaults to new Date()
  now?: Date;
}

const SIGNATURE_HEADER_PREFIX = 'sha256=';
// Cap header length before allocating a Buffer from it. A valid Typeform
// signature is `sha256=` (7) + 44 base64 chars = 51 bytes; 256 is comfortably
// above any legitimate value while bounding the memory an attacker can force
// us to allocate with an oversized `Typeform-Signature` header.
const MAX_SIGNATURE_HEADER_LENGTH = 256;
// Accept a small forward skew so mild clock drift between Typeform and this
// runtime doesn't reject legitimate payloads.
const FUTURE_SKEW_MS = 60 * 1000;
// Typeform retries failed deliveries for up to 24h; we allow 48h to absorb
// delayed queue processing. Stronger replay protection (event_id dedup) is
// layered on in the route handler — this window is the outer bound.
const PAST_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 16;

export function verifyTypeformSignature(input: VerifyTypeformInput): ValidationResult {
  const { rawBody, signatureHeader, secret, now = new Date() } = input;

  // Defense-in-depth. Env validation already enforces min-16 in production, so
  // reaching this branch means a misconfigured caller — throw loudly rather
  // than silently accept a guessable key.
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Typeform webhook secret must be at least ${MIN_SECRET_LENGTH} characters (got ${secret?.length ?? 0})`,
    );
  }

  if (!signatureHeader) return { valid: false, reason: 'hmac_missing' };
  // Guard memory allocation before `Buffer.from(signatureHeader)`. Without
  // this, an oversized header (Node caps at ~16KB per header, but that's
  // still 16KB of per-request allocation) would be materialized in full
  // before any structural check runs.
  if (signatureHeader.length > MAX_SIGNATURE_HEADER_LENGTH) {
    return { valid: false, reason: 'hmac_header_too_long' };
  }
  if (!signatureHeader.startsWith(SIGNATURE_HEADER_PREFIX)) {
    return { valid: false, reason: 'hmac_bad_format' };
  }

  // HMAC-first: verify the signature over exact bytes BEFORE touching JSON.
  // An attacker can feed malformed JSON; parsing untrusted input before
  // authenticating it is a well-known footgun (CVE-style surface for parser
  // bugs and resource exhaustion). Only proceed to replay checks once we
  // know the payload was signed by someone holding the shared secret.
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected =
    SIGNATURE_HEADER_PREFIX +
    createHmac('sha256', secret).update(bodyBuffer).digest('base64');
  const providedBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'hmac_length_mismatch' };
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'hmac_mismatch' };
  }

  // Replay window is evaluated only after HMAC passes. We're guarding
  // against legitimate-but-old payloads (retried deliveries, delayed
  // queues), not untrusted input — unauthenticated traffic can't reach here.
  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  let submittedAt: Date | null = null;
  let parseOk = false;
  try {
    const parsed = JSON.parse(bodyString) as {
      form_response?: { submitted_at?: unknown };
    };
    parseOk = true;
    const ts = parsed?.form_response?.submitted_at;
    // Type guard: `new Date(number)` would accept a unix timestamp and the
    // replay check would then silently operate on a different time basis
    // than Typeform's ISO-8601 contract. Refuse anything that isn't a
    // non-empty string.
    if (typeof ts === 'string' && ts.length > 0) {
      submittedAt = new Date(ts);
    }
  } catch {
    // HMAC was valid but the body doesn't parse — post-auth malformed data.
  }
  // malformed_payload vs replay_window_exceeded: the former means structural
  // failure (parse, missing/non-string submitted_at, invalid date) — useful
  // observability signal for upstream Typeform schema drift. The latter is
  // reserved for timestamps that successfully parsed but fall outside the
  // accept window — a replay-protection signal.
  if (!parseOk) return { valid: false, reason: 'malformed_payload' };
  if (!submittedAt || isNaN(submittedAt.getTime())) {
    return { valid: false, reason: 'malformed_payload' };
  }

  // Asymmetric window: tight on the future (clock skew only), loose on the
  // past (legitimate retries). `Math.abs` would treat both directions the
  // same, letting an attacker replay a future-dated payload.
  const delta = now.getTime() - submittedAt.getTime();
  if (delta < -FUTURE_SKEW_MS) return { valid: false, reason: 'replay_window_exceeded' };
  if (delta > PAST_WINDOW_MS) return { valid: false, reason: 'replay_window_exceeded' };

  return { valid: true };
}
