# Implementation Plan: Create `/gemini-review` Skill

## Objective
Create a specialized Gemini CLI skill named `gemini-review` (invoked via `/gemini-review`) modeled after the `codex` skill. This skill will standardize the adversarial review process for the Ticto landing page project, enforcing the project's strict architectural, security, and accessibility constraints.

## Key Context & Constraints
- **Role:** Adversarial Frontend Reviewer & Senior Integration Architect.
- **Project Specifics:** Ticto landing page (Next.js 16, Tailwind v4, shadcn v4).
- **Core Directives (from `teste-tecnico-automacoes.md` & `codex-review-prompt.md`):**
  - Reject any use of low-code middleware (Zapier, Make, n8n). Enforce direct API integrations (YayForms, Datacrazy).
  - Enforce strict WCAG 2.2 AA accessibility standards.
  - Enforce security best practices (HMAC validation with `timingSafeEqual`, PII masking in logs).
  - Perform visual QA on Tailwind v4 and shadcn implementations.
- **Skill Structure:** Must follow the Gemini `skill-creator` guidelines (concise `SKILL.md` with progressive disclosure).

## Proposed Solution (Implementation Steps)

### 1. Initialize the Skill
Use the Gemini `init_skill.cjs` script to scaffold the `gemini-review` skill directory structure:
```
gemini-review/
├── SKILL.md
└── references/
    ├── constraints.md      # Ticto-specific rules (no Zapier, etc.)
    ├── accessibility.md    # WCAG 2.2 AA audit checklist
    └── security.md         # HMAC, PII, and UTM tracking audit rules
```

### 2. Author `SKILL.md`
Define the core workflow for the `/gemini-review` command. The skill will support three modes (similar to the Codex skill):
- **`/gemini-review plan`**: Reviews architectural plans (like `2026-04-15-ticto-lp-design.md`) against the Ticto brief, scoring them on a 1-10 scale across required dimensions (integration, frontend, security).
- **`/gemini-review pr`**: Reviews a code diff to ensure implemented code matches the approved plan, catching UI/UX regressions and security flaws.
- **`/gemini-review visual`**: Instructs the agent to spin up the local server and use headless browsing (`browse` skill) to empirically test the UI and form submission flow.

The `SKILL.md` will include the adversarial persona prompt (derived from `codex-review-prompt.md`) ensuring the agent adopts a skeptical, "prove it to me" mindset.

### 3. Author Reference Files
- **`references/constraints.md`**: Detail the exact stack (Next 16, Tailwind v4) and the absolute ban on middleware SaaS.
- **`references/accessibility.md`**: Detail keyboard navigation, ARIA roles, and contrast requirements.
- **`references/security.md`**: Detail the Datacrazy UTM mapping requirements and YayForms HMAC validation logic.

### 4. Package and Install
- Run the `package_skill.cjs` script to validate and package the skill into `gemini-review.skill`.
- Install the skill locally for the workspace using `gemini skills install gemini-review.skill --scope workspace`.

## Verification & Testing
1. Reload the skills in the interactive terminal (`/skills reload`).
2. Run `/gemini-review plan` against the existing `docs/superpowers/specs/2026-04-15-ticto-lp-design.md` to verify the output matches the expected adversarial tone and scoring rubric.
3. Verify that the skill correctly flags the absence of Zapier/Make and checks for HMAC validation.
