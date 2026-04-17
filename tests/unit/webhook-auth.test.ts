import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTypeformSignature, type ValidationResult } from '@/lib/webhook-auth';
import fixtureRaw from '../fixtures/typeform-webhook.json';

// Test-only value; unrelated to the production secret (which lives only in
// Vercel env + local `.env.local`). 37 chars — above the validator's min-16
// defense-in-depth check.
const SECRET = 'typeform-webhook-test-fixture-secret';

// Type-narrowing helper: asserts result is invalid and returns the failure branch.
// Required because TypeScript's discriminated union won't let us access `.reason`
// without narrowing — `expect(result.valid).toBe(false)` does not narrow for tsc.
function failureReason(result: ValidationResult): string {
  if (result.valid) throw new Error('Expected invalid result but got valid');
  return result.reason;
}

// Compute expected signature the same way Typeform does
function makeSignature(body: string | Buffer, secret: string): string {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return 'sha256=' + createHmac('sha256', secret).update(buf).digest('base64');
}

const FIXTURE_BODY = JSON.stringify(fixtureRaw);
const VALID_SIG = makeSignature(FIXTURE_BODY, SECRET);

// submitted_at from fixture: 2026-04-16T21:00:39Z. Fake "now" close to it.
const FIXTURE_NOW = new Date('2026-04-16T21:02:00Z'); // 81 seconds after submission

describe('lib/webhook-auth — verifyTypeformSignature', () => {
  it('accepts a valid Typeform signature and fresh timestamp', () => {
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts a Buffer rawBody (byte-exact HMAC, avoids reserialization drift)', () => {
    // Route handler will pass raw bytes from the request. Verify we don't
    // force a string round-trip that would corrupt the HMAC for payloads
    // containing multibyte chars or re-ordered JSON keys.
    const buf = Buffer.from(FIXTURE_BODY, 'utf8');
    const sig = makeSignature(buf, SECRET);
    const result = verifyTypeformSignature({
      rawBody: buf,
      signatureHeader: sig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects when signature header is missing', () => {
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: null,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('hmac_missing');
  });

  it('rejects a tampered body (HMAC check runs before replay parse)', () => {
    const tampered = FIXTURE_BODY.replace('Teste QA', 'Hacker');
    const result = verifyTypeformSignature({
      rawBody: tampered,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('hmac_mismatch');
  });

  it('rejects when sha256= prefix is missing', () => {
    const badSig = VALID_SIG.replace('sha256=', '');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: badSig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('hmac_bad_format');
  });

  it('rejects a same-length wrong signature as hmac_mismatch (not hmac_length_mismatch)', () => {
    // Bogus signature of identical length to VALID_SIG. Proves the check
    // isn't just length-based — the constant-time compare must actually run.
    const bogus =
      'sha256=' + 'A'.repeat(VALID_SIG.length - 'sha256='.length - 1) + 'B';
    expect(bogus.length).toBe(VALID_SIG.length);
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: bogus,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('hmac_mismatch');
  });

  it('rejects when lengths differ (avoids timingSafeEqual throw)', () => {
    const shortSig = 'sha256=abc';
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: shortSig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('hmac_length_mismatch');
  });

  it('rejects when submitted_at is older than the 48h past window', () => {
    // submitted_at = 2026-04-16T21:00:39Z; now = 49h + 1s later → past-window
    // exceeded. (Was 5 min pre-Option-D — widened to 48h to cover legitimate
    // Typeform retries per Task 8 codex review finding #1/#2.)
    const far = new Date('2026-04-18T22:00:40Z');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: far,
    });
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('accepts a timestamp just inside the 48h past boundary', () => {
    // 47h 59m after submission — still within the 48h window.
    const edge = new Date('2026-04-18T20:59:39Z');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: edge,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects when submitted_at is more than 60s in the future (skew guard)', () => {
    // submitted_at = 2026-04-16T21:00:39Z; now = 2026-04-16T20:59:00Z.
    // submitted_at is 99s in the future from "now" → past the 60s FUTURE_SKEW_MS.
    // Without this guard an attacker could replay a future-dated payload.
    const earlier = new Date('2026-04-16T20:59:00Z');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: earlier,
    });
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('accepts small forward skew (≤60s, clock drift between Typeform and us)', () => {
    // Now is 30s before submitted_at — within FUTURE_SKEW_MS.
    const slightlyEarly = new Date('2026-04-16T21:00:09Z');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: slightlyEarly,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects when form_response.submitted_at is missing', () => {
    const bodyNoTs = JSON.stringify({ form_response: {} });
    const sig = makeSignature(bodyNoTs, SECRET);
    const result = verifyTypeformSignature({
      rawBody: bodyNoTs,
      signatureHeader: sig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('rejects when submitted_at is not a string (type-coercion guard)', () => {
    // Typeform's contract says submitted_at is an ISO-8601 string. If the
    // payload sends a unix number, `new Date(number)` would silently accept
    // it and compare on a different time basis — refuse anything non-string.
    const bodyBadTs = JSON.stringify({
      form_response: { submitted_at: 1713304839 },
    });
    const sig = makeSignature(bodyBadTs, SECRET);
    const result = verifyTypeformSignature({
      rawBody: bodyBadTs,
      signatureHeader: sig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('returns replay_window_exceeded when body is malformed JSON but HMAC matches', () => {
    // HMAC-first ordering means we've authenticated the sender; unparseable
    // JSON post-auth is treated as replay-window failure rather than an
    // exception that would 500 the route.
    const junk = 'not-json-at-all';
    const sig = makeSignature(junk, SECRET);
    const result = verifyTypeformSignature({
      rawBody: junk,
      signatureHeader: sig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('throws when the secret is empty', () => {
    expect(() =>
      verifyTypeformSignature({
        rawBody: FIXTURE_BODY,
        signatureHeader: VALID_SIG,
        secret: '',
        now: FIXTURE_NOW,
      }),
    ).toThrow(/at least 16 characters/);
  });

  it('throws when the secret is shorter than 16 characters', () => {
    expect(() =>
      verifyTypeformSignature({
        rawBody: FIXTURE_BODY,
        signatureHeader: VALID_SIG,
        secret: 'too-short', // 9 chars
        now: FIXTURE_NOW,
      }),
    ).toThrow(/at least 16 characters/);
  });
});
