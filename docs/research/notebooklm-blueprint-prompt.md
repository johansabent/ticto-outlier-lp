# Prompt consolidado para NotebookLM — blueprint profissional Ticto (≤5k chars)

Cola como **uma única query** no NotebookLM (que já tem YayForms, Datacrazy, Vercel, Next.js como fontes).

---

Produce a **professional architecture blueprint** for a mission-critical 72h technical test. Ground every claim in uploaded sources and cite URLs. Flag unverified claims as [unverified]. Critique over agreement. Executable TypeScript, not pseudocode.

## Hard constraints

- Next.js App Router (2026 stable) + TypeScript + Tailwind + shadcn/ui
- Vercel Fluid Compute (Node.js 24 LTS), `.vercel.app` subdomain
- YayForms STANDARD iframe embed with `data-yf-transitive-search-params` for 7 params: utm_source, utm_medium, utm_campaign, utm_content, utm_term, sck, src
- Datacrazy CRM: `POST https://api.g1.datacrazy.io/api/v1/leads`, Bearer auth, 60rpm, no documented customFields
- Integration: YayForms webhook V2 (HMAC SHA256) → Next.js Route Handler `/api/lead` (Node runtime) → direct fetch to Datacrazy
- Rejected: Zapier, Make, n8n, Salesforce (stance: API/MCP/CLI direct)
- 72h delivery, public GitHub, pixel-perfect Figma (Dev Mode available)

## Required sections

**1. First-touch attribution (localStorage + cookies)** — capture 7 params on first visit, persist across sessions/tabs, expose to Server + Client Components. Handle second-touch without UTMs. Full `useFirstTouchAttribution` code. Address SSR hydration risks.

**2. URL params → YayForms iframe** — how `data-yf-transitive-search-params` hydrates. Debug when params don't propagate. Programmatic backup.

**3. Webhook Route Handler (App Router 2026)** — `/api/lead/route.ts` pattern: Node runtime, raw body for HMAC, `node:crypto` vs `crypto.subtle`, 300s timeout, structured logging, HTTP status codes on failures given YayForms retries.

**4. HMAC SHA256 + replay prevention** — full code with timestamp tolerance, `crypto.timingSafeEqual`, secret rotation. On signature failure: 401 vs silent 200 — decide for this context.

**5. Direct CRM `fetch`** — Bearer via `vercel env`. Retry on 429 (respect `Retry-After`, exponential backoff). 4xx vs 5xx classification. Idempotency/dedup without a database.

**6. UTM mapping (no customFields)** — critique this 4-layer Datacrazy strategy:
- `source` ← utm_source
- `sourceReferral.sourceId` ← utm_campaign
- `sourceReferral.sourceUrl` ← full original URL with query string
- `tags[]` ← remaining 5 params as `key:value`
- `notes` ← formatted dump

Better alternative? Trade-offs: CRM searchability vs data integrity vs reporting.

**7. Bot protection** — Vercel BotID vs Cloudflare Turnstile vs rate-limit Route Handler. Overkill vs negligent for 72h. Recommend one.

**8. Observability (Vercel Logs, no Sentry)** — JSON schema for `lead.received/validated/forwarded/failed`. Fields: request_id, yayforms_submission_id, datacrazy_lead_id, timing, error code. Filtering via `vercel logs`. PII redaction.

**9. Figma Dev Mode → Tailwind + shadcn (2026)** — fastest extraction path. Figma MCP vs manual Dev Mode copy. shadcn CLI current version + Next.js init. Tailwind v4 breaking changes. CSS variables theming.

**10. Vercel deploy (2026)** — GitHub integration vs `vercel --prod`. Env flow (`vercel env add`/`pull`). Is `vercel.ts` worth it for single LP? Rolling Releases relevance. Analytics/Speed Insights on free tier.

**11. Testing (72h fit)** — single Playwright E2E: visit URL with 7 params → fill iframe form → submit → poll Datacrazy to verify lead + field mapping. Provide test file. Skip unit tests? Minimum rigor to ship.

**12. Risk register (top 5, likelihood × impact)** with concrete mitigations:
- YayForms trial expires before evaluation
- Datacrazy token leaks in bundle/logs
- Webhook HMAC mismatch (body parsing)
- UTM persistence fails across navigations
- Figma misread (responsive breakpoints)

**13. README narrative** — draft paragraphs for the evaluator:
- Why direct API over Zapier/Make/n8n (align with "API/MCP/CLI era" pitch)
- Why 4-layer UTM mapping (defensive given Datacrazy schema)
- Why Next.js App Router + Fluid Compute + Node 24 (2026 defaults)
- Why the stack is maintainable for a production automation team

## Output rules

- Cite exact source URLs for every technical claim
- Flag unverified claims [unverified]
- Where my proposal is suboptimal, propose better + justify
- End with **VERDICT**: ship-ready in 72h? What would you change with 1 more week vs unnecessary polish?
