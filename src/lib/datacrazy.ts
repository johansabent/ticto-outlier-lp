import { getServerEnv } from '@/lib/env.server';
import type { DatacrazyLeadPayload } from '@/lib/utm-mapping';
import type { ErrorClass } from '@/lib/logger';

export type PostLeadSuccess = {
  ok: true;
  status: number;
  leadId: string | number | null;
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
  if (status >= 500) return 'datacrazy_5xx';
  return 'datacrazy_4xx';
}

async function safeRead(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 512);
  } catch {
    return '';
  }
}

function extractLeadId(body: unknown): string | number | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  for (const key of ['id', 'leadId', 'lead_id']) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') return v;
  }
  return null;
}

async function doPost(
  payload: DatacrazyLeadPayload,
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
  payload: DatacrazyLeadPayload,
  options: PostLeadOptions = {},
): Promise<PostLeadResult> {
  const { DATACRAZY_API_TOKEN, DATACRAZY_LEADS_ENDPOINT } = getServerEnv();
  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    let res: Response;
    try {
      res = await doPost(payload, DATACRAZY_API_TOKEN, DATACRAZY_LEADS_ENDPOINT, options);
    } catch (err) {
      // AbortError may be a DOMException (jsdom, browsers) that is not an
      // `instanceof Error` in some runtimes. Detect by name only, guarding
      // against non-object throws.
      const name =
        typeof err === 'object' && err !== null && 'name' in err
          ? (err as { name?: unknown }).name
          : undefined;
      if (name === 'AbortError') {
        return { ok: false, status: 0, errorClass: 'datacrazy_timeout', bodySnippet: '' };
      }
      return {
        ok: false,
        status: 0,
        errorClass: 'datacrazy_5xx',
        bodySnippet: err instanceof Error ? err.message : String(err),
      };
    }

    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      const waitMs = Math.max(0, Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 10)) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: true, status: res.status, leadId: extractLeadId(body) };
    }

    const snippet = await safeRead(res);
    return { ok: false, status: res.status, errorClass: classify(res.status), bodySnippet: snippet };
  }

  return { ok: false, status: 429, errorClass: 'datacrazy_4xx', bodySnippet: 'exhausted retries' };
}
