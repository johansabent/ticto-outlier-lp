# Handover Prompt — Invoke writing-plans on approved spec

**Cola isto inteiro numa nova sessão do Claude Code** (abrir nesse mesmo projeto: `D:\Users\Johan\Dev Projects\ticto-new`).

---

You're a fresh session picking up an approved design spec. Everything you need is persisted on disk. Do not re-debate decisions — execute them by producing an implementation plan.

## Task

Invoke the `superpowers:writing-plans` skill against the approved spec to produce an executable, task-by-task implementation plan. Save output to `docs/superpowers/plans/2026-04-15-ticto-lp-implementation.md`.

## Read these files first (in order)

1. `CLAUDE.md` — tool shim (points to AGENTS.md + Claude-specific stuff: MCPs, skills, postura)
2. `AGENTS.md` — **THE contract** — stack, commands, env vars, conventions, validation order, branch rules, day-0 spike as blocker
3. `docs/superpowers/specs/2026-04-15-ticto-lp-design.md` — approved spec (17 sections, ~600 lines)
4. `docs/teste-tecnico-automacoes.md` — original Ticto briefing (deliverables source)
5. `docs/research/` — context on YayForms, Datacrazy, NotebookLM blueprints, Codex review, Gemini refinements

## One-paragraph context

72h technical test for Automation Manager at Ticto. Next.js LP + YayForms embed + Datacrazy CRM + UTM/sck/src tracking + Vercel deploy + public GitHub repo. Spec went through: brainstorming → first NotebookLM blueprint (partially hallucinated) → Codex adversarial review (REQUEST CHANGES; all critical + major concerns applied) → Gemini refinements via NotebookLM (3 improvements applied) → approval. **Status: APPROVED.** Your job is decomposition into executable tasks, not redesign.

## Hard constraints (do NOT re-debate — propose alternatives in the plan = error)

- **Stack:** Next.js ^16.2 + TypeScript + Tailwind v4 (CSS-first, no `tailwind.config.ts`) + shadcn/ui CLI v4 + Node 24 LTS on Vercel Fluid Compute + pnpm
- **Integration path:** Next.js Route Handler `/api/lead` receiving YayForms webhook → direct `fetch` to Datacrazy (`POST https://api.g1.datacrazy.io/api/v1/leads`). **Never Zapier/Make/n8n** (architectural stance tied to interview pitch).
- **UTM mapping:** 3-layer into Datacrazy (`source`, `sourceReferral.sourceUrl`, `notes` as structured JSON). Not 4-layer, no tags, no sourceReferral.sourceId.
- **First-touch:** localStorage + `history.replaceState` via `useLayoutEffect` (§5.3 of spec).
- **Webhook auth:** multi-mode (HMAC / secret_path / shared_secret). Mode decided by day-0 spike, which is task #1 and blocks everything downstream.
- **Testing:** Vitest units + 1 Playwright E2E with **Datacrazy MOCKADO in CI** (via `page.route`). Manual smoke live with screencast is separate.
- **Deploy:** Vercel + GitHub integration (push to `main` = production); Preview on PR.
- **GitHub setup (§15):** CI workflow + E2E workflow + Claude Code Action workflow; CodeQL ON; Dependabot OFF for 72h.
- **Rejected (never reintroduce):** Cache Components, BotID on `/api/lead`, custom rate limit in `proxy.ts`, `vercel.ts` config, Zapier/Make/n8n.
- **`proxy.ts` limitation (Next 16):** cannot return response bodies. Security headers only; auth logic stays in Route Handler.

## Task skeleton lives in spec §16

Spec has **§16 with a 25-issue backlog skeleton** already laid out with dependencies, labels (`priority`, `type`, `area`, `status`, `agent:ok|review-required|pair`), and ordering. Use this as the spine of your plan. Each issue → one task in your plan, expanded into bite-sized steps per writing-plans skill format (write test → run fail → implement → pass → commit).

**Critical:** task #1 is the **day-0 spike** (discover YayForms webhook auth format by creating account, triggering webhook to inspection endpoint, inspecting headers). It's `agent:pair` — NOT fully autonomous. The plan must reflect this as a manual discovery step with explicit handoff back to the user, and it blocks task #7 (webhook-auth implementation) and downstream.

## Expected plan output (writing-plans skill format)

- Header: goal, architecture, tech stack
- File structure mapping
- 25+ tasks, each with:
  - Files to Create/Modify/Test
  - Step 1: Write failing test (complete code)
  - Step 2: Run + expect fail (exact command)
  - Step 3: Implementation (complete code)
  - Step 4: Run + expect pass
  - Step 5: Commit (exact message)
- No placeholders, no "TBD", no "similar to Task N" (repeat code)
- End with execution choice offer (subagent-driven vs inline)

## Before you write the plan

Skim the spec top to bottom. If **anything** is ambiguous or under-specified (i.e., you literally cannot produce runnable TypeScript against it), STOP and ask the user concisely. Don't guess. Don't infer from "similar projects." Don't fabricate API signatures.

Likelihood of gaps is low (spec went through 3 independent reviews + iteration), but not zero — especially around webhook auth details that will only be resolved by the day-0 spike.

## Environment notes

- Project isn't a git repo yet (git init happens as part of task #2 in the plan).
- Vercel plugin, Figma plugin, Playwright plugin, GitHub plugin are all enabled in Claude settings (from prior session).
- NotebookLM with research sources: https://notebooklm.google.com/notebook/998afaf3-a222-4828-ab30-0ecf6e1ba33e (ask the user to query if you need live validation of YayForms/Datacrazy/2026-stack specifics).
- Project memory auto-injects (see `~/.claude/projects/D--Users-Johan-Dev-Projects-ticto-new/memory/`).

## Go

Invoke `superpowers:writing-plans` now. When the plan is written and self-reviewed, present the skill's standard execution choice (subagent-driven vs inline) and wait for the user's decision. Do not start executing.
