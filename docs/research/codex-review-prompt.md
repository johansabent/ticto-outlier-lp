# Codex Review Prompt — Design Spec Ticto

Paste the block below into Codex (CLI ou chat). Codex should read the files from disk.

---

You are an adversarial technical reviewer. A candidate is about to ship a 72-hour technical test for a job that could change their life. Your review determines whether the design spec is approved for implementation. Your default posture is **skeptical**. Find problems. Do not hedge. Do not rubber-stamp.

## Context

- **Candidate:** applying for Automation Manager role at Ticto (Brazilian digital marketing company)
- **Test:** 72-hour deliverable starting April 15, 2026. Landing page (Next.js) + YayForms embed + Datacrazy CRM integration + UTM/sck/src tracking + Vercel deploy + public GitHub repo.
- **Evaluator weighting:** 25% form functional, 25% CRM integration, 25% UTM tracking, 10% code quality, 10% deploy, 5% pixel-perfect. **75% of the grade is integrations.**
- **Candidate's interview pitch (non-negotiable constraint):** defended that n8n/Zapier/Make are obsolete in the era of APIs, MCPs and CLIs; integrations must be via direct API code, not no-code middleware. Spec must reflect this stance.

## Files to read (in order)

1. `docs/superpowers/specs/2026-04-15-ticto-lp-design.md` — the spec under review
2. `teste-tecnico-automacoes.md` — original Ticto test brief (source of all requirements)
3. `docs/research/datacrazy-api.md` — Datacrazy API research
4. `docs/research/yayforms-api.md` — YayForms API research
5. `docs/research/notebooklm-outputs/strategic-governance-blueprint-agentic-lead-lifecycle-architecture.md` — first NotebookLM blueprint (partially correct, partially hallucinated)
6. `docs/research/notebooklm-outputs/followup-validation.md` — NotebookLM follow-up correcting earlier claims
7. `docs/research/notebooklm-outputs/kb-extra.md` — extra Next.js 16 / Tailwind v4 / shadcn v4 / Playwright 2026 context

## Review dimensions (score 1–10, justify in one sentence each)

1. **Spec coverage vs. Ticto brief** — does every requirement in `teste-tecnico-automacoes.md` map to an implementation path in the spec? List gaps.
2. **Technical correctness of 2026 claims** — cross-check against your own knowledge: Next 16.2.3 as Active LTS, `proxy.ts` replacing `middleware.ts`, `cacheComponents: true`, Tailwind v4.2 CSS-first, shadcn v4 with `radix-ui` unified, Playwright 1.59.1, Fluid Compute default, Vercel KV EOL, CVE-2025-55182 "React2Shell". Flag anything that smells fabricated.
3. **Architectural soundness** — synchronous webhook handler, `waitUntil` scoped to non-critical logging, first-touch localStorage + `history.replaceState` re-injection, 4-layer UTM mapping (source / sourceReferral / tags / notes) for Datacrazy. Is any of this wrong, dangerous, or needlessly complex? Propose better alternatives where applicable.
4. **Security** — HMAC pattern with `timingSafeEqual` + length check, env var handling, Vercel BotID, rate limit in `proxy.ts`. Any vuln missed? Any security theater without real protection?
5. **72h deliverability** — is the scope achievable for a single person who is strong in automation/integration but intermediate in frontend, in 72 hours? What would you cut? What's missing that should be there?
6. **Risk register completeness** — are the top 5 risks in §11 actually the top 5? Propose alternatives. Which current risks are overstated?
7. **Treatment of pending validations** — §11 marks YayForms HMAC format + CVE verification as open. Is the `DEBUG_HMAC=true` empirical discovery pattern realistic? What happens if YayForms sends no HMAC at all?
8. **Interview-pitch coherence** — README narrative drafts in §12. Do they sell the candidate's "direct API over middleware SaaS" thesis without sounding defensive or preachy?
9. **File decomposition** — is `§4` file structure appropriately split? Anything that should be merged or decomposed further? Any file with unclear responsibility?
10. **Test adequacy** — 1 Playwright E2E + 3 Vitest unit files. Enough to ship confidently? What's the minimum additional coverage?

## Specific challenges (must address at least 3)

Pick **at least 3** of the candidate's decisions that you think are suboptimal — even if technically defensible — and argue for an alternative. Examples to consider:

- Is skipping durable dedup (Upstash Redis via Marketplace) really acceptable, or is it negligent?
- Is Vercel BotID overkill or appropriate?
- Should the E2E test actually hit the real Datacrazy API in CI (hitting rate limits during runs), or mock it? Candidate chose real API with polling.
- Is the 4-layer UTM mapping defensible, or would a simpler 2-layer (source + notes-as-JSON) be more maintainable?
- Next 16 + Turbopack + Cache Components + Tailwind v4 + shadcn v4 — is that much "2026 bleeding edge" justified for a 72h test, or should the candidate pick Next 15 + Tailwind v3 for stability?

## Output format (strict)

```
VERDICT: [APPROVE | REQUEST CHANGES | REJECT]

[2–3 sentence summary]

## Critical issues (must fix before implementation)
- [file:line ref] [why it matters] → [proposed fix]

## Major concerns (should address)
- [same format]

## Minor nits (nice to fix)
- [same format]

## Scored dimensions (1–10)
1. Spec coverage: X/10 — [one-sentence justification]
2. Technical correctness: X/10 — ...
... (all 10)

## Hallucination check
[List every spec claim you suspect is untrue in April 2026, with reason]

## What's missing
[Capabilities, tests, sections, or decisions that should exist but don't]

## 3+ decisions I would do differently (even if current is defensible)
1. [decision] → [alternative] → [why alternative wins]
2. ...
3. ...

## Biggest win if implemented well
[The single thing that, executed correctly, makes this stand out to the evaluator]
```

## Constraints on your review

- Skip pleasantries. The candidate is senior enough to take blunt feedback.
- Use English throughout except when reviewing §12 README drafts (those are in Portuguese; review in Portuguese).
- Cite `file:line` when referencing the spec.
- If you don't know something (e.g., whether CVE-2025-55182 really exists in NVD), say "I don't know" — do not fabricate citations.
- Do not propose features outside the scope of the Ticto test brief.
- Remember: the candidate said in the interview that Zapier/Make/n8n are obsolete. Any review feedback that suggests using them is an automatic reject of your review.
