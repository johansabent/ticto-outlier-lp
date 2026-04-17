import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatacrazyLeadPayload } from '@/lib/utm-mapping';

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.DATACRAZY_API_TOKEN = 'tok_live_abc';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'whsec_secret_123';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
}

const payload: DatacrazyLeadPayload = {
  name: 'A',
  email: 'a@b.co',
  phone: '+5511900000000',
  source: 'linkedin',
  sourceReferral: { sourceUrl: 'https://example.com/' },
  notes: '{"utm_source":"linkedin"}',
};

describe('lib/datacrazy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
    setEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts with Bearer token and returns { ok: true, status, leadId } on 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead_42' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);

    expect(result).toEqual({ ok: true, status: 201, leadId: 'lead_42' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.g1.datacrazy.io/api/v1/leads');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer tok_live_abc');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries once on 429 honoring Retry-After then returns the second response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'lead_7' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const promise = postLead(payload);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns { ok: false, errorClass: "datacrazy_4xx" } on 400 and does not retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_4xx');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns { ok: false, errorClass: "datacrazy_5xx" } on 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_5xx');
  });

  it('returns { ok: false, errorClass: "datacrazy_timeout" } when fetch aborts', async () => {
    const fetchMock = vi.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined);
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const promise = postLead(payload, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_timeout');
  });
});
