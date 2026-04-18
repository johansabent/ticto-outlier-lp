import { getServerEnv } from '@/lib/env.server';
import type { HubspotContactPayload } from '@/lib/utm-mapping';
import type { ErrorClass } from '@/lib/logger';

const CONTACTS_PATH = '/crm/v3/objects/contacts';

export type PostLeadSuccess = {
  ok: true;
  status: number;
  leadId: string | null;
  duplicate?: boolean;
};

export type PostLeadFailure = {
  ok: false;
  status: number;
  errorClass: ErrorClass;
  bodySnippet: string;
};

export type PostLeadResult = PostLeadSuccess | PostLeadFailure;

export interface PostLeadOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function classify(status: number): ErrorClass {
  if (status >= 500) return 'hubspot_5xx';
  return 'hubspot_4xx';
}

async function safeRead(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 512);
  } catch {
    return '';
  }
}

function extractContactId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { id } = body as { id?: unknown };
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return null;
}

async function doPost(
  payload: HubspotContactPayload,
  token: string,
  endpoint: string,
  options: PostLeadOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    return await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function postLead(
  payload: HubspotContactPayload,
  options: PostLeadOptions = {},
): Promise<PostLeadResult> {
  const { HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_API_BASE } = getServerEnv();
  const endpoint = `${HUBSPOT_API_BASE}${CONTACTS_PATH}`;

  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    let res: Response;
    try {
      res = await doPost(payload, HUBSPOT_PRIVATE_APP_TOKEN, endpoint, options);
    } catch (err) {
      // AbortError may be a DOMException (jsdom, browsers) that is not an
      // `instanceof Error` in some runtimes. Detect by name only, guarding
      // against non-object throws.
      const name =
        typeof err === 'object' && err !== null && 'name' in err
          ? (err as { name?: unknown }).name
          : undefined;
      if (name === 'AbortError') {
        return { ok: false, status: 0, errorClass: 'hubspot_timeout', bodySnippet: '' };
      }
      return {
        ok: false,
        status: 0,
        errorClass: 'hubspot_5xx',
        bodySnippet: err instanceof Error ? err.message : String(err),
      };
    }

    if (res.status === 429 && attempt < 2) {
      // HubSpot sends seconds (integer). HTTP spec also permits an HTTP-date string;
      // Number() of a date string is NaN, so we default to 1s in that case.
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      const waitMs =
        Math.max(0, Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 10)) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    // HubSpot returns 409 when a contact with this email already exists.
    // Treat as idempotent success so repeated Typeform retries don't 500.
    // leadId is null because obtaining the existing id requires a second
    // GET /contacts/{email}?idProperty=email, which teste técnico scope
    // does not require.
    if (res.status === 409) {
      return { ok: true, status: 409, leadId: null, duplicate: true };
    }

    if (res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: true, status: res.status, leadId: extractContactId(body) };
    }

    const snippet = await safeRead(res);
    return {
      ok: false,
      status: res.status,
      errorClass: classify(res.status),
      bodySnippet: snippet,
    };
  }

  return { ok: false, status: 429, errorClass: 'hubspot_4xx', bodySnippet: 'exhausted retries' };
}
