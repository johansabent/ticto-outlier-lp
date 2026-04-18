import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HubspotContactPayload } from '@/lib/utm-mapping';

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = 'pat_test_abc';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'dev-placeholder-secret-16ch';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  delete process.env.HUBSPOT_API_BASE;
}

const payload: HubspotContactPayload = {
  properties: {
    email: 'test@example.com',
    firstname: 'Test User',
    phone: '+5511988887777',
    utm_source: 'linkedin',
  },
};

describe('lib/hubspot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
    setEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.HUBSPOT_API_BASE;
  });

  it('posts with Bearer token and returns { ok: true, status, leadId } on 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'contact_42' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/hubspot');
    const result = await postLead(payload);

    expect(result).toEqual({ ok: true, status: 201, leadId: 'contact_42' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/contacts');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer pat_test_abc');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries once on 429 honoring Retry-After then returns the second response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'contact_7' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/hubspot');
    const promise = postLead(payload);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns { ok: false, errorClass: "hubspot_4xx" } on 400 and does not retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/hubspot');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('hubspot_4xx');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns { ok: false, errorClass: "hubspot_5xx" } on 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { postLead } = await import('@/lib/hubspot');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('hubspot_5xx');
  });

  it('returns { ok: false, errorClass: "hubspot_timeout" } when fetch aborts', async () => {
    const fetchMock = vi.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined);
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/hubspot');
    const promise = postLead(payload, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('hubspot_timeout');
  });

  it('treats 409 duplicate-email as idempotent success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Contact already exists' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { postLead } = await import('@/lib/hubspot');
    const res = await postLead(payload, { fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe(409);
      expect(res.leadId).toBeNull();
      expect(res.duplicate).toBe(true);
    }
  });

  it('respects HUBSPOT_API_BASE override when set', async () => {
    process.env.HUBSPOT_API_BASE = 'https://api-eu.hubapi.com';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'contact_1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { postLead } = await import('@/lib/hubspot');
    await postLead(payload);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-eu.hubapi.com/crm/v3/objects/contacts');
  });

  it('falls back to the default endpoint when HUBSPOT_API_BASE is unset', async () => {
    delete process.env.HUBSPOT_API_BASE;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'contact_2' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { postLead } = await import('@/lib/hubspot');
    await postLead(payload);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/contacts');
  });
});
