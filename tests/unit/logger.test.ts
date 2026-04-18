import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, redactEmail, redactName, redactPhone, type LeadEvent } from '@/lib/logger';

describe('lib/logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redactEmail keeps first char + domain', () => {
    expect(redactEmail('joao.silva@example.com')).toBe('j***@example.com');
    expect(redactEmail('a@b.co')).toBe('a***@b.co');
    expect(redactEmail('')).toBe('');
    expect(redactEmail('not-an-email')).toBe('***');
  });

  it('redactPhone keeps only last 4 digits', () => {
    expect(redactPhone('+5511999991234')).toBe('***-1234');
    expect(redactPhone('11999991234')).toBe('***-1234');
    expect(redactPhone('1234')).toBe('***-1234');
    expect(redactPhone('')).toBe('');
    expect(redactPhone('abc')).toBe('***');
  });

  it('redactPhone emits the canonical fixed-format mask for short inputs', () => {
    // AGENTS.md Core Invariant pins the mask shape at `***-1234` (four
    // visible chars after the dash). Short non-empty digit inputs get
    // `***-****` — preserves the canonical shape, avoids fabricating
    // digits (the original padStart bug), and avoids leaking a short
    // attacker-supplied value verbatim (codex-bot P1).
    expect(redactPhone('5')).toBe('***-****');
    expect(redactPhone('12')).toBe('***-****');
    expect(redactPhone('123')).toBe('***-****');
  });

  it('redactName emits first-char + `***` and never the full name', () => {
    // Pre-fix handler emitted `${first} ***` which leaked the first name,
    // and for single-word `nome` submissions leaked the entire name. The
    // new mask (first char + `***`) matches redactEmail's shape and
    // satisfies the AGENTS.md PII-redaction invariant.
    expect(redactName('João Silva')).toBe('J***');
    expect(redactName('João')).toBe('J***');
    expect(redactName('  Maria  ')).toBe('M***');
    expect(redactName('')).toBe('');
    expect(redactName('   ')).toBe('');
  });

  it('redactEmail trims surrounding whitespace before redacting', () => {
    expect(redactEmail('  joao.silva@example.com  ')).toBe('j***@example.com');
    expect(redactEmail('\t\nuser@x.io\n')).toBe('u***@x.io');
    expect(redactEmail('   ')).toBe('');
  });

  it('logger.info writes a single-line JSON document with event + timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const evt: LeadEvent = {
      event: 'lead.received',
      request_id: 'req-1',
      auth_mode: 'hmac',
      auth_valid: true,
      timing_ms: 42,
    };
    logger.info(evt);
    expect(spy).toHaveBeenCalledOnce();
    const raw = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.event).toBe('lead.received');
    expect(parsed.level).toBe('info');
    expect(parsed.request_id).toBe('req-1');
    expect(typeof parsed.ts).toBe('string');
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
  });

  it('logger.error writes to console.error with level=error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.error({
      event: 'lead.failed',
      submission_id: 's1',
      error_class: 'hubspot_5xx',
      error_message: 'boom',
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.error_class).toBe('hubspot_5xx');
  });

  it('logger.warn writes to console.warn with level=warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.warn({
      event: 'lead.failed',
      error_class: 'parse_error',
      error_message: 'partial',
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
  });
});
