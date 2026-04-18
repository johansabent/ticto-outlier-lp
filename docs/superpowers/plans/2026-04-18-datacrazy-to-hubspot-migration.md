# Datacrazy → HubSpot Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewer preamble (for CodeRabbit / Codex / Gemini):** This plan migrates the final pipeline layer (CRM POST target) from Datacrazy to HubSpot to unblock the Free-tier plan-gate documented in `README.md`. The upstream 6 pipeline layers (HMAC → parse → UTM map → build payload → timeout → retry) stay behaviorally identical. Any review drift that flags the other 6 layers as "new" is a false positive — diff surface is scoped to the CRM adapter only.

**Goal:** Swap the CRM destination from Datacrazy to HubSpot without changing the upstream Typeform webhook → HMAC → parse → UTM-map pipeline, so the teste técnico completes a real end-to-end lead write that the reviewer can see in the HubSpot UI.

**Architecture:** Thin adapter swap. `src/lib/datacrazy.ts` becomes `src/lib/hubspot.ts`; the `postLead(payload) → PostLeadResult` contract is preserved so `src/app/api/lead/route.ts` only changes its import line and one log-field name. The `DatacrazyLeadPayload` interface becomes `HubspotContactPayload` with HubSpot's `{ properties: {...} }` envelope. Error classification, retry-on-429, AbortController timeout, and `safeRead` stay untouched.

**Tech Stack:** Next.js 16 App Router route handler, Node 24 runtime, TypeScript 6, Zod 4 for env validation, Vitest 3.2 unit tests, HubSpot CRM v3 Contacts API (`POST /crm/v3/objects/contacts`), Bearer-token auth via Private App access token.

**Duplicate handling decision:** HubSpot returns **HTTP 409** when an email already exists. We treat 409 as idempotent success (`ok: true, duplicate: true, leadId: null`). This avoids a second round-trip to fetch the existing contact's id, which teste técnico scope does not require. The batch-upsert endpoint (`/crm/objects/{hubdbVersion}/contacts/batch/upsert`) is an alternative we explicitly reject here because it forces batch-shape response unwrapping that bloats the adapter.

**Out of scope:**
- Rewriting the Typeform briefing document `docs/teste-tecnico-automacoes.md`. That file is the original Ticto brief and stays historically accurate. The README covers the deviation narrative.
- Preserving `datacrazy_*` error classes for log-search continuity. Logs are replaced, not merged.
- Multi-property HubSpot associations (company / deal). teste técnico only requires contact creation.

---

## File Structure

**Rename:**
- `src/lib/datacrazy.ts` → `src/lib/hubspot.ts` — POST adapter, `postLead()` preserved
- `tests/unit/datacrazy.test.ts` → `tests/unit/hubspot.test.ts` — mirror tests with new env vars + endpoint

**Modify:**
- `src/lib/logger.ts` — swap `datacrazy_*` error classes for `hubspot_*`; rename `datacrazy_status`/`datacrazy_lead_id` fields on `lead.forwarded` event to `hubspot_status`/`hubspot_contact_id`
- `src/lib/env.server.ts` — drop `DATACRAZY_API_TOKEN` + `DATACRAZY_LEADS_ENDPOINT`, add `HUBSPOT_PRIVATE_APP_TOKEN` + optional `HUBSPOT_API_BASE`
- `src/lib/utm-mapping.ts` — rename `DatacrazyLeadPayload` → `HubspotContactPayload`, reshape into `{ properties }` envelope, rewrite builder
- `src/app/api/lead/route.ts` — import line + one log event field rename + payload variable rename
- `tests/unit/utm-mapping.test.ts` — payload-shape assertions
- `tests/e2e/lead-flow.spec.ts` — rename `DATACRAZY_HOST` constant + comment rewrite
- `playwright.config.ts` — swap `DATACRAZY_API_TOKEN` for `HUBSPOT_PRIVATE_APP_TOKEN` in forced webServer env
- `.github/workflows/ci.yml` — swap CI placeholder env var name
- `.env.example` — swap env var block
- `README.md` — replace "plan-gate discovery" section with "HubSpot adoption" section (keep the evidence narrative; flip the conclusion)

**Leave unchanged:**
- `src/app/api/lead/route.ts` pipeline stages 1–6 (HMAC verify, body parse, field parse, UTM map, submitted_at resolve, timeout/retry logic)
- `src/lib/webhook-auth.ts`, `src/lib/typeform-fields.ts`, `src/lib/attribution.ts`, `src/proxy.ts`
- All security invariants: PII redaction, 64 KB body limit, form_id check, HMAC-before-parse ordering

---

## Pre-flight (Johan only — must complete before Task 1)

These are external setup steps Claude cannot do from the CLI. Plan execution blocks until done.

- [ ] **H1: Create HubSpot Private App**
  Settings → Integrations → Private Apps → Create private app
  Name: `ticto-outlier-lp-lead-ingest`
  Scopes (minimum): `crm.objects.contacts.write`
  Click Create. Copy the access token (shown **once** — store immediately).

- [ ] **H2: Create 6 custom contact properties**
  Settings → Properties → Contact → Create property. For each, type = Single-line text unless noted:
  - `cpf` (Single-line text, group: Contact information)
  - `sells_online` (Single-line text — value will be `Sim` or `Não` from the Typeform choice)
  - `sck` (Single-line text)
  - `src` (Single-line text)
  - `landing_page` (Single-line text)
  - `captured_at` (Single-line text — stores ISO-8601 string; using text avoids HubSpot's date-picker epoch-ms coercion)
  Note: UTM properties (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) are **HubSpot-native** — do not create them.

- [ ] **H3: Add HubSpot env vars to Vercel**
  ```bash
  vercel env add HUBSPOT_PRIVATE_APP_TOKEN preview
  # paste token from H1
  vercel env add HUBSPOT_PRIVATE_APP_TOKEN production
  # paste same token
  ```
  (Do **not** remove `DATACRAZY_API_TOKEN` yet — wait until after the PR merges and the cutover is confirmed live. Until then, having both envs present is harmless: the new code does not read DATACRAZY_* anymore.)

- [ ] **H4: Confirm H1–H3 complete**
  Reply "HubSpot ready" to Claude before Task 1 begins.

---

## Task 1: Extend ErrorClass union and log-event field names

**Files:**
- Modify: `src/lib/logger.ts:1-8` and `src/lib/logger.ts:26-38`

- [ ] **Step 1: Update `ErrorClass` union**

Replace lines 1–8 of `src/lib/logger.ts`:

```ts
export type ErrorClass =
  | 'auth_invalid'
  | 'form_id_mismatch'
  | 'parse_error'
  | 'field_map_incomplete'
  | 'hubspot_4xx'
  | 'hubspot_5xx'
  | 'hubspot_timeout';
```

(Note: no `hubspot_duplicate` class — duplicates are success, not failure.)

- [ ] **Step 2: Rename fields on `lead.forwarded` event**

In the `lead.forwarded` discriminated union arm (lines ~26–38), rename:
- `datacrazy_status: number` → `hubspot_status: number`
- `datacrazy_lead_id: string | number | null` → `hubspot_contact_id: string | null` (HubSpot always returns string ids)

Update the masked-hint comment to reference HubSpot instead of Datacrazy.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL with errors in `src/app/api/lead/route.ts` and `src/lib/datacrazy.ts` referencing the old names. This is the consumer-side breakage we'll fix in later tasks. Proceed — do **not** silence.

- [ ] **Step 4: Commit**

```bash
git add src/lib/logger.ts
git commit -m "refactor(logger): swap datacrazy_* error classes for hubspot_*"
```

---

## Task 2: Update env schema

**Files:**
- Modify: `src/lib/env.server.ts:13-40`

- [ ] **Step 1: Swap the env schema block**

In `buildServerSchema`, replace the `DATACRAZY_API_TOKEN` and `DATACRAZY_LEADS_ENDPOINT` fields with:

```ts
HUBSPOT_PRIVATE_APP_TOKEN: z
  .string()
  .trim()
  .min(1, 'HUBSPOT_PRIVATE_APP_TOKEN is required'),
HUBSPOT_API_BASE: z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .url('HUBSPOT_API_BASE must be a valid URL')
    .refine((u) => u.startsWith('https://'), {
      message: 'HUBSPOT_API_BASE must use https',
    })
    .optional()
    .default('https://api.hubapi.com'),
),
```

Keep the `TYPEFORM_WEBHOOK_SECRET` and `TYPEFORM_FORM_ID` blocks exactly as-is.

- [ ] **Step 2: Run env unit tests**

Run: `pnpm test tests/unit/env.test.ts`
Expected: existing tests FAIL because they assert `DATACRAZY_*` keys. We'll fix them in Step 3.

- [ ] **Step 3: Update `tests/unit/env.test.ts`**

Find every reference to `DATACRAZY_API_TOKEN` / `DATACRAZY_LEADS_ENDPOINT` and rename to `HUBSPOT_PRIVATE_APP_TOKEN` / `HUBSPOT_API_BASE`. For the default-URL assertion, replace `https://api.g1.datacrazy.io/api/v1/leads` with `https://api.hubapi.com`.

- [ ] **Step 4: Run env tests again**

Run: `pnpm test tests/unit/env.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.server.ts tests/unit/env.test.ts
git commit -m "refactor(env): swap DATACRAZY_* for HUBSPOT_PRIVATE_APP_TOKEN and HUBSPOT_API_BASE"
```

---

## Task 3: Reshape the outbound payload

**Files:**
- Modify: `src/lib/utm-mapping.ts:13-61`

- [ ] **Step 1: Rename interface and reshape envelope**

Replace lines 13–20 of `src/lib/utm-mapping.ts`:

```ts
export interface HubspotContactPayload {
  properties: {
    email: string;
    firstname: string;
    phone: string;
    cpf?: string;
    sells_online?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    sck?: string;
    src?: string;
    landing_page?: string;
    captured_at?: string;
  };
}
```

- [ ] **Step 2: Rewrite the builder**

Replace the `buildDatacrazyPayload` function (lines 36–61) with:

```ts
export function buildHubspotContactPayload(ctx: {
  answers: AnswerByRef;
  utms: UtmValues;
  landingUrl: string;
  capturedAt: string;
}): HubspotContactPayload {
  const { answers, utms, landingUrl, capturedAt } = ctx;

  const properties: HubspotContactPayload['properties'] = {
    email: answers.email,
    firstname: answers.nome,
    phone: answers.telefone,
  };

  if (answers.cpf) properties.cpf = answers.cpf;
  if (answers.sells_online) properties.sells_online = answers.sells_online;

  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) (properties as Record<string, string>)[k] = v;
  }

  properties.landing_page = landingUrl;
  properties.captured_at = capturedAt;

  return { properties };
}
```

- [ ] **Step 3: Update utm-mapping unit tests**

In `tests/unit/utm-mapping.test.ts`, find assertions on the returned object's top-level keys (`out.name`, `out.email`, `out.phone`, `out.source`, `out.sourceReferral`, `out.notes`). Rename imports from `buildDatacrazyPayload` to `buildHubspotContactPayload`. Replace each assertion with its `out.properties.<key>` equivalent:

- `out.name` → `out.properties.firstname`
- `out.email` → `out.properties.email`
- `out.phone` → `out.properties.phone`
- `out.source` → gone (HubSpot handles native via `utm_source`)
- `out.sourceReferral.sourceUrl` → `out.properties.landing_page`
- `out.notes` (JSON.parse) → flat `out.properties.utm_source`, `out.properties.sck`, `out.properties.src`, `out.properties.captured_at` assertions

Preserve every existing test **case** (same fixtures, same semantic coverage); only the assertion targets change.

- [ ] **Step 4: Run utm-mapping tests**

Run: `pnpm test tests/unit/utm-mapping.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utm-mapping.ts tests/unit/utm-mapping.test.ts
git commit -m "refactor(payload): swap DatacrazyLeadPayload for HubspotContactPayload with properties envelope"
```

---

## Task 4: Rename adapter + reshape body wrapper

**Files:**
- Rename: `src/lib/datacrazy.ts` → `src/lib/hubspot.ts`
- Modify: the renamed file

- [ ] **Step 1: Rename the file**

```bash
git mv src/lib/datacrazy.ts src/lib/hubspot.ts
```

- [ ] **Step 2: Rewrite the renamed file**

Replace the full contents of `src/lib/hubspot.ts` with:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: remaining errors only in `src/app/api/lead/route.ts` and `tests/unit/datacrazy.test.ts` (the latter still imports from the old path). We'll fix these next.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hubspot.ts
git commit -m "refactor(crm): rename datacrazy.ts to hubspot.ts with HubSpot Contacts v3 endpoint and 409-as-success"
```

---

## Task 5: Update the route handler

**Files:**
- Modify: `src/app/api/lead/route.ts:6-7`, `:246`, `:261-284`

- [ ] **Step 1: Swap imports (lines 6–7)**

```ts
import { mapUtms, buildHubspotContactPayload } from '@/lib/utm-mapping';
import { postLead } from '@/lib/hubspot';
```

- [ ] **Step 2: Rename the built payload variable (around line 246)**

Replace:

```ts
const datacrazyPayload = buildDatacrazyPayload({
```

with:

```ts
const hubspotPayload = buildHubspotContactPayload({
```

Also rename the subsequent `postLead(datacrazyPayload)` call (line ~261) to `postLead(hubspotPayload)`.

- [ ] **Step 3: Rename log event fields (line ~272 and ~283–284)**

In the failure log:
- `error_message: \`datacrazy ${crm.status}: ${crm.bodySnippet}\`` → `error_message: \`hubspot ${crm.status}: ${crm.bodySnippet}\``

In the success `lead.forwarded` log:
- `datacrazy_status: crm.status` → `hubspot_status: crm.status`
- `datacrazy_lead_id: crm.leadId` → `hubspot_contact_id: crm.leadId`

- [ ] **Step 4: Replace top-of-file comments that mention Datacrazy by name**

Update line 21's "validate at the trust boundary so Datacrazy records don't accumulate" comment and the line-160 + line-242 + line-253–255 + line-270 + line-277 comments. Keep the semantic content; only the noun changes. Do **not** rewrite comment bodies beyond the noun swap.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. All consumers now aligned.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/lead/route.ts
git commit -m "refactor(route): point /api/lead at HubSpot adapter with renamed log fields"
```

---

## Task 6: Rewrite the adapter unit tests

**Files:**
- Rename: `tests/unit/datacrazy.test.ts` → `tests/unit/hubspot.test.ts`
- Modify: the renamed test file

- [ ] **Step 1: Rename**

```bash
git mv tests/unit/datacrazy.test.ts tests/unit/hubspot.test.ts
```

- [ ] **Step 2: Rewrite imports + env setup**

Replace the top-of-file imports and `beforeEach` env setup:

```ts
import type { HubspotContactPayload } from '@/lib/utm-mapping';

beforeEach(() => {
  vi.resetModules();
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = 'pat_test_abc';
  delete process.env.HUBSPOT_API_BASE;
  process.env.TYPEFORM_WEBHOOK_SECRET = 'dev-placeholder-secret-16ch';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
});

afterEach(() => {
  delete process.env.HUBSPOT_API_BASE;
});
```

- [ ] **Step 3: Update the test fixture payload**

```ts
const payload: HubspotContactPayload = {
  properties: {
    email: 'test@example.com',
    firstname: 'Test User',
    phone: '+5511988887777',
    utm_source: 'linkedin',
  },
};
```

- [ ] **Step 4: Update endpoint assertions**

Every test that asserts the outbound URL must now expect `https://api.hubapi.com/crm/v3/objects/contacts`. The `HUBSPOT_API_BASE` override test should assert the base flips while the `/crm/v3/objects/contacts` path stays constant.

- [ ] **Step 5: Add a 409-duplicate test case**

Inside the `describe('lib/hubspot', () => { ... })` block, add:

```ts
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
```

- [ ] **Step 6: Update error-class assertions**

Every `expect(res.errorClass).toBe('datacrazy_4xx')` / `'datacrazy_5xx'` / `'datacrazy_timeout'` flips to the `hubspot_*` counterpart.

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm test`
Expected: PASS — now 62/62 (61 previous + 1 new 409 test).

- [ ] **Step 8: Commit**

```bash
git add tests/unit/hubspot.test.ts
git commit -m "test(hubspot): port adapter tests to HubSpot endpoint with 409-duplicate case"
```

---

## Task 7: Update E2E + Playwright + CI env injections

**Files:**
- Modify: `tests/e2e/lead-flow.spec.ts:9` and :170-213 (comments), `playwright.config.ts:34-43`, `.github/workflows/ci.yml:42`

- [ ] **Step 1: `tests/e2e/lead-flow.spec.ts`**

Rename the constant:

```ts
const HUBSPOT_HOST = 'api.hubapi.com';
```

Update the `page.route` selector: `` `**://${DATACRAZY_HOST}/**` `` → `` `**://${HUBSPOT_HOST}/**` ``.

Rewrite the deviation comment block (lines ~170–179) — same semantic content, replace "Datacrazy" with "HubSpot" and update the route-target reference to `/crm/v3/objects/contacts`. Rewrite the comment at lines ~208–214 to reference `HUBSPOT_PRIVATE_APP_TOKEN` instead of `DATACRAZY_API_TOKEN`. The 500 assertion stays — HubSpot rejects the `pat_live_test` placeholder with 401, which our handler still maps to 500 `crm_failed`.

- [ ] **Step 2: `playwright.config.ts`**

In the forced `webServer.env` block:

```ts
env: {
  HUBSPOT_PRIVATE_APP_TOKEN: 'e2e-test-token',
  TYPEFORM_WEBHOOK_SECRET: 'dev-placeholder-secret',
  TYPEFORM_FORM_ID: 'FbFMsO5x',
  NEXT_PUBLIC_TYPEFORM_FORM_ID: 'FbFMsO5x',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
},
```

Also update the comment at line 34: `DATACRAZY_API_TOKEN` → `HUBSPOT_PRIVATE_APP_TOKEN`.

- [ ] **Step 3: `.github/workflows/ci.yml`**

Swap:
```yaml
DATACRAZY_API_TOKEN: ci-placeholder-token
```
for:
```yaml
HUBSPOT_PRIVATE_APP_TOKEN: ci-placeholder-token
```

- [ ] **Step 4: Run tests locally**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lead-flow.spec.ts playwright.config.ts .github/workflows/ci.yml
git commit -m "test(e2e): retarget Playwright mock and CI placeholder env to HubSpot"
```

---

## Task 8: Update `.env.example` and README narrative

**Files:**
- Modify: `.env.example:2-5`, `README.md:31-89` (the plan-gate section)

- [ ] **Step 1: `.env.example`**

Replace the Datacrazy block with:

```bash
# HubSpot CRM (server-only) — Bearer token from a Private App.
# Create at Settings → Integrations → Private Apps.
# Minimum scope: crm.objects.contacts.write
HUBSPOT_PRIVATE_APP_TOKEN=

# Optional — override the HubSpot API base URL (defaults to api.hubapi.com).
# HUBSPOT_API_BASE=
```

- [ ] **Step 2: `README.md`**

Replace the `## Descoberta durante o teste: o plan-gate do Datacrazy é resource-level, não route-specific` section (lines ~31–89) with a new `## Integração CRM: HubSpot` section that:

1. Opens with the plan-gate discovery as **motivation** (one paragraph citing the two Datacrazy 400 responses already documented in git history — link to commit `a1b5901`).
2. Explains the swap: "`src/lib/datacrazy.ts` → `src/lib/hubspot.ts` swapping the POST target to HubSpot's Contacts v3 API. Pipeline layers 1–6 (HMAC, parse, UTM map, build, timeout, retry) unchanged."
3. Lists the new env vars (`HUBSPOT_PRIVATE_APP_TOKEN`, optional `HUBSPOT_API_BASE`).
4. Documents the **duplicate-email idempotent-success** design decision with one sentence of rationale.
5. Keeps the "por que isso fortalece a entrega" closer intact — the 7-layer pipeline argument is unchanged, only the final layer's destination is new.

Do not delete the 7-layer proof bullet list — it's the strongest evidence in the README.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: replace plan-gate section with HubSpot integration narrative"
```

---

## Task 9: Full validation + push + PR

- [ ] **Step 1: Final local validation**

```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expected: all three PASS, 62/62 unit tests.

- [ ] **Step 2: Grep for stragglers**

```bash
grep -rn "datacrazy\|Datacrazy\|DATACRAZY" src tests .github .env.example playwright.config.ts README.md
```
Expected: **zero matches** in these paths. The only acceptable surviving reference is in `docs/teste-tecnico-automacoes.md` (the original Ticto brief — out of scope per plan header).

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/swap-datacrazy-for-hubspot
gh pr create --title "feat(crm): swap Datacrazy for HubSpot Contacts v3 (Free-tier unblock)" --body "$(cat <<'EOF'
## Summary
- Replace Datacrazy CRM adapter with HubSpot Contacts v3 (`POST /crm/v3/objects/contacts`).
- Pipeline layers 1–6 untouched; only the final CRM POST target swaps.
- Unblocks the Free-tier plan-gate documented in the prior Datacrazy narrative.

## Test plan
- [x] `pnpm typecheck` — clean
- [x] `pnpm lint` — clean
- [x] `pnpm test` — 62/62 (added 409-duplicate-as-success case)
- [ ] CI green on PR
- [ ] Preview deploy succeeds, live Typeform submit lands a contact in HubSpot UI

## Invariants unchanged
- HMAC-SHA256 base64 with `timingSafeEqual`, 60s future / 48h past replay window
- PII redaction (`j***@domain.com`, `***-1234`, `J***`)
- 64 KB body cap, `form_id` verified against `TYPEFORM_FORM_ID`
- `src/proxy.ts` still headers-only
- No Zapier/Make/n8n reintroduction

## Reviewer preamble
Scoped migration — any diff outside the CRM adapter, env schema, tests, README, and CI env placeholders is a finding, not intended.
EOF
)"
```

- [ ] **Step 4: Wait for CI + preview**

`gh pr checks <n> --watch --interval 15`
Expected: ci, e2e, Analyze (actions), Analyze (javascript-typescript), CodeQL, Vercel Preview all green.

---

## Post-merge (Johan only)

- [ ] **M1: Live smoke test on preview**
  Submit the real Typeform once. Open HubSpot → Contacts and confirm the new contact row has: `firstname`, `email`, `phone`, `cpf`, `sells_online`, `utm_source` (and siblings), `landing_page`, `captured_at`.

- [ ] **M2: Remove legacy Vercel envs**
  Only after M1 confirms the cutover:
  ```bash
  vercel env rm DATACRAZY_API_TOKEN production
  vercel env rm DATACRAZY_API_TOKEN preview
  vercel env rm DATACRAZY_LEADS_ENDPOINT preview   # if set
  ```

- [ ] **M3: Update delivery notes / demo script**
  Flip the narrative from "Free-tier plan-gate blocks this" to "HubSpot free tier accepts the lead; here's the row."

---

## Self-Review Checklist (Claude, before handing off)

- Spec coverage: migration goal, env schema, payload reshape, adapter swap, route-handler touch, tests, e2e, CI, docs, post-merge cleanup — all covered.
- Placeholder scan: no "TBD" / "TODO" / "similar to Task N" — every task has exact paths + code + commands + commit strings.
- Type consistency: `HubspotContactPayload`, `PostLeadResult`, `PostLeadSuccess.duplicate`, `hubspot_contact_id`, `hubspot_status`, `extractContactId` names used consistently across Tasks 1–6.
- No regression to invariants: AGENTS.md Core Invariants (server-side secrets, PII redaction, HMAC-before-parse, no middleware SaaS) preserved.
