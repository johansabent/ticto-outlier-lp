# ADR: Typeform webhook authentication mode

**Date:** 2026-04-16
**Status:** Decided
**Context source:** Day-1 Typeform discovery spike (replaces the YayForms ADR at `2026-04-15-webhook-auth.md` — now SUPERSEDED)

## Decision

Mode: **hmac** (single mode — no multi-mode auth needed; Typeform only ships HMAC)

Platform change: YayForms → **Typeform**. Reviewer request. Typeform has stronger documentation and a broader integration surface (Zapier, Make, `@typeform/embed-react` SDK).

## Form identifiers

| Field | Value |
|---|---|
| Form ID | `FbFMsO5x` |
| Embed library | `@typeform/embed-react` (Widget component, inline mode) |
| Transitive params attribute | `data-tf-transitive-search-params` (only used for vanilla-JS path; we use the React SDK's `hidden` prop instead) |

### Field registry (stable refs, not IDs)

| Ref | Field ID | Question | Type |
|---|---|---|---|
| `nome` | `3hoQVsHfYizG` | Qual é o seu nome? | `short_text` |
| `cpf` | `km4nN3UlKMlY` | Qual é o seu CPF? | `short_text` |
| `email` | `iuCeimXTClvh` | Qual é o seu e-mail? | `email` |
| `telefone` | `LYjKttS4RUS6` | Qual é o seu telefone? | `phone_number` |
| `sells_online` | `PBVzZlK0sf47` | Você vende online? | `multiple_choice` |

`lib/typeform-fields.ts` keys by `ref` (stable across form edits), never by ID (can change).

### Hidden fields (7 UTMs)

Declared in Typeform form config — required before any URL param can populate them:
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (enabled via Typeform's "Source tracking" toggles)
- `sck`, `src` (declared as Custom URL parameters)

URL params matching these names are populated into `form_response.hidden` on submission.

### Webhook configuration used for spike

- URL: `https://webhook.site/bd40a1f6-7825-4772-996c-067a26de806b`
- Secret: `***REDACTED-SECRET***` (spike-only; rotates to production value before shipping — update in Typeform webhook config + Vercel env `TYPEFORM_WEBHOOK_SECRET`)
- Format: **V2** (`event_types: { form_response: true }`)
- SSL verification: enabled
- Webhook tag: `phoenix:1776372234706`

## Evidence captured

### Full header list from live POST

| Header | Value |
|---|---|
| `typeform-signature` | `sha256=x7rq0uFg9kD6+rOXeKkfueM5ofZuabSO2rb3M/1ltEw=` |
| `content-type` | `application/json` |
| `user-agent` | `Typeform Webhooks` |

Notes:
- Header name is **`typeform-signature`** — all lowercase, hyphenated. Match case-insensitively (Node's `Headers.get()` normalizes).
- Signature format is **`sha256=<base64>`** — literal `sha256=` prefix followed by standard base64 of the HMAC-SHA256 digest of the raw request body.
- **No timestamp header.** Use `form_response.submitted_at` (ISO-8601) for an app-side replay window, same pattern as the YayForms ADR.

### Test submission URL

```
https://form.typeform.com/to/FbFMsO5x?utm_source=google&utm_medium=cpc&utm_campaign=test&utm_content=banner&utm_term=ai&sck=testclick&src=lp
```

Submitted values (now canonical fixture values — no redaction needed, these are the actual dummy values used):

- nome: `Teste QA`
- cpf: `12345678900`
- email: `teste@example.com`
- telefone: `+5511900000000`
- sells_online: `Sim`

### Raw body (test fixture)

Imports to `tests/fixtures/typeform-webhook.json` as the canonical fixture for `tests/unit/webhook-auth.test.ts` and `tests/unit/utm-mapping.test.ts`:

```json
{
  "event_id": "01KPC1H3VJSS9SP8FC4983BD4A",
  "event_type": "form_response",
  "form_response": {
    "form_id": "FbFMsO5x",
    "token": "p7zn6z8fnns6o0kdj1p7zn6zs6ltyxr5",
    "landed_at": "2026-04-16T21:00:12Z",
    "submitted_at": "2026-04-16T21:00:39Z",
    "hidden": {
      "sck": "testclick",
      "src": "lp",
      "utm_campaign": "test",
      "utm_content": "banner",
      "utm_medium": "cpc",
      "utm_source": "google",
      "utm_term": "ai"
    },
    "answers": [
      { "type": "text",         "text": "Teste QA",            "field": { "ref": "nome",         "type": "short_text" } },
      { "type": "text",         "text": "12345678900",         "field": { "ref": "cpf",          "type": "short_text" } },
      { "type": "email",        "email": "teste@example.com",  "field": { "ref": "email",        "type": "email" } },
      { "type": "phone_number", "phone_number": "+5511900000000", "field": { "ref": "telefone",  "type": "phone_number" } },
      { "type": "choice",       "choice": { "label": "Sim", "ref": "490ea062-6100-416d-96fa-17e8e8991a4e" }, "field": { "ref": "sells_online", "type": "multiple_choice" } }
    ]
  }
}
```

### Signature reconciliation note

The `typeform-signature` captured in headers was computed over the live payload bytes. The fixture body above is the exact payload — `tests/unit/webhook-auth.test.ts` should recompute the expected signature using the secret via:

```ts
import { createHmac } from "node:crypto";
import fixture from "./fixtures/typeform-webhook.json";

const body = JSON.stringify(fixture);
const secret = "***REDACTED-SECRET***";
const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("base64");
// expected matches the header captured here when body is serialized identically
```

**Critical:** Typeform sends the exact bytes it generated; our handler must read `await req.text()` BEFORE `JSON.parse` and HMAC-verify against those bytes. Any reserialization (e.g., a middleware re-stringifying) will break verification.

## Payload shape findings

1. **Answers are an array**, not keyed by ID. Each element:
   ```ts
   {
     type: "text" | "email" | "phone_number" | "choice",
     field: { ref: string, type: string, id?: string },
     // value key varies by type:
     text?: string,
     email?: string,
     phone_number?: string,
     choice?: { label: string, ref: string }  // choice.ref is a UUID, NOT our semantic ref
   }
   ```
2. **Identify fields by `field.ref`** — stable across edits. Never by `field.id` (unstable) or array position (unstable if fields reorder).
3. **Value extraction by answer type:**
   - `text` → `answer.text`
   - `email` → `answer.email`
   - `phone_number` → `answer.phone_number`
   - `choice` → `answer.choice.label` (human-readable) — `answer.choice.ref` is a UUID per-option, not useful semantically.
4. **UTM params live in `form_response.hidden`** — flat object, all 7 keys present if the URL had them. This is the **authoritative source** — no split like YayForms had between `tracking` and `hiddenFields`.
5. **No timestamp header.** Use `form_response.submitted_at` (ISO-8601 `Z` suffix) for an app-side 5-minute replay window.
6. **`event_id`** present at top level — `01KPC1H3VJSS9SP8FC4983BD4A` in the fixture. Useful for future idempotency dedup (Vercel Marketplace Redis or similar; skip for 72h test per spec).

## Rationale

HMAC SHA-256 is the only auth mode Typeform offers. Signature format is well-documented (`sha256=<base64>`) and confirmed by live capture. The absence of a signed timestamp is mitigated at the application layer via `form_response.submitted_at` validation (5-min window), identical to the YayForms mitigation. This is a **single-mode** simplification from the YayForms multi-mode plan (hmac / shared_secret / secret_path) — just `hmac`.

## Implementation notes for `lib/webhook-auth.ts`

- Signature header: `typeform-signature` (case-insensitive read)
- Signature format: `sha256=<base64>` — strip `sha256=` prefix, then `Buffer.from(value, 'base64')`
- Payload for HMAC: **raw request body bytes** (via `await req.text()` then `Buffer.from(text)`)
- Encoding: **base64** (NOT hex — this is the main break from the YayForms ADR)
- Secret env var: `TYPEFORM_WEBHOOK_SECRET`
- `WEBHOOK_AUTH_MODE` env var: **remove** (no longer needed — Typeform is hmac-only)
- Comparison: `crypto.timingSafeEqual` after length-equal pre-check
- Reject if `form_response.submitted_at` missing, unparseable, or older than 5 minutes

## Implementation notes for `lib/typeform-fields.ts` (replaces `lib/yayforms-fields.ts`)

```ts
export const FIELD_REFS = {
  nome: { type: "text" as const, required: true },
  cpf: { type: "text" as const, required: true },
  email: { type: "email" as const, required: true },
  telefone: { type: "phone_number" as const, required: true },
  sells_online: { type: "choice" as const, required: true },
} as const;

export type AnswerByRef = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  sells_online: string; // choice.label
};

export function parseAnswers(answers: TypeformAnswer[]): AnswerByRef {
  // iterate answers, index by field.ref, extract value by type
  // throw if any required ref missing or type mismatches
}
```

## Implementation notes for `lib/utm-mapping.ts`

Simpler than YayForms — UTMs live in one flat object:

```ts
const hidden = body.form_response?.hidden ?? {};
const utms = {
  utm_source:   hidden.utm_source   ?? null,
  utm_medium:   hidden.utm_medium   ?? null,
  utm_campaign: hidden.utm_campaign ?? null,
  utm_content:  hidden.utm_content  ?? null,
  utm_term:     hidden.utm_term     ?? null,
};
const sck = hidden.sck ?? null;
const src = hidden.src ?? null;
```

3-layer Datacrazy mapping (source / sourceReferral.sourceUrl / notes-JSON) stays unchanged. **Keeping our mapping over the NotebookLM blueprint's `tags` suggestion — spec explicitly rejected tags.**

## Implementation notes for `components/typeform-embed.tsx` (replaces `yayforms-embed.tsx`)

```tsx
'use client';
import { Widget } from '@typeform/embed-react';
import { useAttribution } from '@/lib/attribution';

export function TypeformEmbed({ formId }: { formId: string }) {
  const { utms } = useAttribution(); // reads localStorage first-touch
  return (
    <Widget
      id={formId}
      hidden={utms}            // 7 UTM keys passed as Typeform hidden fields
      inlineOnMobile
      opacity={0}
      className="w-full h-full min-h-[600px]"
    />
  );
}
```

Dependency to add: `@typeform/embed-react` (production dep).

## Security notes

- Webhook secret `***REDACTED-SECRET***` is **spike-only**. Rotate before production deploy:
  1. Generate new secret (crypto-random, ≥32 chars)
  2. Update in Typeform webhook config (keep webhook.site URL during rollout, then swap to prod URL)
  3. Set `TYPEFORM_WEBHOOK_SECRET` in Vercel Production + Preview env
  4. Redeploy
  5. Submit a test form in prod → confirm HMAC passes with new secret
- Typeform Personal Access Token (PAT) was exposed in chat during the spike. **Regenerate** via Typeform → Settings → Personal Tokens → Regenerate `openclaw-automation`. PAT is used only for Typeform Management API calls (creating forms, reading config); not needed at runtime.

## Commit

Lands with the plan revision commit (scheduled next). Staged alongside the superseded YayForms ADR banner + plan file edits.
