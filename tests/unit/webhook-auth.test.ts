import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTypeformSignature, type ValidationResult } from '@/lib/webhook-auth';
import fixtureRaw from '../fixtures/typeform-webhook.json';

// Test-only value. Unrelated to the production webhook secret, which lives only
// in Vercel env vars + local `.env.local`. This string is self-contained: the
// test computes its own "expected" signature with the same literal, so the value
// never needs to match anything in the outside world.
const SECRET = 'typeform-webhook-test-fixture-secret';

// Type-narrowing helper: asserts result is invalid and returns the failure branch.
// Required because TypeScript's discriminated union won't let us access `.reason`
// without narrowing — `expect(result.valid).toBe(false)` does not narrow for tsc.
function failureReason(result: ValidationResult): string {
  if (result.valid) throw new Error('Expected invalid result but got valid');
  return result.reason;
}

// Compute expected signature the same way Typeform does
function makeSignature(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('base64');
}

const FIXTURE_BODY = JSON.stringify(fixtureRaw);
const VALID_SIG = makeSignature(FIXTURE_BODY, SECRET);

// submitted_at from fixture: 2026-04-16T21:00:39Z — fake "now" close to it for replay tests
const FIXTURE_NOW = new Date('2026-04-16T21:02:00Z'); // 81 seconds after submission — within 5 min

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

  it('rejects when signature header is missing', () => {
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: null,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(failureReason(result)).toBe('hmac_missing');
  });

  it('rejects a tampered body', () => {
    const tampered = FIXTURE_BODY.replace('Teste QA', 'Hacker');
    const result = verifyTypeformSignature({
      rawBody: tampered,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
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
    expect(result.valid).toBe(false);
    expect(failureReason(result)).toBe('hmac_bad_format');
  });

  it('rejects when submitted_at is older than 5 minutes', () => {
    const staleNow = new Date('2026-04-16T21:10:00Z'); // 9+ minutes after submission
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: staleNow,
    });
    expect(result.valid).toBe(false);
    expect(failureReason(result)).toBe('replay_window_exceeded');
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
    expect(result.valid).toBe(false);
    expect(failureReason(result)).toBe('replay_window_exceeded');
  });

  it('rejects when lengths differ (avoids timingSafeEqual throw)', () => {
    const shortSig = 'sha256=abc';
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: shortSig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(failureReason(result)).toBe('hmac_length_mismatch');
  });
});
