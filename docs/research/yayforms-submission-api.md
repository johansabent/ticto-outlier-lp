# YayForms — Inbound Submission API Research

**Date:** 2026-04-16
**Question:** Does YayForms expose a public/documented API endpoint to programmatically POST form responses from a custom HTML form — such that YayForms records the submission and fires its outbound webhook?
**Scope:** Inbound-to-YayForms submission only. Webhook delivery (outbound from YayForms) is already confirmed in `docs/decisions/2026-04-15-webhook-auth.md`.

---

## Verdict

❌ **NOT AVAILABLE** — No public or documented inbound submission API exists. We must use the iframe embed.

---

## Evidence Table

| Source | What was found |
|---|---|
| `https://yayforms.com/docs` | 404 — does not exist |
| `https://docs.yayforms.com` | SSL error (self-signed cert) — inaccessible |
| `https://yayforms.com/api` | Landing page only: "Here you will find all the endpoints you can use to integrate with Yay! Forms." No actual endpoints rendered (JavaScript-rendered SPA, unauthenticated WebFetch gets the shell only) |
| `https://yayforms.com/developers/api` | Same landing page shell. Requires authenticated session to render API endpoint list. Content confirms API exists, but nothing inbound-to-form is listed even in the nav text. |
| `https://help.yayforms.com` | No API-related developer documentation found. Integration content limited to Make and WordPress. No submission endpoint referenced. |
| `https://help.yayforms.com/en/article/how-to-enable-access-to-the-api-token-umlnz8/` | Documents how to generate an API token from account settings. Does **not** document any endpoint for submitting responses. Implies token is for outbound read/manage operations. |
| `https://help.yayforms.com/en/articles/how-to-embed-a-form-on-your-website` | Lists six embed modes (STANDARD, FULL-PAGE, POPUP, SLIDER, POPOVER, SIDE TAB). No mention of a submission API or custom HTML form alternative. |
| GitHub: `github.com/yayforms` | 2 public repos: `wordpress-plugin` (PHP) and `ai` (forked Laravel AI SDK). Neither contains a submission API, SDK, or developer docs for inbound form responses. |
| GitHub: ChatGPT plugin spec (`sisbell/chatgpt-plugin-store`) | Contains a single `POST /forms` endpoint for **creating** a form (not submitting a response). Archived January 2026. No submission endpoint present. |
| Make.com (`apps.make.com/yay-forms`) | 5 modules: Create a Field, Create a Form, Create a Workspace, Update a Form, Make an API Call. 1 trigger: Watch New Responses. **No module for submitting/creating a response.** Confirms API is write-form / read-response only. |
| Zapier (`zapier.com/apps/yay-forms/integrations`) | Single trigger: "New Response" (read). **No action for posting a response.** Confirms one-directional integration surface. |
| `embed.yayforms.link/next/embed.js` | Embed script uses `postMessage` architecture. Form submissions happen inside the iframe loaded from `yayforms.link` — the parent script only listens for `"form-submit"` messages. Actual submission XHR/fetch is inside the iframe bundle, not accessible without a live browser session. |
| WebSearch: `"yayforms" "api/responses" OR "api/submissions" OR "api/submit"` | No results pointing to a callable inbound submission endpoint. Only returns the `yayforms.com/developers/api` landing page and integration platform listings. |
| WebSearch: `yayforms submission api site:github.com` | No third-party SDKs or unofficial clients that implement a submission endpoint. |
| Playwright MCP tools | **Not available** in this environment — ToolSearch returned no matching deferred tools. Live network inspection of the form submit flow could not be performed. |

---

## Playwright Gap Note

The task instructions required network inspection via Playwright MCP tools as the primary method to discover undocumented endpoints. Those tools were not available (`ToolSearch` returned no match for `mcp__plugin_playwright_playwright__browser_navigate`). The embed script analysis confirms submissions happen inside the iframe's own JS bundle — a live browser session with DevTools network tab is the only way to capture the exact internal endpoint. This gap is noted but does not change the verdict: **no documented or publicly confirmed inbound submission endpoint exists**, and the platform's integration surface (Make, Zapier) has zero modules for creating responses, which is the strongest signal that no such endpoint is officially supported.

---

## No curl Sample

No sample curl is provided because no inbound submission endpoint was identified. If a future live network inspection (run in a real browser against `https://johan5.yayforms.link/wvAmM3z`) reveals an internal endpoint, it should be treated as **🟡 UNDOCUMENTED BUT USABLE** with the reverse-engineering risks below.

---

## Known Risks (if an internal endpoint is later discovered via browser DevTools)

1. **Undocumented internal endpoint** — subject to change without notice; YayForms makes no SLA guarantee on it.
2. **Session token dependency** — the iframe form likely initializes a session token on page load (CSRF-style) that must accompany the submission POST. This token would not be reproducible without first loading the hosted form page.
3. **Rate limits unknown** — no documented rate limit; aggressive polling could trigger IP blocks.
4. **Webhook may not fire** — if the submission endpoint validates that the request originated from a YayForms-rendered session (e.g., checks a session ID or referrer), submissions from a custom form might be rejected silently or recorded without triggering the outbound webhook.
5. **PII logging risk** — calling an undocumented internal endpoint with real lead data creates audit/compliance exposure; if the endpoint changes, lead submissions would silently fail.

---

## Recommendation

**Path A (iframe embed) is the only viable option.**

The inbound submission API does not exist in any documented or discoverable form. Both Make and Zapier — which collectively expose YayForms' integration surface publicly — have zero modules for posting responses. The official API is scoped to form management (create form, update form, create field, create workspace) and response reading (Watch New Responses trigger), not response writing.

**For design fidelity:** use the YayForms embed in **STANDARD** mode, which renders the form inline. Apply CSS targeting the embed container to control surrounding layout. The form's internal styling cannot be overridden (cross-origin iframe), but the LP shell, background, typography hierarchy, and CTA context around the embed can be pixel-matched to the Figma design.

---

## Sources

- [Yay! Forms API Docs](https://yayforms.com/developers/api)
- [How to enable access to the API token | Yay! Forms](https://help.yayforms.com/en/article/how-to-enable-access-to-the-api-token-umlnz8/)
- [Yay! Forms on GitHub](https://github.com/yayforms)
- [Make.com — Yay! Forms modules](https://apps.make.com/yay-forms)
- [Zapier — Yay! Forms integrations](https://zapier.com/apps/yay-forms/integrations)
- [How to embed a form on your website | Yay! Forms](https://help.yayforms.com/en/articles/how-to-embed-a-form-on-your-website)
- [ChatGPT plugin spec (archived Jan 2026)](https://github.com/sisbell/chatgpt-plugin-store/blob/main/specs/openai-plugin.yayforms.com.json)
