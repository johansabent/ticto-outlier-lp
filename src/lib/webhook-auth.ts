import { createHmac, timingSafeEqual } from 'node:crypto';

export type ValidationFailure =
  | 'hmac_missing'
  | 'hmac_bad_format'
  | 'hmac_length_mismatch'
  | 'hmac_mismatch'
  | 'replay_window_exceeded';

export type ValidationResult = { valid: true } | { valid: false; reason: ValidationFailure };

export interface VerifyTypeformInput {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  /** Injectable for tests; defaults to Date.now() */
  now?: Date;
}

const SIGNATURE_HEADER_PREFIX = 'sha256=';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function verifyTypeformSignature(input: VerifyTypeformInput): ValidationResult {
  const { rawBody, signatureHeader, secret, now = new Date() } = input;

  // 1. Header presence
  if (!signatureHeader) return { valid: false, reason: 'hmac_missing' };

  // 2. Format: must start with 'sha256='
  if (!signatureHeader.startsWith(SIGNATURE_HEADER_PREFIX)) {
    return { valid: false, reason: 'hmac_bad_format' };
  }

  // 3. Replay window — check submitted_at before HMAC (fail fast on obvious replays)
  let submittedAt: Date | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { form_response?: { submitted_at?: string } };
    const ts = parsed?.form_response?.submitted_at;
    if (ts) submittedAt = new Date(ts);
  } catch {
    // body not parseable yet — HMAC will fail anyway
  }
  if (!submittedAt || isNaN(submittedAt.getTime())) {
    return { valid: false, reason: 'replay_window_exceeded' };
  }
  if (Math.abs(now.getTime() - submittedAt.getTime()) > REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'replay_window_exceeded' };
  }

  // 4. HMAC comparison (base64, not hex — Typeform uses base64)
  const expected = 'sha256=' + createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('base64');
  const providedBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'hmac_length_mismatch' };
  }

  return timingSafeEqual(providedBuf, expectedBuf)
    ? { valid: true }
    : { valid: false, reason: 'hmac_mismatch' };
}
