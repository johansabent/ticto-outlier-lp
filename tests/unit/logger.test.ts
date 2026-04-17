import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, redactEmail, redactPhone, type LeadEvent } from '@/lib/logger';

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

  it('logger.error writes with level=error', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.error({
      event: 'lead.failed',
      submission_id: 's1',
      error_class: 'datacrazy_5xx',
      error_message: 'boom',
    });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.error_class).toBe('datacrazy_5xx');
  });
});
