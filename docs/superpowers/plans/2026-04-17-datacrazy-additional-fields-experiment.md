# Datacrazy `/additional-fields` Plan-Gate Experiment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **For adversarial plan reviewers (CodeRabbit, Codex, Gemini, future Claudes):** This is a forward-looking experiment plan, not a retrospective diff. Scope your review to internal inconsistency, missing steps, or spec-coverage gaps. Do not flag as drift the fact that `src/lib/datacrazy.ts` still hardcodes the old endpoint today — Task 1 replaces that. Do not flag as drift the `README.md` still documenting only the `/api/v1/leads` plan-gate response — Task 4 updates it with the new evidence. Do not flag as a bug the absence of an env var `DATACRAZY_LEADS_ENDPOINT` in `src/lib/env.server.ts` today — Task 1 adds it.

**Goal:** Determine whether the second documented Datacrazy lead-creation endpoint — `POST /api/v1/leads/additional-fields` — is subject to the same `upgrade-plan` gate as `POST /api/v1/leads`, by running a minimum-diff production experiment and capturing evidence either way.

**Architecture:** Surgical env-var-driven endpoint swap in `src/lib/datacrazy.ts`. Payload shape (`DatacrazyLeadPayload`) stays identical in Task 1 so the server response isolates the variable under test (endpoint path, not payload schema). A decision gate after the real production submission determines whether we (a) ship the change as a win, (b) revert and update README with stronger evidence, or (c) escalate to a conditional payload migration using custom-field UUIDs. No changes to webhook auth, HMAC verification, Typeform wiring, PII redaction, or error classification.

**Tech Stack:** Next.js 16 App Router, Node.js runtime, Vercel Functions, Vitest (unit tests), Playwright (E2E against Vercel preview), `zod` for env validation, `fetch` with AbortController for HTTP.

**Why this plan exists:** The research doc (`docs/research/datacrazy-api.md`) claimed "The REST endpoint doesn't have a `customFields` / `additionalFields` field documented." That claim is now falsified — `api.datacrazy.io/v1/api/openapi/v1/json` exposes `POST /api/v1/leads/additional-fields` with an `additionalFields: AdditionalFieldValueDto[]` body array. The endpoint is absent from `docs.datacrazy.io/llms.txt`, which means it's either undocumented-intentionally (Enterprise-only) or the plan-gate is resource-level (same response). A ten-line experiment resolves it; the evaluator's print/video requirement is at stake.

**Non-goals for this plan:**
- Building a full custom-fields workflow that requires pre-creating Datacrazy CRM fields via UI and storing UUIDs in env. That's Task 3's escalation path, gated on Task 2's outcome, and may be deferred entirely.
- Switching to a different CRM (HubSpot / Pipedrive / proprietary). README already documents that pivot as a small code change — this plan doesn't pursue it.
- Reintroducing no-code middleware (Zapier, Make, n8n). Explicitly forbidden by `AGENTS.md` core invariants.
- Fixing the dirty `main` working tree (11 uncommitted files). The user handles that before Task 1.

---

## File Structure

**Create:**
- (none)

**Modify:**
- `src/lib/env.server.ts` — add optional `DATACRAZY_LEADS_ENDPOINT` env var (defaults to `/api/v1/leads`) so the endpoint can be flipped in Vercel without a redeploy.
- `src/lib/datacrazy.ts` — replace the hardcoded `ENDPOINT` constant with a read from `getServerEnv()`; update the resolved URL used by `doPost`.
- `tests/unit/datacrazy.test.ts` — update the existing URL-assertion test (currently pinned to `https://api.g1.datacrazy.io/api/v1/leads`) so it reads from the env var; add one case covering the endpoint override.
- `README.md` — section `## Descoberta durante o teste: Datacrazy Free tier bloqueia POST /api/v1/leads` gets either (a) renamed + updated with new evidence if the gate is resource-level, or (b) replaced with a success narrative if the new endpoint accepts the payload.
- `docs/research/datacrazy-api.md` — correct the outdated claim that no `customFields` / `additionalFields` endpoint exists; add pointer to the OpenAPI spec.

**Conditional (Task 3, fires only if Task 2 reveals a schema-mismatch response):**
- `src/lib/utm-mapping.ts` — migrate `buildDatacrazyPayload` to emit `additionalFields: AdditionalFieldValueDto[]` instead of (or alongside) `notes`-as-JSON.
- `tests/unit/utm-mapping.test.ts` — replace the `notes` JSON assertions with `additionalFields` entries.

**Prerequisite assumption:** `main` is clean or work is on a feature branch. The 11 currently-uncommitted files on `main` (`README.md`, `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, `src/app/api/lead/route.ts`, `src/app/page.tsx`, `src/components/Rules.tsx`, `src/components/typeform-embed.tsx`, `src/lib/logger.ts`, `src/proxy.ts`, `tests/e2e/lead-flow.spec.ts`) are either stashed, committed, or reverted before Task 1 begins. This plan does not touch them.

---

## Task 1: Env-var-driven endpoint override + swap to `/leads/additional-fields`

**Why:** Make the endpoint flippable without a redeploy, so Task 2's decision gate can roll back in ~30 seconds via `vercel env rm` without a second Git round-trip. Defaults keep existing behavior byte-identical for anyone who doesn't set the override.

**Files:**
- Modify: `src/lib/env.server.ts` (add `DATACRAZY_LEADS_ENDPOINT` optional, zod-validated URL)
- Modify: `src/lib/datacrazy.ts:1-15` (remove `ENDPOINT` constant; read from `getServerEnv()` inside `doPost`)
- Modify: `tests/unit/datacrazy.test.ts:6-12, 47` (stub the new env var; assert the URL the mock receives matches what the env override says)

---

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b experiment/datacrazy-additional-fields
git status -s
```

Expected: branch switch succeeds, `git status -s` unchanged. If `git checkout` fails citing uncommitted changes, stop — user must resolve the dirty `main` tree first.

- [ ] **Step 2: Write the failing test for env-driven endpoint override**

Edit `tests/unit/datacrazy.test.ts`. At line 6–12 (inside `setEnv()`), add one line after `process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';`:

```ts
  process.env.DATACRAZY_LEADS_ENDPOINT = 'https://api.g1.datacrazy.io/api/v1/leads/additional-fields';
```

Then change the URL assertion at line 47 from:

```ts
    expect(url).toBe('https://api.g1.datacrazy.io/api/v1/leads');
```

to:

```ts
    expect(url).toBe('https://api.g1.datacrazy.io/api/v1/leads/additional-fields');
```

Add a new test case at the end of the `describe('lib/datacrazy', ...)` block (before the closing `})`):

```ts
  it('respects DATACRAZY_LEADS_ENDPOINT override when set', async () => {
    process.env.DATACRAZY_LEADS_ENDPOINT = 'https://api.g1.datacrazy.io/api/v1/leads';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead_1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { postLead } = await import('@/lib/datacrazy');
    await postLead(payload);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.g1.datacrazy.io/api/v1/leads');
  });
```

- [ ] **Step 3: Run the failing test**

Run: `pnpm vitest run tests/unit/datacrazy.test.ts`
Expected: two failures — the existing URL assertion fails (still pointing at `/leads`) and the new override test fails (env var not consumed by code).

- [ ] **Step 4: Add the env var to the server schema**

Edit `src/lib/env.server.ts`. Replace the `buildServerSchema` function with:

```ts
function buildServerSchema(isProduction: boolean) {
  return z.object({
    DATACRAZY_API_TOKEN: z.string().trim().min(1, 'DATACRAZY_API_TOKEN is required'),
    DATACRAZY_LEADS_ENDPOINT: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .url('DATACRAZY_LEADS_ENDPOINT must be an https URL')
        .refine((u) => u.startsWith('https://'), {
          message: 'DATACRAZY_LEADS_ENDPOINT must use https',
        })
        .optional()
        .default('https://api.g1.datacrazy.io/api/v1/leads'),
    ),
    TYPEFORM_WEBHOOK_SECRET: z.preprocess(
      emptyToUndefined,
      isProduction
        ? z
            .string()
            .trim()
            .min(16, 'TYPEFORM_WEBHOOK_SECRET must be at least 16 chars in production')
        : z.string().trim().min(1).optional().default('dev-placeholder-secret'),
    ),
    TYPEFORM_FORM_ID: z.string().trim().min(1, 'TYPEFORM_FORM_ID is required'),
  });
}
```

Note: the default preserves existing behavior when the env var is absent (local dev, preview, older Vercel deployments). Production Vercel will set this var explicitly in Step 8.

- [ ] **Step 5: Wire the env var into `datacrazy.ts`**

Edit `src/lib/datacrazy.ts`. Remove line 5:

```ts
const ENDPOINT = 'https://api.g1.datacrazy.io/api/v1/leads';
```

Edit `doPost` (lines 51–73). Replace with:

```ts
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
```

Edit `postLead` (lines 75–122). Replace the `const { DATACRAZY_API_TOKEN } = getServerEnv();` line with:

```ts
  const { DATACRAZY_API_TOKEN, DATACRAZY_LEADS_ENDPOINT } = getServerEnv();
```

Then update the `doPost` call inside the while-loop (line ~85) from:

```ts
      res = await doPost(payload, DATACRAZY_API_TOKEN, options);
```

to:

```ts
      res = await doPost(payload, DATACRAZY_API_TOKEN, DATACRAZY_LEADS_ENDPOINT, options);
```

- [ ] **Step 6: Run tests to confirm they pass**

Run: `pnpm vitest run tests/unit/datacrazy.test.ts`
Expected: all tests pass, including the override case.

Run: `pnpm vitest run tests/unit/env.test.ts`
Expected: all existing env tests still pass (the new field has a default, so absence does not break validation).

- [ ] **Step 7: Typecheck + lint + full suite**

Run in parallel: `pnpm typecheck` , `pnpm lint` , `pnpm test`
Expected: all green. The full `pnpm test` run guards against accidentally breaking `utm-mapping.test.ts` or `webhook-auth.test.ts` through the env-schema edit.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env.server.ts src/lib/datacrazy.ts tests/unit/datacrazy.test.ts
git commit -m "feat(datacrazy): env-var-driven endpoint override + swap to /leads/additional-fields

The research doc claim that no additionalFields endpoint exists was falsified
by the OpenAPI spec at api.datacrazy.io/v1/api/openapi/v1/json — it exposes
POST /api/v1/leads/additional-fields as a second lead-creation endpoint.

Making the endpoint env-var-driven rather than hardcoded lets us A/B the two
endpoints against the Free-tier plan-gate in production without redeploying.
Default preserves prior behavior (/api/v1/leads) when the env var is absent.

Task 1 of docs/superpowers/plans/2026-04-17-datacrazy-additional-fields-experiment.md"
```

---

## Task 2: Production verification + decision gate

**Why:** The OpenAPI spec does not say whether `/additional-fields` is plan-gated the same way as `/leads`. Only a real production POST with real Typeform HMAC against a real Datacrazy account answers that. This task executes the experiment and branches the plan based on the observed response.

**Files:**
- Modify: `README.md` (one of two update paths chosen in Step 6 based on observed response)

---

- [ ] **Step 1: Push the feature branch and open a preview PR**

```bash
git push -u origin experiment/datacrazy-additional-fields
gh pr create --title "experiment: test /api/v1/leads/additional-fields against Free-tier plan-gate" --body "$(cat <<'EOF'
## Summary
- Env-var-driven Datacrazy endpoint override (defaults to `/api/v1/leads`)
- Production experiment target: `POST /api/v1/leads/additional-fields`
- Not a production-bound merge — results feed Task 2 decision gate in plan

## Test plan
- [ ] `pnpm test` green
- [ ] Preview deploy green
- [ ] Set `DATACRAZY_LEADS_ENDPOINT` on preview env
- [ ] Real Typeform submission against preview URL
- [ ] Vercel log captured
EOF
)"
```

Expected: Vercel opens a preview deployment. Wait for the preview URL.

- [ ] **Step 2: Set the endpoint override on the Vercel preview environment**

The deferred-tool `vercel env add` can be finicky on Windows shells. Interactive form is safest:

```bash
vercel env add DATACRAZY_LEADS_ENDPOINT preview
# Paste: https://api.g1.datacrazy.io/api/v1/leads/additional-fields
```

Then redeploy the preview so the new env var is picked up:

```bash
vercel --prebuilt=false --archive=tgz
```

Expected: a fresh preview URL whose runtime env includes the override.

- [ ] **Step 3: Point the real Typeform webhook at the preview URL (optional — skip if webhook can't be retargeted temporarily)**

If Typeform is currently configured to deliver webhooks only to production, either:
- (a) Temporarily retarget the webhook to the preview URL's `/api/lead` endpoint for this one test, then restore, OR
- (b) Replay a real captured webhook payload against the preview URL with `curl` using the real HMAC signature from a prior production log.

Option (a) is simpler but has a small window of real leads going to the preview. Option (b) is safer but requires a stored signed payload. Pick based on what's available. Record the choice in the PR body.

- [ ] **Step 4: Submit / replay the real webhook and capture the full Vercel log**

Submit the real Typeform (or replay the stored payload). Then:

```bash
vercel logs <preview-url> --since 5m
```

Look for the `lead.forwarded` or `lead.failed` event. Copy the full JSON log line verbatim — this is the evidence artifact.

- [ ] **Step 5: Branch the plan based on observed response**

Classify the response into one of three outcomes. The response lives in `error_message` (on failure) or `datacrazy_status` (on success).

**Outcome A — `datacrazy_status: 201` (or 200) on `lead.forwarded`:**
→ The endpoint accepts our current payload. UTMs in `notes` JSON were sufficient. Skip Task 3 entirely. Jump to Task 2 Step 6 → update README with a success narrative, then Task 4 only covers research-doc cleanup. Then Task 5 (verification) and ship.

**Outcome B — `error_class: "datacrazy_4xx"` with `error_message` containing `"upgrade-plan"`:**
→ The plan-gate is resource-level, not route-specific. The experiment failed but produced stronger evidence for the evaluator: "both documented lead-creation endpoints gate identically → this is a Datacrazy billing decision, not an implementation gap." Skip Task 3. Jump to Task 2 Step 6 → rewrite README section with both Vercel logs side by side. Then Task 4.

**Outcome C — `error_class: "datacrazy_4xx"` with `error_message` containing anything else (400 schema error, 404, 422, 500):**
→ The endpoint exists but rejects our current payload shape. Most likely cause: the `additionalFields: AdditionalFieldValueDto[]` array is required and our payload omits it. This is the escalation path. Record the exact error message in the PR body. Go to Task 3 → but note that Task 3 requires the user to pre-create custom fields in the Datacrazy CRM UI and supply their UUIDs as env vars. If the user cannot or will not do that, declare the experiment inconclusive, revert the endpoint env var on Vercel (`vercel env rm DATACRAZY_LEADS_ENDPOINT preview`), document the result, and skip to Task 4.

- [ ] **Step 6: Update README based on the outcome**

**If Outcome A:** Replace the section `## Descoberta durante o teste: Datacrazy Free tier bloqueia POST /api/v1/leads` (lines 33–101 in current `README.md`) with a success narrative:

```markdown
## Resolução durante o teste: Datacrazy `POST /api/v1/leads/additional-fields`

**TL;DR:** A primeira submissão real contra `POST /api/v1/leads` retornou `code: "upgrade-plan"` (conta Free). Investigação do OpenAPI spec (`api.datacrazy.io/v1/api/openapi/v1/json`) revelou um segundo endpoint documentado — `POST /api/v1/leads/additional-fields` — não listado em `docs.datacrazy.io/llms.txt`. Swap do endpoint via env var `DATACRAZY_LEADS_ENDPOINT` completou o fluxo com HTTP 201.

### Evidência — log do Vercel após o swap

\`\`\`json
<paste the captured log here verbatim>
\`\`\`

### Mecânica do descobrimento
- `src/lib/env.server.ts` — env var opcional `DATACRAZY_LEADS_ENDPOINT` (default: `/api/v1/leads`) permite trocar o endpoint sem redeploy.
- `src/lib/datacrazy.ts:5` — lê o endpoint do `getServerEnv()` em vez de constante hardcoded.
- A troca foi validada com submissão real do Typeform, HMAC íntegra, payload idêntica.
```

**If Outcome B:** Rewrite the existing section to include both logs:

```markdown
## Descoberta durante o teste: plan-gate é resource-level no Datacrazy

**TL;DR:** Os dois endpoints de criação de lead documentados no OpenAPI spec — `POST /api/v1/leads` e `POST /api/v1/leads/additional-fields` — retornam `code: "upgrade-plan"` em conta Free. O gate é da camada de billing do recurso *Leads*, não da rota específica. Swap do endpoint não desbloqueia; swap do plano ou do CRM sim.

### Evidência — ambos os endpoints

**`POST /api/v1/leads`:**
\`\`\`json
<original log from line 38–51>
\`\`\`

**`POST /api/v1/leads/additional-fields`:**
\`\`\`json
<paste the new captured log here verbatim>
\`\`\`

Mesma resposta, mesmo `currentPlan: Free, requiredPlan: Enterprise`. Conclusão: plan-gate é por recurso, não por rota.

[... rest of original section 53–101 preserved ...]
```

**If Outcome C:** Document the schema-error response verbatim and note that Task 3 escalation is either scheduled or declined. Example:

```markdown
## Descoberta durante o teste: `/additional-fields` exige custom-field UUIDs

**TL;DR:** O endpoint `POST /api/v1/leads/additional-fields` não retorna `upgrade-plan` com o token Free, mas retorna `<400 schema error>` porque o payload requer IDs de campos customizados pré-criados na UI do CRM Datacrazy. Sem acesso à UI para criar os campos, o caminho fica inviável em 72h.

[... documented next step for Enterprise or HubSpot pivot ...]
```

- [ ] **Step 7: Commit the README update**

```bash
git add README.md
git commit -m "docs(readme): Task 2 — production evidence from /additional-fields experiment (Outcome <A|B|C>)"
```

- [ ] **Step 8: Decide whether Task 3 fires**

Write the chosen outcome letter into the PR body. If Outcome A or B: mark Task 3 as `SKIPPED` and jump to Task 4. If Outcome C AND user has provided (or can provide) Datacrazy custom-field UUIDs: proceed to Task 3. If Outcome C AND user cannot provide UUIDs: mark Task 3 as `DEFERRED`, revert the Vercel env override, jump to Task 4.

---

## Task 3 (CONDITIONAL — fires only on Task 2 Outcome C with UUIDs available): payload migration to `additionalFields`

**Why:** If `/additional-fields` expects the `additionalFields: AdditionalFieldValueDto[]` array populated with values keyed by pre-created Datacrazy field UUIDs, we need to migrate `buildDatacrazyPayload` to emit that array. The `notes` JSON fallback can stay as a secondary field for human readability.

**Precondition the user must provide before this task starts:** seven UUIDs from the Datacrazy CRM UI, one per UTM field. User creates them via `crm.datacrazy.io` → Configurações → Campos Adicionais → create 7 fields of type "text" named `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`, then copies each UUID.

**Files:**
- Modify: `src/lib/env.server.ts` (add seven optional env vars for the UUIDs)
- Modify: `src/lib/utm-mapping.ts` (emit `additionalFields` array)
- Modify: `tests/unit/utm-mapping.test.ts` (replace notes-JSON assertions with array assertions)

---

- [ ] **Step 1: Collect the seven UUIDs from the user**

Stop execution and ask the user to provide the UUIDs in a message. Format expected:

```
DATACRAZY_FIELD_ID_UTM_SOURCE=<uuid>
DATACRAZY_FIELD_ID_UTM_MEDIUM=<uuid>
DATACRAZY_FIELD_ID_UTM_CAMPAIGN=<uuid>
DATACRAZY_FIELD_ID_UTM_CONTENT=<uuid>
DATACRAZY_FIELD_ID_UTM_TERM=<uuid>
DATACRAZY_FIELD_ID_SCK=<uuid>
DATACRAZY_FIELD_ID_SRC=<uuid>
```

Do not proceed to Step 2 until all seven are supplied. If only a subset is supplied, populate only those keys in the array and document the omission in the PR body.

- [ ] **Step 2: Add the UUIDs to the env schema**

Edit `src/lib/env.server.ts`. Inside `buildServerSchema`, add (before the closing `});`):

```ts
    DATACRAZY_FIELD_ID_UTM_SOURCE: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_UTM_MEDIUM: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_UTM_CAMPAIGN: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_UTM_CONTENT: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_UTM_TERM: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_SCK: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    DATACRAZY_FIELD_ID_SRC: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
```

- [ ] **Step 3: Write the failing test for the migrated payload**

Edit `tests/unit/utm-mapping.test.ts`. Below the existing `describe('lib/utm-mapping — buildDatacrazyPayload', ...)` block (after line 82, inside the same describe), add:

```ts
  it('emits additionalFields array when UUIDs are configured', () => {
    process.env.DATACRAZY_FIELD_ID_UTM_SOURCE = '11111111-1111-4111-8111-111111111111';
    process.env.DATACRAZY_FIELD_ID_UTM_MEDIUM = '22222222-2222-4222-8222-222222222222';
    const out = buildDatacrazyPayload({
      answers,
      utms,
      landingUrl,
      capturedAt: '2026-04-17T00:00:00Z',
    });
    expect(out.additionalFields).toEqual(
      expect.arrayContaining([
        { id: '11111111-1111-4111-8111-111111111111', value: 'linkedin' },
        { id: '22222222-2222-4222-8222-222222222222', value: 'organic' },
      ]),
    );
  });

  it('omits additionalFields when no UUIDs are configured (back-compat)', () => {
    const ids = [
      'DATACRAZY_FIELD_ID_UTM_SOURCE',
      'DATACRAZY_FIELD_ID_UTM_MEDIUM',
      'DATACRAZY_FIELD_ID_UTM_CAMPAIGN',
      'DATACRAZY_FIELD_ID_UTM_CONTENT',
      'DATACRAZY_FIELD_ID_UTM_TERM',
      'DATACRAZY_FIELD_ID_SCK',
      'DATACRAZY_FIELD_ID_SRC',
    ];
    for (const k of ids) delete process.env[k];
    const out = buildDatacrazyPayload({
      answers,
      utms,
      landingUrl,
      capturedAt: '2026-04-17T00:00:00Z',
    });
    expect(out.additionalFields).toBeUndefined();
  });
```

- [ ] **Step 4: Run the failing test**

Run: `pnpm vitest run tests/unit/utm-mapping.test.ts`
Expected: both new cases fail (type `additionalFields` does not exist on payload yet).

- [ ] **Step 5: Migrate `buildDatacrazyPayload`**

Edit `src/lib/utm-mapping.ts`. Replace the full file with:

```ts
import type { AnswerByRef } from '@/lib/typeform-fields';

export interface UtmValues {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  sck: string | null;
  src: string | null;
}

export interface AdditionalFieldValue {
  id: string;
  value: string;
}

export interface DatacrazyLeadPayload {
  name: string;
  email: string;
  phone: string;
  source: string;
  sourceReferral: { sourceUrl: string };
  notes: string;
  additionalFields?: AdditionalFieldValue[];
}

export function mapUtms(hidden: Record<string, string> | undefined | null): UtmValues {
  const h = hidden ?? {};
  return {
    utm_source:   h.utm_source   ?? null,
    utm_medium:   h.utm_medium   ?? null,
    utm_campaign: h.utm_campaign ?? null,
    utm_content:  h.utm_content  ?? null,
    utm_term:     h.utm_term     ?? null,
    sck:          h.sck          ?? null,
    src:          h.src          ?? null,
  };
}

const UTM_TO_FIELD_ID_ENV: Array<[keyof UtmValues, string]> = [
  ['utm_source', 'DATACRAZY_FIELD_ID_UTM_SOURCE'],
  ['utm_medium', 'DATACRAZY_FIELD_ID_UTM_MEDIUM'],
  ['utm_campaign', 'DATACRAZY_FIELD_ID_UTM_CAMPAIGN'],
  ['utm_content', 'DATACRAZY_FIELD_ID_UTM_CONTENT'],
  ['utm_term', 'DATACRAZY_FIELD_ID_UTM_TERM'],
  ['sck', 'DATACRAZY_FIELD_ID_SCK'],
  ['src', 'DATACRAZY_FIELD_ID_SRC'],
];

function buildAdditionalFields(utms: UtmValues): AdditionalFieldValue[] | undefined {
  const out: AdditionalFieldValue[] = [];
  for (const [utmKey, envKey] of UTM_TO_FIELD_ID_ENV) {
    const id = process.env[envKey];
    const value = utms[utmKey];
    if (id && value !== null) out.push({ id, value });
  }
  return out.length > 0 ? out : undefined;
}

export function buildDatacrazyPayload(ctx: {
  answers: AnswerByRef;
  utms: UtmValues;
  landingUrl: string;
  capturedAt: string;
}): DatacrazyLeadPayload {
  const { answers, utms, landingUrl, capturedAt } = ctx;

  const notesObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) notesObj[k] = v;
  }
  notesObj.landing_page = landingUrl;
  notesObj.captured_at = capturedAt;

  const additionalFields = buildAdditionalFields(utms);

  return {
    name: answers.nome,
    email: answers.email,
    phone: answers.telefone,
    source: utms.utm_source ?? 'direct',
    sourceReferral: { sourceUrl: landingUrl },
    notes: JSON.stringify(notesObj),
    ...(additionalFields ? { additionalFields } : {}),
  };
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/unit/utm-mapping.test.ts`
Expected: all tests pass, including the two new cases and the existing notes/source/no-tags assertions.

- [ ] **Step 7: Full suite + typecheck + lint**

Run in parallel: `pnpm typecheck` , `pnpm lint` , `pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env.server.ts src/lib/utm-mapping.ts tests/unit/utm-mapping.test.ts
git commit -m "feat(datacrazy): populate additionalFields array when UUIDs configured

Datacrazy /leads/additional-fields expects custom-field values keyed by
pre-created field UUIDs. Seven optional DATACRAZY_FIELD_ID_* env vars map
each UTM to its Datacrazy custom-field UUID. When absent, payload omits
additionalFields (back-compat with /api/v1/leads default endpoint).

Task 3 of docs/superpowers/plans/2026-04-17-datacrazy-additional-fields-experiment.md"
```

- [ ] **Step 9: Set the UUIDs on Vercel preview env and redeploy**

```bash
vercel env add DATACRAZY_FIELD_ID_UTM_SOURCE preview
# paste the UUID
vercel env add DATACRAZY_FIELD_ID_UTM_MEDIUM preview
# paste the UUID
# ... (repeat for all 7)
vercel --prebuilt=false --archive=tgz
```

Expected: fresh preview with all UUIDs in env.

- [ ] **Step 10: Re-run the real Typeform submission, capture the new Vercel log**

Same process as Task 2 Step 4. Record the new log.

- [ ] **Step 11: Update README with the Task 3 outcome**

Append to the section updated in Task 2 Step 6:

```markdown
### Follow-up — populando `additionalFields`

Após criar os 7 campos customizados no CRM e configurar os UUIDs como env vars, a submissão retornou: <status + excerpt>.
```

- [ ] **Step 12: Commit**

```bash
git add README.md
git commit -m "docs(readme): Task 3 follow-up — additionalFields populated with UUIDs"
```

---

## Task 4: Research-doc correction

**Why:** `docs/research/datacrazy-api.md` contains a now-falsified claim that "The REST endpoint doesn't have a `customFields` / `additionalFields` field documented." Leaving that as-is would mislead future agents who re-read the research doc. Correcting it is a one-paragraph edit. Runs regardless of Task 2 outcome.

**Files:**
- Modify: `docs/research/datacrazy-api.md` (lines 29–31 area — the ALERTA CRÍTICO)

---

- [ ] **Step 1: Edit the research doc**

Edit `docs/research/datacrazy-api.md`. Find the section:

```markdown
## 🚨 ALERTA CRÍTICO — mapeamento de UTMs

**O endpoint REST não tem campo `customFields` / `additionalFields` documentado.**
```

Replace with:

```markdown
## 🚨 ALERTA CRÍTICO — mapeamento de UTMs (CORRIGIDO 2026-04-17)

**Correção:** a claim original de que "O endpoint REST não tem campo `customFields` / `additionalFields` documentado" foi falsificada pela inspeção direta do OpenAPI spec (`https://api.datacrazy.io/v1/api/openapi/v1/json`). Existe um segundo endpoint — `POST /api/v1/leads/additional-fields` — com body `LeadWithAdditionalFieldsDto` que inclui o array `additionalFields: AdditionalFieldValueDto[]`. Esse endpoint está ausente de `docs.datacrazy.io/llms.txt`, o que provavelmente explica por que não foi detectado na pesquisa inicial via leitura da docs humana.

Ver `docs/superpowers/plans/2026-04-17-datacrazy-additional-fields-experiment.md` e a seção "Descoberta / Resolução" do `README.md` para as evidências da experiência contra o plan-gate.

**Estratégia original (fallback ainda válida quando o endpoint alternativo não está disponível ou o plan-gate é resource-level):**
```

The rest of the section (starting from `### Estratégia proposta ...`) stays intact as documented fallback.

- [ ] **Step 2: Commit**

```bash
git add docs/research/datacrazy-api.md
git commit -m "docs(research): correct falsified claim about customFields endpoint

OpenAPI spec at api.datacrazy.io/v1/api/openapi/v1/json exposes
POST /api/v1/leads/additional-fields with a proper additionalFields
array. The original research doc missed it because docs.datacrazy.io
llms.txt does not index that endpoint.

Task 4 of docs/superpowers/plans/2026-04-17-datacrazy-additional-fields-experiment.md"
```

---

## Task 5: Verification + decide ship path

**Why:** Final gate before merging or abandoning the experiment branch. Matches the verification discipline invariant in `~/.agents/AGENTS.md`.

---

- [ ] **Step 1: Run the full verification stack**

Run in parallel: `pnpm typecheck` , `pnpm lint` , `pnpm test` , `pnpm build`
Expected: all green.

- [ ] **Step 2: Run E2E against the preview**

```bash
pnpm test:e2e
```

Expected: `tests/e2e/lead-flow.spec.ts` passes against the preview URL. The mocked Datacrazy in the E2E is unaffected by the endpoint swap (the spec uses a local mock, not the real CRM).

- [ ] **Step 3: Ship decision (with user)**

Stop and present the three options to the user:

1. **Outcome A (success):** merge the PR to `main`, set `DATACRAZY_LEADS_ENDPOINT` on `production` env to the new endpoint, redeploy production, submit one more real Typeform against prod to capture the final success log for the evaluator video.
2. **Outcome B (gate is resource-level):** merge the PR to `main` anyway — the env-var indirection is still an improvement, even though it didn't unblock. Reset `DATACRAZY_LEADS_ENDPOINT` to the default on production. README carries the new evidence. Move on to (a) requesting a trial token from Datacrazy, (b) pivoting CRM, or (c) accepting the Free-tier block as documented.
3. **Outcome C (schema mismatch, UUIDs unavailable):** close the PR without merging; revert `DATACRAZY_LEADS_ENDPOINT` env overrides on preview. The research-doc correction (Task 4) can be cherry-picked as a standalone docs PR.

Wait for user selection before executing any merge or environment change.

---

## Self-Review

**Spec coverage:** Every requirement from the exploration ("search Datacrazy docs for alternative", "be smart about method") is addressed. Task 1 tests the alternative. Task 2 produces evidence. Task 3 handles the most likely failure mode. Task 4 corrects the stale research claim regardless. Task 5 gates the merge behind evidence.

**Placeholder scan:** No `TBD`, `TODO`, or `implement later`. All code blocks contain actual code. The only placeholder-shaped strings are `<paste the log here verbatim>` inside the README Markdown templates — those are filled from the captured Vercel log, not code.

**Type consistency:** `DatacrazyLeadPayload` stays structurally identical in Task 1 (only `ENDPOINT` is moved to env). Task 3 extends it with optional `additionalFields?: AdditionalFieldValue[]`. The new `AdditionalFieldValue` interface is named consistently across `utm-mapping.ts` and implicitly via `buildDatacrazyPayload`'s return type.

**Cross-task drift:** The env-var name `DATACRAZY_LEADS_ENDPOINT` used in Task 1 matches exactly in Task 2's `vercel env add` and Task 3's conditional re-use. The seven `DATACRAZY_FIELD_ID_*` names in Task 3 match across schema, helper function, and test cases.

**Order dependencies:** Task 2 depends on Task 1 (branch + env var must exist). Task 3 depends on Task 2 (only fires on Outcome C). Task 4 is parallel-safe — can run anytime after Task 1 is committed. Task 5 depends on all prior tasks being committed.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks sequentially in this session using `superpowers:executing-plans`, with a checkpoint after Task 1 (before the real production submission in Task 2).

Note: Task 2 Step 3 (retargeting the Typeform webhook) and Task 2 Step 2 (setting the Vercel env var) are out-of-band user actions I cannot execute. Any execution mode pauses there and hands back to the user.
