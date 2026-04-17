# AGENTS.md — ticto-outlier-lp

## Purpose
- This file is the local repo contract for agents working in this repository.
- Keep durable repo rules here. Keep implementation detail, rollout steps, and current project state in the spec, plans, and research docs.

## Source of Truth
- Global defaults from `~/.agents/AGENTS.md` still apply unless this file overrides them.
- This file is the repo-wide source of truth for agent behavior.
- Product and implementation detail live in:
  - `docs/superpowers/specs/2026-04-15-ticto-lp-design.md`
  - `docs/teste-tecnico-automacoes.md`
  - `docs/research/`

## Local Workflows
- Reusable repo workflows live in `.agent/workflows/*.md`.
- When a task clearly matches a local workflow, read that workflow before acting.
- Workflow docs are supplements to this file, not replacements for it.
- **Gemini-Specific:** See `GEMINI.md` for adversarial review roles. Use `/ticto-check` for project constraint validation and `/gemini-review` for global audits.

## Core Invariants
- Secrets stay server-side. Do not expose integration or auth secrets to client code or public env vars.
- Intentionally public env vars (allowlist — do not expand without a documented spec requirement):
  - `NEXT_PUBLIC_SITE_URL` — base URL used in OG metadata and canonical links.
  - `NEXT_PUBLIC_TYPEFORM_FORM_ID` — Typeform form ID (e.g. `FbFMsO5x`), intentionally public because the `@typeform/embed-react` widget mounts client-side and requires the form ID at render time. The same value also lives server-side as `TYPEFORM_FORM_ID` for webhook validation — that is by design, not a duplication bug.
  - Any other `NEXT_PUBLIC_*` var is suspicious unless the plan explicitly requires it and this allowlist is updated in the same PR.
- `proxy.ts` is for security headers only. Do not move request auth, body validation, or business logic into `proxy.ts`.
- Keep webhook and outbound integration auth checks in server-side route handlers or server-only libraries.
- Preserve PII redaction in logs. Emails must be masked like `j***@domain.com`; phone numbers must be masked like `***-1234`.
- Preserve structured error classification for lead flow failures. If new failure classes are added, keep them explicit and machine-readable.
- Do not reintroduce rejected architecture choices from the project spec, especially Zapier, Make, or n8n as the integration layer.

## Validation Contract
- Do not invent validation commands from another project.
- When the app scaffold defines canonical project checks, use those exact repo-defined commands.
- For instruction and workflow edits, verify that referenced files and paths exist and that the local contract stays internally consistent.

## Approval Boundaries
- Pause before deleting files or branches, rewriting Git history, or running destructive shell commands.
- Pause before changing integration schema, webhook contract, deployment stack, or adding major new dependencies.
- Pause before changing public or externally consumed behavior unless the user explicitly asked for that change.

## References
- Current product spec: `docs/superpowers/specs/2026-04-15-ticto-lp-design.md`
- Original briefing: `docs/teste-tecnico-automacoes.md`
- Research and supporting material: `docs/research/`
- Local workflow registry: `.agent/workflows/`
