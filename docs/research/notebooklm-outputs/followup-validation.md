# NotebookLM Follow-up — Validation of 6 Open Points

**Date:** 2026-04-15
**Context:** Second query to NotebookLM to validate/refute claims from the first blueprint that were flagged as unverified or suspect.

## Results summary

| # | Question | Verdict | Action |
|---|---|---|---|
| 1 | Next.js 16 stable? `proxy.ts` real? | **Validated.** 16.2.3 is Active LTS; `proxy.ts` replaces `middleware.ts` as Next.js 16 breaking change | Use Next 16.2.3 |
| 2 | CVE-2025-55182 "React2Shell" real? | **Validated.** CVSS 10.0 RCE in 15.0.0–16.0.6; patched in 16.2.3 | Use 16.2.3+ (automatic mitigation); cross-check NVD later |
| 3 | Datacrazy accepts `X-Idempotency-Key`? | **Refuted / silent.** Not documented | Implement idempotency our side OR skip for 72h |
| 4 | YayForms HMAC signing format? | **Silent / undocumented.** Unknown header name, payload format, timestamp inclusion | Discover empirically on account creation; fallback to shared-secret |
| 5 | Fix `waitUntil` antipattern | **Fixed.** Validate HMAC + call CRM synchronously; `waitUntil` only for non-critical logging | Adopt corrected pattern |
| 6 | First-touch UTM re-injection | **Fixed.** Save UTMs on first visit; on second visit without URL params, inject saved UTMs via `history.replaceState` BEFORE YayForms script loads | Adopt pattern |

## Correction to NotebookLM's own recommendation

NotebookLM recommended **Vercel KV** for idempotency dedup. This contradicts the Vercel plugin knowledge-update (Feb 2026): **Vercel Postgres and Vercel KV are no longer offered.** Marketplace alternatives exist (Upstash Redis, etc.) but add setup overhead for 72h window.

**Our decision:** skip durable dedup for the test, document as limitation in README, note production path (Upstash via Vercel Marketplace integration).

## Validated handler pattern (to adopt)

```typescript
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-yayforms-signature'); // header name TBD

  const expected = crypto.createHmac('sha256', process.env.YAYFORMS_SECRET!)
    .update(rawBody)
    .digest('hex');

  // Length check before timingSafeEqual to avoid throw
  if (!signature || signature.length !== expected.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  try {
    const crmRes = await fetch('https://api.g1.datacrazy.io/api/v1/leads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DATACRAZY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mapToDatacrazy(payload)) // our 4-layer transform
    });

    if (!crmRes.ok) throw new Error(`Datacrazy ${crmRes.status}`);
  } catch (error) {
    return NextResponse.json({ error: 'CRM Sync Failed' }, { status: 500 });
  }

  waitUntil(
    // structured log (non-critical)
    Promise.resolve(console.log(JSON.stringify({
      event: 'lead.forwarded',
      submission_id: payload.submission_id,
      ts: Date.now()
    })))
  );

  return NextResponse.json({ success: true }, { status: 200 });
}
```

## Validated first-touch re-injection pattern (to adopt)

```typescript
'use client';
import { useEffect } from 'react';

const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'sck', 'src'] as const;
const STORAGE_KEY = 'first_touch_utms_v1';

export function useUTMRehydration() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    // Save first-touch if URL has UTMs and we haven't saved before
    const hasURLParams = KEYS.some(k => url.searchParams.has(k));
    if (hasURLParams && !saved.utm_source) {
      const capture = Object.fromEntries(
        KEYS.filter(k => url.searchParams.has(k))
          .map(k => [k, url.searchParams.get(k)!])
      );
      capture.landing_page = window.location.pathname;
      capture.captured_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capture));
      return;
    }

    // Re-inject saved UTMs if URL is missing them
    let changed = false;
    KEYS.forEach(k => {
      if (saved[k] && !url.searchParams.has(k)) {
        url.searchParams.set(k, saved[k]);
        changed = true;
      }
    });
    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
}
```

Note: must run **before** YayForms embed script initializes. Strategy: render `<UTMRehydrator />` client component above `<YayFormsEmbed />` in the page tree.
