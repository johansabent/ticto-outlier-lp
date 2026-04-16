# ADR: YayForms webhook authentication mode

**Date:** 2026-04-15
**Status:** SUPERSEDED on 2026-04-16 by [`2026-04-16-typeform-webhook-auth.md`](./2026-04-16-typeform-webhook-auth.md). Reviewer pivot from YayForms to Typeform. Preserved for audit trail — do NOT implement against this document.
**Context source:** Day-0 discovery spike (Task 1 of implementation plan)

## Decision

Mode: **hmac**

## Spike setup context

### Form identifiers

Form configured as the real production form (not a throwaway):

| Field | ID |
|---|---|
| form_id | `69e03528fa54ffd0d5065756` |
| nome | `69e03538067002567f06733a` |
| telefone | `69e03538067002567f06733c` |
| email | `69e046bd8912730cd00bf5ca` |

Form metadata:

- Embed form ID: `wvAmM3z`
- Hosted URL: `https://johan5.yayforms.link/wvAmM3z`
- Embed script: `//embed.yayforms.link/next/embed.js`

### Hidden field strategy (important discovery)

YayForms has a native **UTM Parameters toggle** that captures the five reserved UTMs automatically (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`). When the toggle is ON, YayForms **rejects** adding these five as manual hidden fields — the UI blocks them as reserved. `sck` and `src` are not reserved and were added manually as hidden fields.

Embed snippet in use:

```html
<div data-yf-widget="wvAmM3z"
     data-yf-transitive-search-params="utm_source,utm_medium,utm_campaign,utm_content,utm_term,sck,src"
     style="width:100%;height:100%;"></div>
<script src="//embed.yayforms.link/next/embed.js"></script>
```

### Webhook configuration used for capture

- URL: `https://webhook.site/bd40a1f6-7825-4772-996c-067a26de806b`
- Format: **V2**
- Secret: `test-secret-day0-spike-2026` (spike-only; rotates to production value before shipping)
- Status at capture: ACTIVE

YayForms' UI copy on the Secret field documents the mechanism:

> "If specified, will be used to sign the webhook payload with HMAC SHA256, so that you can verify that it came from Yay! Forms."

### Test submission URL

```
https://johan5.yayforms.link/wvAmM3z?utm_source=google&utm_medium=cpc&utm_campaign=test&utm_content=banner&utm_term=ai&sck=testclick&src=lp
```

## Evidence captured

### Full header list from the live POST (verbatim)

| Header | Value |
|---|---|
| `content-length` | `2056` |
| `yayforms-signature` | `f6b327073aa30763e0d971823c317a1ba7bdeb1ff9c6bb3b850cdcd5ff55b9de` |
| `content-type` | `application/json` |
| `user-agent` | `GuzzleHttp/7` |
| `host` | `webhook.site` |

Only five headers. No `X-Timestamp`, no `X-Hub-Signature-256`, no replay-protection header. YayForms posts from a PHP GuzzleHttp client.

### Raw body (PII redacted)

The body below preserves the live payload **structure, keys, and non-PII values** verbatim. PII fields (`nome`, `email`, `telefone`, `ipAddress`, geolocation) were redacted to the canonical fixture values (`Teste QA` / `teste@example.com` / `+5511900000000`) per the spec's PII policy — this ADR commits to a public repo.

**Signature reconciliation note:** the `yayforms-signature` header above was computed over the **pre-redaction** real body. Unit tests that verify `lib/webhook-auth.ts` must **recompute** the expected signature over the redacted fixture body using `YAYFORMS_WEBHOOK_SECRET=test-secret-day0-spike-2026` (or whatever test secret the fixture uses). Do not copy the hex digest above into test assertions — it will not match the redacted body.

```json
{
  "response": {
    "id": "69e049c87f89e071cbd09b6a",
    "userId": "<redacted-user-id>",
    "formId": "69e03528fa54ffd0d5065756",
    "ipAddress": "203.0.113.1",
    "operatingSystem": "Windows",
    "operatingSystemVersion": "10.0",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "browser": "Chrome",
    "browserVersion": "145.0.0.0",
    "referrerUrl": null,
    "deviceType": "desktop",
    "geolocation": {
      "continent": "South America",
      "country_code": "BR",
      "country_code2": "BR",
      "country_name": "Brazil",
      "region": "XX",
      "state": "Redacted",
      "city": "Redacted",
      "zipcode": "00000",
      "latitude": 0,
      "longitude": 0,
      "timezone": "America/Sao_Paulo",
      "currency": "BRL"
    },
    "aiFeedback": null,
    "hiddenFields": {
      "utm_source": "google",
      "utm_medium": "cpc",
      "sck": "testclick",
      "src": "lp"
    },
    "variables": {
      "score": 0
    },
    "tracking": {
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "test",
      "utm_content": "banner",
      "utm_term": "ai"
    },
    "timeToComplete": 19.768,
    "startedAt": "2026-04-16T02:31:03.694000Z",
    "submittedAt": "2026-04-16T02:31:23.462000Z",
    "createdAt": "2026-04-16T02:30:32.627000Z",
    "updatedAt": "2026-04-16T02:31:24.193000Z",
    "answers": {
      "69e03538067002567f067337": {
        "answerId": "69e049e538b0e375b842dfae",
        "fieldTitle": "Bem-vindo!",
        "fieldDescription": "Estamos animados para conhecê-lo melhor. Por favor, preencha o formulário a seguir para que possamos entrar em contato com você.",
        "content": ""
      },
      "69e03538067002567f06733a": {
        "answerId": "69e049e638b0e375b842dfb2",
        "fieldTitle": "Qual é o seu nome?",
        "fieldDescription": "Precisamos do seu nome completo para começar.",
        "content": "Teste QA"
      },
      "69e03538067002567f06733c": {
        "answerId": "69e049eb38b0e375b842dfbe",
        "fieldTitle": "Qual é o seu número de telefone?",
        "fieldDescription": "Insira seu número com o código de área para receber atualizações e suporte.",
        "content": "+5511900000000"
      },
      "69e046bd8912730cd00bf5ca": {
        "answerId": "69e049f138b0e375b842dfc8",
        "fieldTitle": "Qual é o seu email?",
        "fieldDescription": null,
        "content": "teste@example.com"
      }
    }
  }
}
```

## Payload shape findings (V2)

1. **Answers are keyed by `field_id`** inside `response.answers`. The first entry is a "welcome" intro field with empty `content` — `lib/yayforms-fields.ts` must read only the explicit `nome`/`email`/`telefone` field IDs; never iterate `Object.values(answers)`.
2. **UTM params are NOT inside `answers`.** They split across two sibling keys:
   - `response.tracking` → all five UTMs (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) — **authoritative source**
   - `response.hiddenFields` → `sck`, `src`, plus duplicates of `utm_source` and `utm_medium` (artifact of the UTM toggle + manual hidden fields coexisting)
3. **No timestamp header.** YayForms does not emit `X-Timestamp` or equivalent. Replay protection must be implemented app-side using `response.submittedAt` (ISO-8601 with microseconds + `Z`, parseable by `Date.parse`).
4. **`timeToComplete`** (seconds) is present on every submission. Cheap bot signal — reject if < 3 seconds.
5. **`userAgent` = `GuzzleHttp/7`** on the POST — that's the provider's HTTP client, not the end-user's UA. The end-user's UA lives inside the body at `response.userAgent`.

## Rationale

HMAC is the strongest mode YayForms supports natively. Live capture confirmed exactly one signature header (`yayforms-signature`, hex SHA256 digest over the raw body), keyed by the Secret configured on the webhook. This maps cleanly to Camera A in the spec: `WEBHOOK_AUTH_MODE=hmac`, verified with `crypto.timingSafeEqual` after a length-equal pre-check. The absence of a signed timestamp header is mitigated at the application layer: parse `response.submittedAt` and reject payloads outside a 5-minute window. This is the standard mitigation when a provider signs bodies but not timestamps.

## Implementation notes for Task 8 (`lib/webhook-auth.ts`)

- Signature header: `yayforms-signature`
- Timestamp header: **none** — validate `response.submittedAt` against a 5-minute window
- Payload for HMAC: **raw request body only** (no `timestamp.body` concat)
- Encoding: **hex** (64-char lowercase — confirmed by capture)
- Secret env var: `YAYFORMS_WEBHOOK_SECRET`
- `WEBHOOK_AUTH_MODE` env value: `hmac`
- Read the raw body as text **before** `JSON.parse`; HMAC verifies against the exact bytes received (any reserialization invalidates the signature)
- Compare digests with `crypto.timingSafeEqual`, guarded by a length-equal pre-check to avoid the constant-time function throwing on mismatched Buffer lengths
- Reject when `response.submittedAt` is missing, unparseable, or more than 5 minutes old or in the future

## Implementation notes for Task 7 (`lib/utm-mapping.ts`)

Diverges from the early plan assumption that UTMs live inside `response.answers`. Read from `tracking` + `hiddenFields` instead:

```ts
const utms = {
  utm_source:   body.response?.tracking?.utm_source   ?? null,
  utm_medium:   body.response?.tracking?.utm_medium   ?? null,
  utm_campaign: body.response?.tracking?.utm_campaign ?? null,
  utm_content:  body.response?.tracking?.utm_content  ?? null,
  utm_term:     body.response?.tracking?.utm_term     ?? null,
};
const sck = body.response?.hiddenFields?.sck ?? null;
const src = body.response?.hiddenFields?.src ?? null;
```

Personal data (`nome`, `email`, `telefone`) still reads from `response.answers[field_id].content` per the plan.

## Fixture for tests

The redacted body in **Evidence captured → Raw body** above is the canonical fixture. `tests/unit/webhook-auth.test.ts` and `tests/unit/utm-mapping.test.ts` should import it from `tests/fixtures/yayforms-webhook.json` (Task 8 creates that file by copying the JSON block above).

Signature fixture generation for the HMAC unit test:

```ts
import { createHmac } from "node:crypto";
import fixture from "./fixtures/yayforms-webhook.json";

const body = JSON.stringify(fixture);
const secret = "test-secret-day0-spike-2026";
const expected = createHmac("sha256", secret).update(body).digest("hex");
```

## Commit

Commit lands after Task 2 initializes the repo (see Task 1 Step 7). Stage this file plus any related docs with:

```bash
git add docs/decisions/2026-04-15-webhook-auth.md
git commit -m "docs(spike): capture YayForms webhook auth mode from day-0 discovery"
```
