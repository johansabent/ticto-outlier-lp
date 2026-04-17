# Ticto LP Ebulição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a production landing page (Ticto × Ebulição — iPhone 16 Pro raffle, Rafa Prado event) that renders a Typeform embed, captures 7 tracking params (UTM + sck + src), forwards submissions to Datacrazy CRM via a server-side webhook handler, and ships with full CI, E2E coverage (Datacrazy mocked), screencast evidence, and a public GitHub repo — end-to-end within a 72h window.

**Architecture:** Next.js 16.2 App Router on Vercel Fluid Compute (Node 24). Browser loads LP → a client UTM rehydrator (useLayoutEffect + localStorage + history.replaceState) ensures the 7 params are present in the URL before the Typeform inline embed mounts, which inherits them via the React SDK `hidden` prop. Typeform delivers a signed webhook to `/api/lead` → the Route Handler validates HMAC auth (single mode — Typeform is hmac-only), maps answer array by `field.ref` → named fields via a registry, transforms to a 3-layer Datacrazy payload (`source`, `sourceReferral.sourceUrl`, `notes` as structured JSON), and POSTs to `https://api.g1.datacrazy.io/api/v1/leads`. All secrets live server-side; `proxy.ts` only sets security headers.

**Tech Stack:** Next.js ^16.2 (App Router, `proxy.ts`, async Request APIs), TypeScript ^5.1, Node.js 24 LTS on Vercel Fluid Compute, Tailwind CSS ^4 (CSS-first via `@theme`, no `tailwind.config.ts`), shadcn/ui CLI ^4 (Radix + `data-slot`), `tw-animate-css`, Zod, `@vercel/functions` (waitUntil), `@typeform/embed-react` ^4, Vitest + React Testing Library, Playwright ^1.59, pnpm, Vercel + GitHub integration, GitHub Actions (CI + E2E against Preview URL + Claude Code Action).

---

## Workflow Contract

`main` is protected. Nothing lands on `main` except via a merged PR that passed CI. This section is the contract; the mechanics live in `.agent/workflows/review-pr.md` and `.agent/workflows/review-codex.md` — do not duplicate their content here, reference them.

**Per-task pipeline (applies to every task below, regardless of `[SETUP]` / `[FEATURE]` / `[TEST]` tag):**

1. **Branch.** Create `task-NN-short-slug` off `main` (e.g. `task-04-env-vars`). Never commit directly to `main`.
2. **Implement + validate locally.** Follow the task steps. Run the repo-defined checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e` as relevant — only commands that actually exist in this repo).
3. **Read-only second opinion.** Before opening the PR, invoke `.agent/workflows/review-codex.md` (`/codex review` on the current diff, with a short focus when the change is risky — e.g. "focus on security and data flow" for auth or webhook changes). Fix any P1 findings inline before proceeding.
4. **Open PR.** `gh pr create` (or GitKraken if the user explicitly asks for commit composition there) with a task-scoped title and a body that lists: what changed, why, how validated, and the task ID this closes.
5. **Wait for CI + bots.** Once Task 20 ships CI, the required status check must be green. Active review bots (as of the plan-upgrade gate): **Dependabot** (alerts + weekly PRs) and **CodeQL** + **Claude Code Action** (both introduced by Task 22). No CodeRabbit, no Greptile — the `/review-pr` workflow's greptile handling stays dormant unless the user installs it later.
6. **Resolve PR feedback.** Invoke `.agent/workflows/review-pr.md` — fetch comments + CI status, summarize into BLOCKING / SUGGESTION / NIT / QUESTION, fix locally, push fix commits to the same branch.
7. **Dynamic YOLO loop override (user-authorized 2026-04-16).** For this repo during the 72h window, the agent is authorized to auto-resolve PR review threads it addresses with a code fix, push the fix commit, and merge the PR once every required check is green — without stopping to confirm every individual push/reply. The agent still stops on: (a) a BLOCKING item it cannot resolve with code, (b) a QUESTION requiring product judgment, (c) a reviewer explicitly requesting changes, (d) any review comment flagged as security/secret/credential-related, (e) Dependabot major-version bumps, (f) anything that would require a `git push --force` or a thread resolution on an issue not actually addressed. Between loop iterations, poll on a ≤10-minute cadence. This override applies only while the user remains present and active; if the session is interrupted mid-loop, the next session treats it as paused and re-confirms before resuming.
8. **Merge.** Squash-merge via `gh pr merge --squash --delete-branch` once all required checks are green and all conversations are resolved. Delete the remote branch; prune locally with `git fetch --prune`.

**Hard stops that override YOLO** (always wait for the user):
- Force-push to any branch (secret scrubs, history rewrites)
- Branch protection / repo settings changes
- Any dependency that requires a new paid service or GitHub App install
- Webhook secret rotation, Typeform form-config changes, Vercel env var edits
- Dependabot major-version bump PRs
- Any PR comment classified as BLOCKING where the fix is non-obvious or crosses module boundaries

**Secrets discipline baked into the workflow:**
- `scripts/check-secrets.mjs` (introduced in Task 3) scans built output + repo source for known secret-shaped strings. Task 3 Step 13.5 below extends its scope beyond `.next/out` to include `docs/`, `src/`, `tests/` — the 2026-04-16 leak happened in `docs/decisions/*.md`, which the original scanner would never have seen.
- CI runs `pnpm check:secrets` on every PR (wired in Task 20); a match fails the check and blocks merge under branch protection.
- Pre-commit hook is optional local defense. If wanted, `simple-git-hooks` can be wired in a follow-up, but the machine-enforced gate lives in CI — pre-commit is belt-and-suspenders.
- Replaces the judgment-call "I swear I'll be careful" with a machine gate — exactly the miss that burned the Typeform webhook secret on 2026-04-15/16.

---

## File Structure

Every path is under the project root `ticto-new/`. Create each file in the task that introduces it. Do not scaffold empty files ahead of time.

**Project configuration (root):**
- `package.json` — deps + scripts (created by `create-next-app`, then edited in Task 3)
- `pnpm-lock.yaml` — generated (never hand-edit)
- `tsconfig.json` — Next.js default + `@/*` alias
- `next.config.ts` — minimal; `images.remotePatterns` only; **no** `cacheComponents`
- `postcss.config.mjs` — `{ plugins: { '@tailwindcss/postcss': {} } }`
- `eslint.config.mjs` — Next.js flat config
- `vitest.config.ts` — jsdom + path alias
- `playwright.config.ts` — chromium + `PLAYWRIGHT_TEST_BASE_URL` honoring
- `.gitignore` — standard + `.env.local`, `.vercel`, `coverage/`, `test-results/`, `playwright-report/`
- `.env.example` — documented template, **no real secrets**
- `.node-version` — `24.7.0` (LTS pin for Vercel)
- `README.md` — final deliverable, drafted in Task 24
- `CLAUDE.md` — already exists
- `AGENTS.md` — already exists

**Source (`src/`):**
- `src/app/layout.tsx` — RSC root layout, fonts, metadata
- `src/app/page.tsx` — RSC page composing sections
- `src/app/globals.css` — `@import "tailwindcss"`, `@theme`, OKLCH vars, `tw-animate-css`
- `src/app/api/lead/route.ts` — webhook POST handler (Node runtime)
- `src/components/ui/` — shadcn primitives (added incrementally by Task 17)
- `src/components/sections/hero.tsx`, `about.tsx`, `speakers.tsx`, `cta.tsx`, `footer.tsx` — RSC
- `src/components/typeform-embed.tsx` — client: `@typeform/embed-react` Widget with `hidden` prop
- `src/components/utm-rehydrator.tsx` — client: `useLayoutEffect` first-touch + replaceState
- `src/lib/env.ts` — Zod schema, fail-fast on boot
- `src/lib/logger.ts` — JSON structured log + PII redaction
- `src/lib/typeform-fields.ts` — field-ref registry (stable refs, not IDs)
- `src/lib/webhook-auth.ts` — HMAC-only validator (Typeform single mode)
- `src/lib/utm-mapping.ts` — Typeform payload → Datacrazy (3-layer)
- `src/lib/datacrazy.ts` — `fetch` client with 429 retry + timeout
- `src/lib/attribution.ts` — localStorage helpers (pure; SSR-safe)
- `src/proxy.ts` — security headers only

**Tests (`tests/`):**
- `tests/unit/env.test.ts`
- `tests/unit/logger.test.ts`
- `tests/unit/typeform-fields.test.ts`
- `tests/unit/webhook-auth.test.ts`
- `tests/unit/utm-mapping.test.ts`
- `tests/unit/datacrazy.test.ts`
- `tests/unit/attribution.test.ts`
- `tests/e2e/lead-flow.spec.ts`
- `tests/fixtures/typeform-webhook.json`

**Scripts (`scripts/`):**
- `scripts/check-secrets.mjs` — grep `.next` + `out` for secret tokens

**GitHub (`.github/`):**
- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/claude.yml`
- `.github/ISSUE_TEMPLATE/bug.md`
- `.github/ISSUE_TEMPLATE/task.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

**Docs (`docs/`):**
- `docs/decisions/2026-04-15-webhook-auth.md` — SUPERSEDED YayForms ADR (historical context only)
- `docs/decisions/2026-04-16-typeform-webhook-auth.md` — canonical Typeform ADR, created in Task 1

---

## Task ordering note

Tasks are numbered in the order the engineer should execute them. Each task declares its dependencies. Task 1 (Typeform spike) is `agent:ok` — it is already DONE; proceed to Task 2. Tasks 6–10 (pure libs) can be executed in parallel subagents once Task 5 is complete. Tasks 16 and 17 depend on Task 15 (TypeformEmbed) for the form slot.

---

### Task 1: [SPIKE] Day-0 — Discover Typeform webhook auth format (agent:ok, DONE — unblocks Tasks 8 and 11)

**Files:**
- Created: `docs/decisions/2026-04-16-typeform-webhook-auth.md` (canonical ADR — already committed)
- Historical reference only (do not modify): `docs/decisions/2026-04-15-webhook-auth.md` (SUPERSEDED YayForms ADR)
- Create: `tests/fixtures/typeform-webhook.json` (canonical fixture from ADR)
- Test: none (this was a manual discovery spike; a real webhook was captured and documented)

**Status: DONE.** This spike was completed on 2026-04-16 and captured in `docs/decisions/2026-04-16-typeform-webhook-auth.md`. All findings below are from that ADR. Tasks 8 and 11 are unblocked.

**Summary of findings:**
- Platform: **Typeform** (replaced YayForms per reviewer request — stronger documentation, `@typeform/embed-react` SDK)
- Form ID: **`FbFMsO5x`** (already created with 5 fields + 7 UTM hidden fields + V2 webhook)
- Auth mode: **hmac** (single mode — Typeform only offers HMAC; no multi-mode switching needed)
- Signature header: **`typeform-signature`** (lowercase), format **`sha256=<base64>`**
- Encoding: **base64** (not hex — important difference from the original YayForms ADR)
- No timestamp header — use `form_response.submitted_at` for a 5-minute replay window
- Fixture body: canonical in `tests/fixtures/typeform-webhook.json` (see below)
- Blockers cleared: Tasks 8 and 11 unblocked; no `WEBHOOK_AUTH_MODE` env var needed (single mode)

**Field registry (stable refs — key by `field.ref`, never by `field.id`):**

| Ref | Type | Required |
|---|---|---|
| `nome` | `short_text` | yes |
| `cpf` | `short_text` | yes |
| `email` | `email` | yes |
| `telefone` | `phone_number` | yes |
| `sells_online` | `multiple_choice` | yes |

**Hidden fields (7 UTMs, declared in Typeform form config):**
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`

- [ ] **Step 1: Create the canonical test fixture**

Create `tests/fixtures/typeform-webhook.json`:
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
      { "type": "text",         "text": "Teste QA",               "field": { "ref": "nome",         "type": "short_text" } },
      { "type": "text",         "text": "12345678900",            "field": { "ref": "cpf",          "type": "short_text" } },
      { "type": "email",        "email": "teste@example.com",     "field": { "ref": "email",        "type": "email" } },
      { "type": "phone_number", "phone_number": "+5511900000000", "field": { "ref": "telefone",     "type": "phone_number" } },
      { "type": "choice",       "choice": { "label": "Sim", "ref": "490ea062-6100-416d-96fa-17e8e8991a4e" }, "field": { "ref": "sells_online", "type": "multiple_choice" } }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/typeform-webhook.json docs/decisions/2026-04-16-typeform-webhook-auth.md
git commit -m "docs(spike): capture Typeform webhook auth mode from day-0 discovery"
```

**Acceptance:** ADR present at `docs/decisions/2026-04-16-typeform-webhook-auth.md` with real header dump and fixture body. Fixture at `tests/fixtures/typeform-webhook.json`. Tasks 8 and 11 can proceed.

---

### Task 2: [SETUP] Initialize GitHub repo, push skeleton, connect Vercel

**Files:**
- Modify: `.gitignore` (append project-specific ignores after `create-next-app` adds its defaults — done in Task 3)
- Create: `.github/` directory (empty; populated in later tasks)

**Dependencies:** none (can run in parallel with Task 1 if a second pair of hands is available).

- [ ] **Step 1: Initialize git repository**

Run in `D:/Users/Johan/Dev Projects/ticto-new/`:
```bash
git init -b main
git config user.email "johansabent@gmail.com"
git config user.name "Johan Sabent"
```

- [ ] **Step 2: Create initial .gitignore before scaffold**

Create the file first so `create-next-app` output gets tracked cleanly:
```gitignore
# dependencies
node_modules/
.pnp
.pnp.js

# env
.env.local
.env.*.local

# next
.next/
out/

# vercel
.vercel

# testing
coverage/
test-results/
playwright-report/
playwright/.cache/

# editor
.vscode/
.idea/
.DS_Store

# logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
```

- [ ] **Step 3: Stage current docs + AGENTS.md/CLAUDE.md**

```bash
git add .gitignore AGENTS.md CLAUDE.md docs/
git commit -m "chore: bootstrap repo with existing specs, research, and agent docs"
```

- [ ] **Step 4: Create public GitHub repo via gh CLI**

```bash
gh repo create johansabent/ticto-ebulicao-lp \
  --public \
  --description "Landing page Ebulição × Ticto — Next.js 16 + Typeform + Datacrazy CRM. Teste técnico Ticto 2026." \
  --source . \
  --push
```

Expected output: a URL like `https://github.com/johansabent/ticto-ebulicao-lp` and the initial commit pushed.

- [ ] **Step 5: Apply repo topics**

```bash
gh repo edit johansabent/ticto-ebulicao-lp --add-topic nextjs,typescript,tailwindcss,shadcn-ui,vercel,webhook,crm-integration,lead-capture,landing-page,automation
```

- [ ] **Step 6: Create the label taxonomy from spec §16.1**

```bash
for lbl in \
  "priority:p0=#b60205" \
  "priority:p1=#d93f0b" \
  "priority:p2=#fbca04" \
  "priority:p3=#0e8a16" \
  "type:spike=#5319e7" \
  "type:setup=#1d76db" \
  "type:feature=#0e8a16" \
  "type:test=#c5def5" \
  "type:docs=#bfdadc" \
  "type:security=#b60205" \
  "type:deploy=#0052cc" \
  "area:webhook=#fef2c0" \
  "area:crm=#fef2c0" \
  "area:attribution=#fef2c0" \
  "area:ui=#fef2c0" \
  "area:infra=#fef2c0" \
  "status:blocked=#6a737d" \
  "status:ready=#0e8a16" \
  "status:in-progress=#fbca04" \
  "status:done=#ededed" \
  "agent:ok=#c2e0c6" \
  "agent:review-required=#fbca04" \
  "agent:pair=#d4c5f9"; do
  name="${lbl%=*}"
  color="${lbl#*=}"
  gh label create "$name" --color "${color#\#}" --force
done
```

Expected: 23 labels created or updated.

- [ ] **Step 7: Connect Vercel to the repo via CLI**

```bash
vercel login      # one-time, if not already logged in
vercel link --yes --project ticto-ebulicao-lp --scope johansabent
```

Expected: `.vercel/project.json` created (already gitignored). If the project doesn't exist Vercel will prompt to create it; accept defaults.

- [ ] **Step 8: Enable GitHub integration**

Open `https://vercel.com/johansabent/ticto-ebulicao-lp/settings/git` and confirm the repo is connected. Set production branch = `main`. Leave Preview = all other branches.

> Can also be done via `vercel git connect`; GUI is faster for 72h.

- [ ] **Step 8.1: Enable branch protection on `main`**

Classic branch protection (free on public repos). Writes this contract into GitHub itself so any future accidental `git push origin main` is rejected by the remote, not just by convention.

```bash
cat > /tmp/branch-protection.json <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
gh api --method PUT repos/johansabent/ticto-ebulicao-lp/branches/main/protection --input /tmp/branch-protection.json
```

Expected: JSON body back with `required_pull_request_reviews.required_approving_review_count: 0`, `allow_force_pushes.enabled: false`, and `enforce_admins.enabled: true`. **The admin-exempt loophole is closed deliberately** — the 2026-04-16 leak happened from an admin account; letting the admin bypass the rule would keep the exact miss this workflow exists to prevent. Once CI lands in Task 20, return here and add the CI job name to `required_status_checks.contexts`. If a force-push is ever needed for a follow-up history scrub, temporarily relax the rule via `gh api --method DELETE repos/.../branches/main/protection/enforce_admins`, do the rewrite, and re-enable with PUT — never leave admin bypass on by default.

- [ ] **Step 8.2: Enable Dependabot alerts + automated security fixes**

```bash
gh api --method PUT repos/johansabent/ticto-ebulicao-lp/vulnerability-alerts
gh api --method PUT repos/johansabent/ticto-ebulicao-lp/automated-security-fixes
```

Both endpoints return `204 No Content` when successful.

Then commit the scheduling policy to the repo:

```bash
# File contents: see .github/dependabot.yml — weekly npm + github-actions,
# minor+patch grouped into one PR per ecosystem, majors solo.
git add .github/dependabot.yml
```

(The commit lands with the next PR; do not push to main directly.)

- [ ] **Step 9: Verify**

```bash
gh repo view johansabent/ticto-ebulicao-lp --json url,visibility,isPrivate
```
Expected: `"visibility": "PUBLIC"`, `"isPrivate": false`.

```bash
vercel project ls
```
Expected: `ticto-ebulicao-lp` appears.

No commit for this task — only config and remote-side setup.

---

### Task 3: [SETUP] Scaffold Next.js 16 + pnpm + TS + Tailwind v4 + shadcn v4 + Vitest + Playwright

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.node-version`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `scripts/check-secrets.mjs`
- Modify: `.gitignore` (append if needed)
- Test: `tests/unit/sanity.test.ts` (throwaway, deleted after verification)

**Dependencies:** Task 2.

- [ ] **Step 1: Bootstrap Next.js 16 skeleton into project root**

```bash
pnpm dlx create-next-app@16.2 . \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --no-turbopack-config \
  --skip-install
```

Answer "yes" to "directory not empty, continue?". `create-next-app` will merge into existing files; it must not clobber `AGENTS.md`, `CLAUDE.md`, `.gitignore`, or `docs/`.

- [ ] **Step 2: Pin versions and add project-specific deps**

Open `package.json`, replace `scripts` + `dependencies` + `devDependencies` entirely with:

```json
{
  "name": "ticto-ebulicao-lp",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=24.0.0 <25.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "check:secrets": "node scripts/check-secrets.mjs"
  },
  "dependencies": {
    "next": "^16.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8",
    "@vercel/functions": "^3.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.17.0",
    "eslint-config-next": "^16.2.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "tw-animate-css": "^1.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` generated. If `shadcn@latest init` later complains about React 19, keep going — v4 supports it.

- [ ] **Step 4: Pin Node version for Vercel**

Create `.node-version` (match the machine version for local/Vercel parity):
```
24.14.1
```

- [ ] **Step 5: Replace `next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'form.typeform.com' },
      { protocol: 'https', hostname: 'images.typeform.com' },
    ],
  },
};

export default config;
```

- [ ] **Step 6: Replace `postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

Delete any `tailwind.config.ts` / `tailwind.config.js` that `create-next-app` generated — Tailwind v4 is CSS-first.

```bash
rm -f tailwind.config.ts tailwind.config.js tailwind.config.mjs
```

- [ ] **Step 7: Replace `src/app/globals.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-muted: oklch(0.97 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-border: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);

  --font-sans: var(--font-geist-sans, system-ui, sans-serif);
  --font-mono: var(--font-geist-mono, ui-monospace, monospace);

  --radius: 0.625rem;
}

@layer base {
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
}
```

*(These tokens are neutral defaults; Task 16 overwrites them with the Figma palette.)*

- [ ] **Step 8: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Ebulição — Ticto',
  description: 'O principal evento presencial de marketing digital da Ticto.',
  openGraph: {
    title: 'Ebulição — Ticto',
    description: 'O principal evento presencial de marketing digital da Ticto.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Replace `src/app/page.tsx` with a placeholder**

```tsx
export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Scaffold OK — LP comes in Task 17.</p>
    </main>
  );
}
```

- [ ] **Step 10: Initialize shadcn v4 CLI**

```bash
pnpm dlx shadcn@latest init
```

Answer:
- Which style? → **New York**
- Which base color? → **Neutral**
- Where is your global CSS? → `src/app/globals.css`
- Would you like to use CSS variables for colors? → **Yes**
- Where is your tailwind config? → *(press Enter to accept `no config — v4)*`
- What import alias for components? → `@/components`
- What import alias for utils? → `@/lib/utils`
- Are you using React Server Components? → **Yes**

This creates `src/lib/utils.ts` (with `cn()`) and updates `globals.css`. Re-apply the `@theme` block from Step 7 if shadcn overrode the color tokens.

- [ ] **Step 11: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

Add to `tsconfig.json` under `compilerOptions.types`:
```json
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

- [ ] **Step 12: Configure Playwright**

```bash
pnpm exec playwright install --with-deps chromium
```

Create `playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```

- [ ] **Step 13: Create the check-secrets script**

Create `scripts/check-secrets.mjs`:
```javascript
#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [
  'DATACRAZY_API_TOKEN',
  'TYPEFORM_WEBHOOK_SECRET',
  'TYPEFORM_FORM_ID',
];

const SCAN_ROOTS = ['.next/static', '.next/server/app', 'out'];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const p = join(dir, e);
    const s = await stat(p);
    if (s.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

function onlyClient(path) {
  return path.includes(`${'.next'}/static`) || path.startsWith('out');
}

async function main() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const files = await walk(root);
    for (const f of files) {
      if (!onlyClient(f)) continue;
      if (!/\.(js|mjs|cjs|html|json)$/.test(f)) continue;
      const body = await readFile(f, 'utf8').catch(() => '');
      for (const key of FORBIDDEN) {
        if (body.includes(key)) hits.push({ file: f, key });
      }
    }
  }
  if (hits.length > 0) {
    console.error('SECRET LEAK DETECTED in client bundle:');
    for (const h of hits) console.error(`  ${h.file} -> ${h.key}`);
    process.exit(1);
  }
  console.log('check:secrets OK — no forbidden env keys found in client bundle.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
```

- [ ] **Step 13.5: Extend `scripts/check-secrets.mjs` to cover source + docs**

The original scanner only walks `.next` + `out`. The 2026-04-15/16 webhook-secret leak lived in `docs/decisions/*.md`, which the scanner would never have seen. Extend it to scan the repo tree for both (a) known burned secret values as a literal deny-list, and (b) secret-shaped tokens by regex. Append the following to `scripts/check-secrets.mjs` and wire it as a second scan phase after the existing client-bundle scan:

```javascript
// Repo-source scan (second phase) — additive to the existing client-bundle check above.
import { createHash } from 'node:crypto';

const SOURCE_ROOTS = ['docs', 'src', 'tests', '.github'];

// Known burned values live OUTSIDE this file — storing the literal here would
// re-leak the exact thing we scrubbed, and would make the scanner flag its own
// plan/script forever. Instead we store SHA-256 prefixes of burned values.
// To add a new entry: run `echo -n "<leaked-value>" | sha256sum | cut -c1-16`
// and paste the 16-char prefix below. Never paste the plaintext here.
const BURNED_HASH_PREFIXES = [
  // 2026-04-16: Typeform webhook secret committed to public repo, rotated same day.
  // sha256("<burned-value>") sliced to first 16 chars — irreversible and non-leaking.
  '6bdb4852bf6d6042',
];

// Shape-based patterns: catch newly-leaked secrets we don't explicitly know about.
// Keep patterns tight — false positives turn this into noise and it gets ignored.
// Deliberately NO generic hex/base64 catch-all — the superseded YayForms ADR contains
// a real 64-char webhook signature as documentation, which a generic rule would flag.
const SECRET_PATTERNS = [
  { name: 'Typeform PAT', re: /\btfp_[A-Za-z0-9_-]{40,}\b/ },
  { name: 'GitHub PAT (classic)', re: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/ },
  { name: 'Vercel token', re: /\bvercel_[A-Za-z0-9]{24,}\b/ },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack bot token', re: /\bxoxb-[0-9]+-[0-9]+-[A-Za-z0-9]{24,}\b/ },
];

const SOURCE_INCLUDE = /\.(m?[jt]sx?|json|md|mdx|ya?ml|toml|html|css|env\..*|txt)$/;
const SOURCE_EXCLUDE = /(^|\/)(node_modules|\.next|out|coverage|test-results|playwright-report|\.git|\.vercel|\.pnpm-cache|\.npm-cache)(\/|$)/;

// Sliding-window scan for burned-value hashes. We hash every token that looks
// like it could be a secret (length 12-128, common secret charset) and compare
// the first 16 chars of its sha256 against the deny-list. This catches the exact
// burned value even when it has no recognizable "shape" (e.g., a phrase like
// "openclaw-webhook-secret-2026"), without ever committing the plaintext.
function sha256Prefix(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function candidateTokens(body) {
  // Tokens = contiguous runs of [A-Za-z0-9_-] between 12 and 128 chars.
  return body.match(/[A-Za-z0-9][A-Za-z0-9_\-]{11,127}/g) ?? [];
}

async function sourceScan() {
  const findings = [];
  const burned = new Set(BURNED_HASH_PREFIXES);
  async function walkSource(dir) {
    let entries;
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      if (SOURCE_EXCLUDE.test(p.replace(/\\/g, '/'))) continue;
      const s = await stat(p);
      if (s.isDirectory()) { await walkSource(p); continue; }
      if (!SOURCE_INCLUDE.test(p)) continue;
      const body = await readFile(p, 'utf8').catch(() => '');
      // Phase A: hash-based burned-value detection
      for (const tok of candidateTokens(body)) {
        if (burned.has(sha256Prefix(tok))) {
          findings.push({ file: p, hit: `burned-hash-match:${sha256Prefix(tok)}` });
        }
      }
      // Phase B: shape-based detection
      for (const { name, re } of SECRET_PATTERNS) {
        const m = body.match(re);
        if (m && !/REDACTED|example|placeholder|fixture|test-/i.test(m[0])) {
          findings.push({ file: p, hit: `${name}:${m[0].slice(0, 12)}…` });
        }
      }
    }
  }
  for (const root of SOURCE_ROOTS) await walkSource(root);
  return findings;
}

// Call this after the client-bundle scan, before the success log:
const srcHits = await sourceScan();
if (srcHits.length > 0) {
  console.error('SECRET LEAK DETECTED in repo source:');
  for (const h of srcHits) console.error(`  ${h.file} -> ${h.hit}`);
  process.exit(1);
}
```

**Why hashes, not literals:** writing the burned plaintext into the scanner would (a) re-publish it in the public repo and (b) make the scanner flag its own code forever. The 16-char sha256 prefix is irreversible and non-colliding in practice for short strings (~64 bits of entropy). If a burned value is rotated, add its hash prefix here; if it's discovered that the old prefix ever had a false-positive collision, swap to a 32-char prefix. `SOURCE_ROOTS` deliberately excludes `scripts/` so the scanner cannot flag itself regardless of false-positive risk. Rewire `main()` so both phases run and both contribute to the exit code.

- [ ] **Step 14: Write a throwaway sanity test**

Create `tests/unit/sanity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('vitest is wired', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 15: Run the full validation chain**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all four pass. `pnpm build` produces `.next/` output. Then:
```bash
pnpm check:secrets
```
Expected: `check:secrets OK — no forbidden env keys found in client bundle.`

- [ ] **Step 16: Delete the throwaway sanity test**

```bash
rm tests/unit/sanity.test.ts
```

- [ ] **Step 17: Commit**

```bash
git add .
git commit -m "chore(scaffold): Next.js 16 + Tailwind v4 + shadcn v4 + Vitest + Playwright baseline"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

Expected: Vercel triggers a Preview deployment on push (observable at `https://vercel.com/johansabent/ticto-ebulicao-lp/deployments`). It will fail at runtime because env vars aren't set yet — acceptable; Task 4 fixes that.

> **Note:** `@typeform/embed-react` is added as a production dependency in Task 15 (`pnpm add @typeform/embed-react@^4.0.0`) — not listed here to keep the scaffold minimal.

---

### Task 4: [SETUP] Configure environment variables (Vercel Dashboard + .env.example)

**Files:**
- Create: `.env.example`
- Modify: none
- Test: none (env values are not in git; validation happens in Task 5)

**Dependencies:** Task 1 (`TYPEFORM_WEBHOOK_SECRET` + `TYPEFORM_FORM_ID` confirmed by spike), Task 3 (project exists).

> **One-time Typeform UI action (manual, done outside code):** Open form `FbFMsO5x` in the Typeform editor → Settings → Hidden fields. Confirm **8 hidden fields** are declared: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `sck`, `src`, `landing_page`. Typeform silently drops any hidden field that isn't declared in advance, so `landing_page` MUST exist before Task 15 ships. This is the authoritative source of the visitor's landing URL on the webhook side (the server-to-server POST has no useful `Referer` header).

- [ ] **Step 1: Draft `.env.example` with every required variable**

Create `.env.example`:
```bash
# ---------------------------------------------------------------------------
# Datacrazy CRM (server-only) — Bearer token for POST /api/v1/leads.
# Generate at https://crm.datacrazy.io/config/api (token shown once).
# ---------------------------------------------------------------------------
DATACRAZY_API_TOKEN=

# ---------------------------------------------------------------------------
# Typeform webhook secret (server-only).
# Set in Typeform → Connect → Webhooks → Edit → Secret.
# The original spike secret was committed to the public repo and BURNED;
# the active value was rotated on 2026-04-16 and lives only in Vercel env
# vars and this gitignored file. Never paste it into committed source.
# ---------------------------------------------------------------------------
TYPEFORM_WEBHOOK_SECRET=

# ---------------------------------------------------------------------------
# Typeform form ID (server-only — used to validate incoming webhook form_id).
# From the ADR: FbFMsO5x
# ---------------------------------------------------------------------------
TYPEFORM_FORM_ID=FbFMsO5x

# ---------------------------------------------------------------------------
# Public base URL used in OG metadata and canonical links.
# ---------------------------------------------------------------------------
NEXT_PUBLIC_SITE_URL=https://ticto-ebulicao-lp.vercel.app

# ---------------------------------------------------------------------------
# Typeform form ID exposed to client for the embed widget.
# Same value as TYPEFORM_FORM_ID — intentionally public.
# ---------------------------------------------------------------------------
NEXT_PUBLIC_TYPEFORM_FORM_ID=FbFMsO5x
```

- [ ] **Step 2: Populate local `.env.local` for dev**

Copy the template and fill with real values:

```bash
cp .env.example .env.local
```

Edit `.env.local` manually with real values. `.env.local` is gitignored — never commit.

- [ ] **Step 3: Set env vars in Vercel Dashboard (both Preview and Production)**

Using Vercel CLI:
```bash
vercel env add DATACRAZY_API_TOKEN production preview
# paste the token when prompted

vercel env add TYPEFORM_WEBHOOK_SECRET production preview
# paste the production secret (rotate from the spike value)

vercel env add TYPEFORM_FORM_ID production preview
# paste: FbFMsO5x

vercel env add NEXT_PUBLIC_SITE_URL production preview
# paste https://ticto-ebulicao-lp.vercel.app (update after final domain is assigned)

vercel env add NEXT_PUBLIC_TYPEFORM_FORM_ID production preview
# paste: FbFMsO5x
```

- [ ] **Step 4: Pull env back to local to confirm**

```bash
vercel env pull .env.local
cat .env.local | grep -c '^[A-Z]'
```

Expected count: `5` lines starting with an uppercase env var name.

- [ ] **Step 5: Verify `.env.local` is gitignored**

```bash
git check-ignore .env.local
```

Expected: `.env.local` (printed back → confirms ignored).

- [ ] **Step 6: Commit the example template**

```bash
git add .env.example
git commit -m "chore(env): document required environment variables in .env.example"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

**Acceptance:** `vercel env ls` shows all 5 variables in Production + Preview; `.env.local` exists and is gitignored.

---

### Task 5: [FEATURE] `lib/env.ts` with Zod schema + fail-fast

**Files:**
- Create: `src/lib/env.ts`, `tests/unit/env.test.ts`
- Modify: none
- Test: `tests/unit/env.test.ts`

**Dependencies:** Task 3 (Zod installed), Task 4 (env shape defined).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/env.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function reset() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
}

function setValidEnv() {
  process.env.DATACRAZY_API_TOKEN = 'tok_live_123';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'whsec_abcdef_long_enough';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ticto-ebulicao-lp.vercel.app';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
}

describe('lib/env', () => {
  beforeEach(() => reset());
  afterEach(() => reset());

  it('parses a fully-populated env and exposes typed getters', async () => {
    setValidEnv();
    const { getServerEnv, getClientEnv } = await import('@/lib/env');
    const srv = getServerEnv();
    expect(srv.DATACRAZY_API_TOKEN).toBe('tok_live_123');
    expect(srv.TYPEFORM_WEBHOOK_SECRET).toBe('whsec_abcdef_long_enough');
    expect(srv.TYPEFORM_FORM_ID).toBe('FbFMsO5x');

    const cli = getClientEnv();
    expect(cli.NEXT_PUBLIC_SITE_URL).toBe('https://ticto-ebulicao-lp.vercel.app');
    expect(cli.NEXT_PUBLIC_TYPEFORM_FORM_ID).toBe('FbFMsO5x');
  });

  it('throws when DATACRAZY_API_TOKEN is missing', async () => {
    setValidEnv();
    delete process.env.DATACRAZY_API_TOKEN;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /DATACRAZY_API_TOKEN/,
    );
  });

  it('throws when TYPEFORM_WEBHOOK_SECRET is missing in production', async () => {
    setValidEnv();
    process.env.NODE_ENV = 'production';
    delete process.env.TYPEFORM_WEBHOOK_SECRET;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /TYPEFORM_WEBHOOK_SECRET/,
    );
  });

  it('throws when TYPEFORM_FORM_ID is missing', async () => {
    setValidEnv();
    delete process.env.TYPEFORM_FORM_ID;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /TYPEFORM_FORM_ID/,
    );
  });

  it('throws when NEXT_PUBLIC_SITE_URL is not a valid URL', async () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    await expect(import('@/lib/env').then((m) => m.getClientEnv())).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });
});
```

> **Note on dynamic import:** `getServerEnv` must re-parse on every call, not cache at module load, so that test mutation is observable. The test imports dynamically so top-level side effects are deferred.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/env.test.ts
```
Expected: FAIL — "Failed to resolve import @/lib/env" (module doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/env.ts`**

```typescript
import { z } from 'zod';

// TYPEFORM_WEBHOOK_SECRET: required in production, optional in test/dev
const isProduction = process.env.NODE_ENV === 'production';

const serverSchema = z.object({
  DATACRAZY_API_TOKEN: z.string().min(1, 'DATACRAZY_API_TOKEN is required'),
  TYPEFORM_WEBHOOK_SECRET: isProduction
    ? z.string().min(16, 'TYPEFORM_WEBHOOK_SECRET must be at least 16 chars in production')
    : z.string().min(1).optional().default('dev-placeholder-secret'),
  TYPEFORM_FORM_ID: z.string().min(1, 'TYPEFORM_FORM_ID is required'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_TYPEFORM_FORM_ID: z.string().min(1, 'NEXT_PUBLIC_TYPEFORM_FORM_ID is required'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be a valid URL'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

export function getClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_TYPEFORM_FORM_ID: process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/env.test.ts
```
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts tests/unit/env.test.ts
git commit -m "feat(env): add Zod fail-fast env validation for Typeform + Datacrazy env vars"
```

---

### Task 6: [FEATURE] `lib/logger.ts` — JSON structured log + PII redaction

**Files:**
- Create: `src/lib/logger.ts`, `tests/unit/logger.test.ts`
- Modify: none
- Test: `tests/unit/logger.test.ts`

**Dependencies:** Task 5 (co-import patterns; no direct env dep here).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/logger.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, redactEmail, redactPhone, type LeadEvent } from '@/lib/logger';

describe('lib/logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redactEmail keeps first char + domain', () => {
    expect(redactEmail('joao.silva@example.com')).toBe('j***@example.com');
    expect(redactEmail('a@b.co')).toBe('a***@b.co');
    expect(redactEmail('')).toBe('');
    expect(redactEmail('not-an-email')).toBe('***');
  });

  it('redactPhone keeps only last 4 digits', () => {
    expect(redactPhone('+5511999991234')).toBe('***-1234');
    expect(redactPhone('11999991234')).toBe('***-1234');
    expect(redactPhone('1234')).toBe('***-1234');
    expect(redactPhone('')).toBe('');
    expect(redactPhone('abc')).toBe('***');
  });

  it('logger.info writes a single-line JSON document with event + timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const evt: LeadEvent = {
      event: 'lead.received',
      request_id: 'req-1',
      auth_mode: 'hmac',   // Typeform is hmac-only
      auth_valid: true,
      timing_ms: 42,
    };
    logger.info(evt);
    expect(spy).toHaveBeenCalledOnce();
    const raw = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.event).toBe('lead.received');
    expect(parsed.level).toBe('info');
    expect(parsed.request_id).toBe('req-1');
    expect(typeof parsed.ts).toBe('string');
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
  });

  it('logger.error writes with level=error', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.error({
      event: 'lead.failed',
      submission_id: 's1',
      error_class: 'datacrazy_5xx',
      error_message: 'boom',
    });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.error_class).toBe('datacrazy_5xx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/logger.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/logger.ts`**

```typescript
export type ErrorClass =
  | 'auth_invalid'
  | 'parse_error'
  | 'field_map_incomplete'
  | 'datacrazy_4xx'
  | 'datacrazy_5xx'
  | 'datacrazy_timeout';

export type LeadEvent =
  | {
      event: 'lead.received';
      request_id: string;
      auth_mode: 'hmac';
      auth_valid: boolean;
      timing_ms: number;
    }
  | {
      event: 'lead.mapped';
      request_id: string;
      submission_id: string | undefined;
      field_count_mapped: number;
      utm_keys_present: string[];
    }
  | {
      event: 'lead.forwarded';
      request_id: string;
      submission_id: string | undefined;
      datacrazy_status: number;
      datacrazy_lead_id: string | number | null;
      timing_ms: number;
    }
  | {
      event: 'lead.failed';
      request_id?: string;
      submission_id?: string | undefined;
      error_class: ErrorClass;
      error_message: string;
    };

export function redactEmail(raw: string): string {
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at < 1) return '***';
  return `${raw[0]}***${raw.slice(at)}`;
}

export function redactPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 1) return '***';
  const tail = digits.slice(-4).padStart(4, digits);
  return `***-${tail}`;
}

function write(level: 'info' | 'warn' | 'error', evt: LeadEvent): void {
  console.log(
    JSON.stringify({
      level,
      ts: new Date().toISOString(),
      ...evt,
    }),
  );
}

export const logger = {
  info: (evt: LeadEvent) => write('info', evt),
  warn: (evt: LeadEvent) => write('warn', evt),
  error: (evt: LeadEvent) => write('error', evt),
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/logger.test.ts
```
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger.ts tests/unit/logger.test.ts
git commit -m "feat(obs): JSON structured logger with email/phone redaction"
```

---

### Task 7: [FEATURE] `lib/typeform-fields.ts` — field-ref registry

**Files:**
- Create: `src/lib/typeform-fields.ts`, `tests/unit/typeform-fields.test.ts`
- Modify: none
- Test: `tests/unit/typeform-fields.test.ts`

**Dependencies:** Task 5 (env.ts in place), Task 1 (fixture committed).

**Key design decision:** Typeform answers arrive as an **array** (`form_response.answers[]`). Each element has a `field.ref` (stable across form edits) and a type-dependent value key (`text`, `email`, `phone_number`, `choice`). We index by `field.ref`, never by position or `field.id`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/typeform-fields.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseAnswers, FIELD_REFS, type TypeformAnswer } from '@/lib/typeform-fields';
import fixture from '../fixtures/typeform-webhook.json';

describe('lib/typeform-fields', () => {
  it('FIELD_REFS defines the 5 required fields with correct types', () => {
    expect(FIELD_REFS.nome.type).toBe('text');
    expect(FIELD_REFS.cpf.type).toBe('text');
    expect(FIELD_REFS.email.type).toBe('email');
    expect(FIELD_REFS.telefone.type).toBe('phone_number');
    expect(FIELD_REFS.sells_online.type).toBe('choice');
    expect(FIELD_REFS.nome.required).toBe(true);
  });

  it('parseAnswers extracts all 5 fields from the canonical fixture', () => {
    const answers = fixture.form_response.answers as TypeformAnswer[];
    const out = parseAnswers(answers);
    expect(out.nome).toBe('Teste QA');
    expect(out.cpf).toBe('12345678900');
    expect(out.email).toBe('teste@example.com');
    expect(out.telefone).toBe('+5511900000000');
    expect(out.sells_online).toBe('Sim');
  });

  it('parseAnswers extracts choice by label, not by choice.ref', () => {
    const answers: TypeformAnswer[] = [
      { type: 'choice', choice: { label: 'Não', ref: 'some-uuid' }, field: { ref: 'sells_online', type: 'multiple_choice' } },
    ];
    const out = parseAnswers(answers);
    expect(out.sells_online).toBe('Não');
  });

  it('parseAnswers throws when a required field is missing', () => {
    // Drop 'email' from answers
    const answers = fixture.form_response.answers.filter(
      (a: TypeformAnswer) => a.field.ref !== 'email',
    ) as TypeformAnswer[];
    expect(() => parseAnswers(answers)).toThrow(/email/);
  });

  it('parseAnswers throws when answers is not an array', () => {
    expect(() => parseAnswers(null as never)).toThrow();
    expect(() => parseAnswers({} as never)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/typeform-fields.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/typeform-fields.ts`**

```typescript
// Field ref registry — keyed by stable ref, not by Typeform field ID (which can change)
export const FIELD_REFS = {
  nome:         { type: 'text' as const,         required: true },
  cpf:          { type: 'text' as const,         required: true },
  email:        { type: 'email' as const,        required: true },
  telefone:     { type: 'phone_number' as const, required: true },
  sells_online: { type: 'choice' as const,       required: true },
} as const;

export type TypeformAnswer = {
  type: 'text' | 'email' | 'phone_number' | 'choice';
  field: { ref: string; type: string; id?: string };
  text?: string;
  email?: string;
  phone_number?: string;
  choice?: { label: string; ref: string };
};

export type AnswerByRef = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  sells_online: string; // choice.label (human-readable)
};

function extractValue(answer: TypeformAnswer): string | undefined {
  switch (answer.type) {
    case 'text':         return answer.text;
    case 'email':        return answer.email;
    case 'phone_number': return answer.phone_number;
    case 'choice':       return answer.choice?.label;
    default:             return undefined;
  }
}

export function parseAnswers(answers: TypeformAnswer[]): AnswerByRef {
  if (!Array.isArray(answers)) {
    throw new TypeError('Typeform answers must be an array');
  }

  // Index answers by field.ref
  const byRef = new Map<string, TypeformAnswer>();
  for (const a of answers) {
    byRef.set(a.field.ref, a);
  }

  const result: Partial<AnswerByRef> = {};
  for (const [ref, meta] of Object.entries(FIELD_REFS)) {
    const answer = byRef.get(ref);
    if (!answer) {
      if (meta.required) {
        throw new Error(`Missing required Typeform field: ${ref}`);
      }
      continue;
    }
    const value = extractValue(answer);
    if (!value && meta.required) {
      throw new Error(`Empty value for required Typeform field: ${ref} (type: ${answer.type})`);
    }
    if (value) {
      (result as Record<string, string>)[ref] = value;
    }
  }

  return result as AnswerByRef;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/typeform-fields.test.ts
```
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/typeform-fields.ts tests/unit/typeform-fields.test.ts
git commit -m "feat(webhook): Typeform field-ref registry with parseAnswers (array-indexed by ref)"
```

---

### Task 8: [FEATURE] `lib/webhook-auth.ts` — HMAC-only Typeform validator (agent:review-required)

**Files:**
- Create: `src/lib/webhook-auth.ts`, `tests/unit/webhook-auth.test.ts`
- Modify: none
- Test: `tests/unit/webhook-auth.test.ts`

**Dependencies:** Task 1 (ADR + fixture committed), Task 5.

**Review gate:** Before starting this task, re-read `docs/decisions/2026-04-16-typeform-webhook-auth.md`. Key implementation details:
- Header: `typeform-signature` (case-insensitive)
- Format: `sha256=<base64>` — strip `sha256=` prefix, then `Buffer.from(value, 'base64')`
- Encoding: **base64** (not hex)
- HMAC: `createHmac('sha256', secret).update(rawBodyBuffer).digest('base64')`
- Replay window: reject if `form_response.submitted_at` missing / unparseable / outside ±5 minutes
- No `WEBHOOK_AUTH_MODE` switching — single function `verifyTypeformSignature()`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/webhook-auth.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTypeformSignature } from '@/lib/webhook-auth';
import fixtureRaw from '../fixtures/typeform-webhook.json';

// Test-only value. Unrelated to the production webhook secret, which lives only
// in Vercel env vars + local `.env.local`. This string is self-contained: the
// test computes its own "expected" signature with the same literal, so the value
// never needs to match anything in the outside world.
const SECRET = 'typeform-webhook-test-fixture-secret';

// Compute expected signature the same way Typeform does
function makeSignature(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('base64');
}

const FIXTURE_BODY = JSON.stringify(fixtureRaw);
const VALID_SIG = makeSignature(FIXTURE_BODY, SECRET);

// submitted_at from fixture: 2026-04-16T21:00:39Z — fake "now" close to it for replay tests
const FIXTURE_NOW = new Date('2026-04-16T21:02:00Z'); // 81 seconds after submission — within 5 min

describe('lib/webhook-auth — verifyTypeformSignature', () => {
  it('accepts a valid Typeform signature and fresh timestamp', () => {
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects when signature header is missing', () => {
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: null,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_missing');
  });

  it('rejects a tampered body', () => {
    const tampered = FIXTURE_BODY.replace('Teste QA', 'Hacker');
    const result = verifyTypeformSignature({
      rawBody: tampered,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });

  it('rejects when sha256= prefix is missing', () => {
    const badSig = VALID_SIG.replace('sha256=', '');
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: badSig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_bad_format');
  });

  it('rejects when submitted_at is older than 5 minutes', () => {
    const staleNow = new Date('2026-04-16T21:10:00Z'); // 9+ minutes after submission
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: VALID_SIG,
      secret: SECRET,
      now: staleNow,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('replay_window_exceeded');
  });

  it('rejects when form_response.submitted_at is missing', () => {
    const bodyNoTs = JSON.stringify({ form_response: {} });
    const sig = makeSignature(bodyNoTs, SECRET);
    const result = verifyTypeformSignature({
      rawBody: bodyNoTs,
      signatureHeader: sig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('replay_window_exceeded');
  });

  it('rejects when lengths differ (avoids timingSafeEqual throw)', () => {
    const shortSig = 'sha256=abc';
    const result = verifyTypeformSignature({
      rawBody: FIXTURE_BODY,
      signatureHeader: shortSig,
      secret: SECRET,
      now: FIXTURE_NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_length_mismatch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/webhook-auth.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/webhook-auth.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

export type ValidationFailure =
  | 'hmac_missing'
  | 'hmac_bad_format'
  | 'hmac_length_mismatch'
  | 'hmac_mismatch'
  | 'replay_window_exceeded';

export type ValidationResult = { valid: true } | { valid: false; reason: ValidationFailure };

export interface VerifyTypeformInput {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  /** Injectable for tests; defaults to Date.now() */
  now?: Date;
}

const SIGNATURE_HEADER_PREFIX = 'sha256=';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function verifyTypeformSignature(input: VerifyTypeformInput): ValidationResult {
  const { rawBody, signatureHeader, secret, now = new Date() } = input;

  // 1. Header presence
  if (!signatureHeader) return { valid: false, reason: 'hmac_missing' };

  // 2. Format: must start with 'sha256='
  if (!signatureHeader.startsWith(SIGNATURE_HEADER_PREFIX)) {
    return { valid: false, reason: 'hmac_bad_format' };
  }

  // 3. Replay window — check submitted_at before HMAC (fail fast on obvious replays)
  let submittedAt: Date | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { form_response?: { submitted_at?: string } };
    const ts = parsed?.form_response?.submitted_at;
    if (ts) submittedAt = new Date(ts);
  } catch {
    // body not parseable yet — HMAC will fail anyway
  }
  if (!submittedAt || isNaN(submittedAt.getTime())) {
    return { valid: false, reason: 'replay_window_exceeded' };
  }
  if (Math.abs(now.getTime() - submittedAt.getTime()) > REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'replay_window_exceeded' };
  }

  // 4. HMAC comparison (base64, not hex — Typeform uses base64)
  const expected = 'sha256=' + createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('base64');
  const providedBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'hmac_length_mismatch' };
  }

  return timingSafeEqual(providedBuf, expectedBuf)
    ? { valid: true }
    : { valid: false, reason: 'hmac_mismatch' };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/webhook-auth.test.ts
```
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook-auth.ts tests/unit/webhook-auth.test.ts
git commit -m "feat(webhook): Typeform HMAC-only validator (sha256=base64, 5-min replay window)"
```

---

### Task 9: [FEATURE] `lib/utm-mapping.ts` — 3-layer transform to Datacrazy

**Files:**
- Create: `src/lib/utm-mapping.ts`, `tests/unit/utm-mapping.test.ts`
- Modify: none
- Test: `tests/unit/utm-mapping.test.ts`

**Dependencies:** Task 7 (`AnswerByRef` from typeform-fields).

**Key design decision:** Typeform UTMs live in `form_response.hidden` — a single flat object. This is simpler than the YayForms split. Extract all 7 keys from `hidden`, build 3-layer Datacrazy mapping. **No `tags` field** — Datacrazy `tags` is a rejected decision; all UTM data goes into `source`, `sourceReferral.sourceUrl`, and `notes` JSON.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/utm-mapping.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mapUtms, buildDatacrazyPayload } from '@/lib/utm-mapping';
import fixture from '../fixtures/typeform-webhook.json';

describe('lib/utm-mapping — mapUtms', () => {
  it('extracts all 7 UTM keys from form_response.hidden', () => {
    const utms = mapUtms(fixture.form_response.hidden);
    expect(utms.utm_source).toBe('google');
    expect(utms.utm_medium).toBe('cpc');
    expect(utms.utm_campaign).toBe('test');
    expect(utms.utm_content).toBe('banner');
    expect(utms.utm_term).toBe('ai');
    expect(utms.sck).toBe('testclick');
    expect(utms.src).toBe('lp');
  });

  it('returns null for missing keys', () => {
    const utms = mapUtms({});
    expect(utms.utm_source).toBeNull();
    expect(utms.sck).toBeNull();
  });

  it('handles missing hidden object gracefully', () => {
    const utms = mapUtms(undefined);
    expect(utms.utm_source).toBeNull();
  });
});

describe('lib/utm-mapping — buildDatacrazyPayload', () => {
  const answers = {
    nome: 'João Silva',
    cpf: '12345678900',
    email: 'joao@example.com',
    telefone: '+5511999998888',
    sells_online: 'Sim',
  };
  const utms = {
    utm_source: 'linkedin',
    utm_medium: 'organic',
    utm_campaign: 'ebulicao2026',
    utm_content: 'hero-cta',
    utm_term: 'evento',
    sck: 'abc123',
    src: 'review',
  };
  const landingUrl = 'https://ticto-ebulicao-lp.vercel.app/?utm_source=linkedin&sck=abc123';

  it('maps to 3-layer Datacrazy payload', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:39Z' });
    expect(out.name).toBe('João Silva');
    expect(out.email).toBe('joao@example.com');
    expect(out.phone).toBe('+5511999998888');
    expect(out.source).toBe('linkedin');
    expect(out.sourceReferral.sourceUrl).toBe(landingUrl);
    const notes = JSON.parse(out.notes);
    expect(notes.utm_source).toBe('linkedin');
    expect(notes.sck).toBe('abc123');
    expect(notes.src).toBe('review');
    expect(notes.landing_page).toBe(landingUrl);
    expect(notes.captured_at).toBe('2026-04-16T21:00:39Z');
  });

  it('falls back source to "direct" when utm_source is null', () => {
    const out = buildDatacrazyPayload({
      answers,
      utms: { ...utms, utm_source: null },
      landingUrl: 'https://ex.com/',
      capturedAt: '2026-04-16T21:00:00Z',
    });
    expect(out.source).toBe('direct');
  });

  it('does not emit a tags field (3-layer mapping only)', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect((out as { tags?: unknown }).tags).toBeUndefined();
  });

  it('does not emit sourceReferral.sourceId', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect((out.sourceReferral as Record<string, unknown>).sourceId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/utm-mapping.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/utm-mapping.ts`**

```typescript
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

export interface DatacrazyLeadPayload {
  name: string;
  email: string;
  phone: string;
  source: string;
  sourceReferral: { sourceUrl: string };
  notes: string;
}

// Simpler than YayForms — UTMs live in one flat object (form_response.hidden)
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

export function buildDatacrazyPayload(ctx: {
  answers: AnswerByRef;
  utms: UtmValues;
  landingUrl: string;
  capturedAt: string;
}): DatacrazyLeadPayload {
  const { answers, utms, landingUrl, capturedAt } = ctx;

  // notes-JSON: all 7 UTM values (omit nulls) + metadata
  const notesObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) notesObj[k] = v;
  }
  notesObj.landing_page = landingUrl;
  notesObj.captured_at = capturedAt;

  return {
    name: answers.nome,
    email: answers.email,
    phone: answers.telefone,
    source: utms.utm_source ?? 'direct',
    sourceReferral: { sourceUrl: landingUrl },
    notes: JSON.stringify(notesObj),
    // No tags — Datacrazy tags is a rejected decision (spec explicitly rejected it)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/utm-mapping.test.ts
```
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utm-mapping.ts tests/unit/utm-mapping.test.ts
git commit -m "feat(crm): Typeform UTM extraction + 3-layer Datacrazy mapping (source/sourceUrl/notes-JSON)"
```

---

### Task 10: [FEATURE] `lib/datacrazy.ts` — fetch client with 429 retry + timeout

**Files:**
- Create: `src/lib/datacrazy.ts`, `tests/unit/datacrazy.test.ts`
- Modify: none
- Test: `tests/unit/datacrazy.test.ts`

**Dependencies:** Task 5, Task 9.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/datacrazy.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatacrazyLeadPayload } from '@/lib/utm-mapping';

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.DATACRAZY_API_TOKEN = 'tok_live_abc';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'whsec_secret_123';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
}

const payload: DatacrazyLeadPayload = {
  name: 'A',
  email: 'a@b.co',
  phone: '+5511900000000',
  source: 'linkedin',
  sourceReferral: { sourceUrl: 'https://example.com/' },
  notes: '{"utm_source":"linkedin"}',
};

describe('lib/datacrazy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
    setEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts with Bearer token and returns { ok: true, status, leadId } on 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead_42' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);

    expect(result).toEqual({ ok: true, status: 201, leadId: 'lead_42' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.g1.datacrazy.io/api/v1/leads');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer tok_live_abc');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries once on 429 honoring Retry-After then returns the second response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'lead_7' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const promise = postLead(payload);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns { ok: false, errorClass: "datacrazy_4xx" } on 400 and does not retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_4xx');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns { ok: false, errorClass: "datacrazy_5xx" } on 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { postLead } = await import('@/lib/datacrazy');
    const result = await postLead(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_5xx');
  });

  it('returns { ok: false, errorClass: "datacrazy_timeout" } when fetch aborts', async () => {
    const fetchMock = vi.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined);
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { postLead } = await import('@/lib/datacrazy');
    const promise = postLead(payload, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('datacrazy_timeout');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/datacrazy.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/datacrazy.ts`**

```typescript
import { getServerEnv } from '@/lib/env';
import type { DatacrazyLeadPayload } from '@/lib/utm-mapping';
import type { ErrorClass } from '@/lib/logger';

const ENDPOINT = 'https://api.g1.datacrazy.io/api/v1/leads';

export type PostLeadSuccess = {
  ok: true;
  status: number;
  leadId: string | number | null;
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
  if (status >= 500) return 'datacrazy_5xx';
  return 'datacrazy_4xx';
}

async function safeRead(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 512);
  } catch {
    return '';
  }
}

function extractLeadId(body: unknown): string | number | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  for (const key of ['id', 'leadId', 'lead_id']) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') return v;
  }
  return null;
}

async function doPost(
  payload: DatacrazyLeadPayload,
  token: string,
  options: PostLeadOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    return await fetchImpl(ENDPOINT, {
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
  payload: DatacrazyLeadPayload,
  options: PostLeadOptions = {},
): Promise<PostLeadResult> {
  const { DATACRAZY_API_TOKEN } = getServerEnv();
  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    let res: Response;
    try {
      res = await doPost(payload, DATACRAZY_API_TOKEN, options);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, status: 0, errorClass: 'datacrazy_timeout', bodySnippet: '' };
      }
      return {
        ok: false,
        status: 0,
        errorClass: 'datacrazy_5xx',
        bodySnippet: err instanceof Error ? err.message : String(err),
      };
    }

    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      const waitMs = Math.max(0, Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 10)) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: true, status: res.status, leadId: extractLeadId(body) };
    }

    const snippet = await safeRead(res);
    return { ok: false, status: res.status, errorClass: classify(res.status), bodySnippet: snippet };
  }

  return { ok: false, status: 429, errorClass: 'datacrazy_4xx', bodySnippet: 'exhausted retries' };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/datacrazy.test.ts
```
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/datacrazy.ts tests/unit/datacrazy.test.ts
git commit -m "feat(crm): Datacrazy fetch client with 429 retry, timeout, and typed result union"
```

---

### Task 11: [FEATURE] `app/api/lead/route.ts` — Typeform webhook handler (agent:review-required)

**Files:**
- Create: `src/app/api/lead/route.ts` (single handler — hmac-only, no `[secret]` variant)
- Delete: `src/app/api/lead/[secret]/route.ts` — NOT created. Typeform is hmac-only; the secret_path variant is not needed.
- Modify: none
- Test: none co-located; integration is exercised by E2E in Task 19. Library coverage is already complete from Tasks 6–10.

**Dependencies:** Tasks 6, 7, 8, 9, 10.

**Review gate:** Re-read `docs/decisions/2026-04-16-typeform-webhook-auth.md`. Key handler flow:
1. Read raw body with `await req.text()`, Buffer it for HMAC
2. `verifyTypeformSignature(rawBody, headers.get('typeform-signature'), env.TYPEFORM_WEBHOOK_SECRET)` → 401 if fail
3. `JSON.parse(rawBody)` → validate has `form_response`
4. `parseAnswers(body.form_response.answers)` → extract 5 fields by ref
5. `mapUtms(body.form_response.hidden)` → 7 UTM values
6. `buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt })` → 3-layer Datacrazy payload
7. `postLead(payload)` — sync, no waitUntil
8. On success: 200 + log `lead.forwarded`; on failure: 500 + log `lead.failed`
9. PII redaction: mask email, phone, name first-only

- [ ] **Step 1: Create `src/app/api/lead/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { verifyTypeformSignature } from '@/lib/webhook-auth';
import { parseAnswers, type TypeformAnswer } from '@/lib/typeform-fields';
import { mapUtms, buildDatacrazyPayload } from '@/lib/utm-mapping';
import { postLead } from '@/lib/datacrazy';
import { logger, redactEmail, redactPhone } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const requestId = newRequestId();
  const t0 = Date.now();
  const env = getServerEnv();

  // 1. Read raw body BEFORE JSON.parse — HMAC must run on exact bytes
  const rawBody = await req.text();

  // 2. Verify Typeform HMAC signature
  const sigHeader = req.headers.get('typeform-signature');
  const authResult = verifyTypeformSignature({
    rawBody,
    signatureHeader: sigHeader,
    secret: env.TYPEFORM_WEBHOOK_SECRET,
  });

  logger.info({
    event: 'lead.received',
    request_id: requestId,
    auth_mode: 'hmac',
    auth_valid: authResult.valid,
    timing_ms: Date.now() - t0,
  });

  if (!authResult.valid) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'auth_invalid',
      error_message: authResult.reason,
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 3. Parse body
  let body: { form_response?: { answers?: TypeformAnswer[]; hidden?: Record<string, string>; token?: string } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.error({ event: 'lead.failed', request_id: requestId, error_class: 'parse_error', error_message: 'invalid_json' });
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.form_response) {
    logger.error({ event: 'lead.failed', request_id: requestId, error_class: 'parse_error', error_message: 'missing_form_response' });
    return NextResponse.json({ error: 'missing_form_response' }, { status: 400 });
  }

  // 4. Extract fields by ref
  let answers;
  try {
    answers = parseAnswers(body.form_response.answers ?? []);
  } catch (err) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      error_class: 'parse_error',
      error_message: err instanceof Error ? err.message : 'field_extraction_failed',
    });
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  // 5. Extract UTMs from form_response.hidden
  const utms = mapUtms(body.form_response.hidden);
  const utmKeysPresent = Object.entries(utms)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  logger.info({
    event: 'lead.mapped',
    request_id: requestId,
    submission_id: body.form_response.token,
    field_count_mapped: 5,
    utm_keys_present: utmKeysPresent,
  });

  // Landing URL: read from the submitter-declared `landing_page` hidden field.
  // Typeform webhooks are server-to-server so `Referer` is either absent or points
  // at a Typeform CDN, never at the visitor's landing page. `form_response.hidden.landing_page`
  // was injected by <TypeformEmbed> from first-touch localStorage, so it carries the
  // real visitor URL including query string. Fall back to NEXT_PUBLIC_SITE_URL only
  // if the hidden field is absent (legacy submission or Typeform form config regression).
  const landingUrl =
    body.form_response.hidden?.landing_page ?? env.NEXT_PUBLIC_SITE_URL ?? '';

  // 6. Build Datacrazy payload
  const datacrazyPayload = buildDatacrazyPayload({
    answers,
    utms,
    landingUrl,
    capturedAt: new Date().toISOString(),
  });

  // 7. POST to Datacrazy (sync — no waitUntil needed for 72h scope)
  const crmT0 = Date.now();
  const crm = await postLead(datacrazyPayload);
  const crmMs = Date.now() - crmT0;

  if (!crm.ok) {
    logger.error({
      event: 'lead.failed',
      request_id: requestId,
      submission_id: body.form_response.token,
      error_class: crm.errorClass,
      error_message: `datacrazy ${crm.status}: ${crm.bodySnippet}`,
    });
    return NextResponse.json({ error: 'crm_failed' }, { status: 500 });
  }

  // 8. Success — PII-redacted log
  logger.info({
    event: 'lead.forwarded',
    request_id: requestId,
    submission_id: body.form_response.token,
    datacrazy_status: crm.status,
    datacrazy_lead_id: crm.leadId,
    timing_ms: crmMs,
    // PII redaction in log (full data already sent to Datacrazy)
    email_hint: redactEmail(answers.email),
    phone_hint: redactPhone(answers.telefone),
    name_hint: `${answers.nome.split(' ')[0]} ***`,
  });

  return NextResponse.json({ ok: true, request_id: requestId }, { status: 200 });
}

export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
```

- [ ] **Step 2: Run typecheck + lint + unit tests to confirm nothing regressed**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/lead/route.ts
git commit -m "feat(api): /api/lead Typeform handler — HMAC auth, ref-keyed fields, UTM hidden, Datacrazy POST"
```

---

### Task 12: [FEATURE] `proxy.ts` — security headers only

**Files:**
- Create: `src/proxy.ts`
- Modify: none
- Test: manual curl after deploy (unit test unnecessary; Next 16 proxy has a stable API)

**Dependencies:** Task 3.

- [ ] **Step 1: Implement `src/proxy.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';

export default function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
```

- [ ] **Step 2: Confirm build still passes**

```bash
pnpm build
```

Expected: build completes; Next 16 recognizes `src/proxy.ts` in its build log.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(security): proxy.ts adds HSTS, frame-deny, nosniff, strict referrer"
```

---

### Task 13: [FEATURE] `lib/attribution.ts` — localStorage helpers (pure + SSR-safe)

**Files:**
- Create: `src/lib/attribution.ts`, `tests/unit/attribution.test.ts`
- Modify: none
- Test: `tests/unit/attribution.test.ts`

**Dependencies:** Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/attribution.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UTM_KEYS,
  readStoredAttribution,
  saveAttribution,
  collectUtmsFromUrl,
  applyStoredToUrl,
} from '@/lib/attribution';

const STORAGE_KEY = 'first_touch_utms_v1';

describe('lib/attribution', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('UTM_KEYS lists exactly the 7 tracking params', () => {
    expect([...UTM_KEYS].sort()).toEqual(
      ['sck', 'src', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term'].sort(),
    );
  });

  it('collectUtmsFromUrl picks up present keys and skips absent ones', () => {
    const url = new URL('https://ex.com/?utm_source=li&utm_medium=org&sck=a');
    expect(collectUtmsFromUrl(url)).toEqual({ utm_source: 'li', utm_medium: 'org', sck: 'a' });
  });

  it('saveAttribution writes JSON with landing_page and captured_at', () => {
    saveAttribution(
      { utm_source: 'li', sck: 'a' },
      { landingPath: '/outlier', capturedAt: '2026-04-15T10:00:00Z' },
    );
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.utm_source).toBe('li');
    expect(parsed.landing_page).toBe('/outlier');
    expect(parsed.captured_at).toBe('2026-04-15T10:00:00Z');
  });

  it('readStoredAttribution returns null when nothing saved', () => {
    expect(readStoredAttribution()).toBeNull();
  });

  it('readStoredAttribution returns null on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readStoredAttribution()).toBeNull();
  });

  it('applyStoredToUrl fills in only missing keys and reports whether it changed the URL', () => {
    const saved = { utm_source: 'li', utm_medium: 'org' };
    const url = new URL('https://ex.com/?utm_source=direct');
    const changed = applyStoredToUrl(url, saved);
    expect(changed).toBe(true);
    expect(url.searchParams.get('utm_source')).toBe('direct'); // existing key untouched
    expect(url.searchParams.get('utm_medium')).toBe('org');
  });

  it('applyStoredToUrl returns false when nothing to add', () => {
    const saved = { utm_source: 'li' };
    const url = new URL('https://ex.com/?utm_source=li');
    expect(applyStoredToUrl(url, saved)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/unit/attribution.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/attribution.ts`**

```typescript
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'sck',
  'src',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = Partial<Record<UtmKey, string>> & {
  landing_page?: string;
  captured_at?: string;
};

const STORAGE_KEY = 'first_touch_utms_v1';

function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function collectUtmsFromUrl(url: URL): Partial<Record<UtmKey, string>> {
  const out: Partial<Record<UtmKey, string>> = {};
  for (const k of UTM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function readStoredAttribution(): Attribution | null {
  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export function saveAttribution(
  values: Partial<Record<UtmKey, string>>,
  meta: { landingPath: string; capturedAt: string },
): void {
  if (!storageAvailable()) return;
  const payload: Attribution = { ...values, landing_page: meta.landingPath, captured_at: meta.capturedAt };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function applyStoredToUrl(url: URL, stored: Attribution): boolean {
  let changed = false;
  for (const k of UTM_KEYS) {
    const v = stored[k];
    if (v && !url.searchParams.has(k)) {
      url.searchParams.set(k, v);
      changed = true;
    }
  }
  return changed;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- tests/unit/attribution.test.ts
```
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attribution.ts tests/unit/attribution.test.ts
git commit -m "feat(attribution): localStorage helpers for first-touch UTM capture"
```

---

### Task 14: [FEATURE] `components/utm-rehydrator.tsx` — client rehydrator with useLayoutEffect

**Files:**
- Create: `src/components/utm-rehydrator.tsx`
- Modify: none
- Test: smoke-verified via the E2E test in Task 19; unit test not required for JSX per spec §8

**Dependencies:** Task 13.

- [ ] **Step 1: Implement `src/components/utm-rehydrator.tsx`**

```tsx
'use client';

import { useLayoutEffect } from 'react';
import {
  UTM_KEYS,
  applyStoredToUrl,
  collectUtmsFromUrl,
  readStoredAttribution,
  saveAttribution,
} from '@/lib/attribution';

export function UTMRehydrator() {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const capturedAt = new Date().toISOString();

    const fromUrl = collectUtmsFromUrl(url);
    const hasUrlUtms = UTM_KEYS.some((k) => k in fromUrl);

    const stored = readStoredAttribution();

    if (hasUrlUtms && !stored) {
      // Use the full href (pathname + search + hash) so Datacrazy's sourceReferral.sourceUrl
      // and Typeform's landing_page hidden field both carry the real landing URL.
      saveAttribution(fromUrl, { landingPath: window.location.href, capturedAt });
      return;
    }

    // First-touch attribution must also fire for organic visitors with no UTMs,
    // otherwise `landing_page` is never written and the webhook falls back to
    // NEXT_PUBLIC_SITE_URL. Capture the bare landing URL on first visit too.
    if (!hasUrlUtms && !stored) {
      saveAttribution({}, { landingPath: window.location.href, capturedAt });
      return;
    }

    if (!hasUrlUtms && stored) {
      const changed = applyStoredToUrl(url, stored);
      if (changed) {
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, []);

  return null;
}
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/utm-rehydrator.tsx
git commit -m "feat(attribution): UTMRehydrator uses useLayoutEffect + replaceState for first-touch"
```

---

### Task 15: [FEATURE] `components/typeform-embed.tsx` — Typeform React SDK widget

**Files:**
- Create: `src/components/typeform-embed.tsx`
- Modify: none
- Test: smoke-verified via E2E in Task 19

**Dependencies:** Task 13 (`useAttribution` / `lib/attribution.ts`), Task 5 (`getClientEnv`).

- [ ] **Step 1: Install `@typeform/embed-react`**

```bash
pnpm add @typeform/embed-react@^4.0.0
```

This is a production dependency (needed in the client bundle).

- [ ] **Step 2: Implement `src/components/typeform-embed.tsx`**

```tsx
'use client';
import { Widget } from '@typeform/embed-react';
import { useAttribution, UTM_KEYS } from '@/lib/attribution';

// Typeform silently drops hidden fields that aren't declared in the form config.
// Form FbFMsO5x declares exactly 8 hidden fields: the 7 UTM keys + `landing_page`.
// Anything else (e.g. `captured_at`, which we persist locally for audit) must be
// stripped before handing the object to <Widget>.
const HIDDEN_KEYS = [...UTM_KEYS, 'landing_page'] as const;

export function TypeformEmbed({ formId }: { formId: string }) {
  const { utms } = useAttribution(); // reads localStorage first-touch (Attribution object)
  const hidden: Record<string, string> = {};
  for (const k of HIDDEN_KEYS) {
    const v = utms[k];
    if (typeof v === 'string' && v.length > 0) hidden[k] = v;
  }
  return (
    <Widget
      id={formId}
      hidden={hidden}          // 7 UTM keys + landing_page, all string-valued
      inlineOnMobile
      opacity={0}
      className="w-full h-[600px]"
    />
  );
}
```

> **Note on `useAttribution`:** This hook must be added to `src/lib/attribution.ts` as a thin React hook wrapper: reads `readStoredAttribution()` on mount, returns `{ utms: Attribution }`. Add it alongside the existing pure helpers — no separate file needed.

- [ ] **Step 3: Add `useAttribution` hook to `src/lib/attribution.ts`**

Append to `src/lib/attribution.ts`:
```typescript
import { useState, useEffect } from 'react';

export function useAttribution(): { utms: Attribution } {
  const [utms, setUtms] = useState<Attribution>({});
  useEffect(() => {
    const stored = readStoredAttribution();
    if (stored) setUtms(stored);
  }, []);
  return { utms };
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/typeform-embed.tsx src/lib/attribution.ts
git commit -m "feat(ui): TypeformEmbed with @typeform/embed-react Widget + useAttribution hook"
```

---

<!-- Task 15a (Figma evaluation spike) DELETED: Figma MCP was used inline during the pivot session and the design has been read. No separate spike task needed. Proceed to Task 16 (Teste_dev port). -->

---

### Task 16: [SETUP] Port Teste_dev assets + design tokens (agent:ok)

**Files:**
- Create: `public/images/*` (25+ SVG/PNG assets from Teste_dev)
- Create: `src/app/fonts/*` (Tomato Grotesk + Space Grotesk font files)
- Modify: `src/app/globals.css` (replace with Teste_dev version)
- Modify: `src/app/layout.tsx` (reference new fonts via `next/font/local`)
- Modify: `package.json` (add browserslist Safari ≥ 15.4)

**Dependencies:** Task 3 (scaffold exists).

**Port source:** `D:/Users/Johan/Dev Projects/Teste_dev/` — all assets already Ebulição-correct.

- [ ] **Step 1: Copy image assets**

```bash
cp -r "D:/Users/Johan/Dev Projects/Teste_dev/public/images/." public/images/
```

Assets include: `logo-ebulicao.png`, `logo-ticto.png`, `logo-ticto-phone.svg`, `iphone-16-pro.png`, `hero-ticto-m1.svg`, `hero-ticto-m2.svg`, `bg.png`, `bg-blur-left.svg`, `bg-blur-right.svg`, `badge-pci.png`, `badge-r2024.png`, `icon-arrow.svg`, `icon-arrow-sm.svg`, `icon-chevron.svg`, `icon-shield.svg`, `social-fb.svg`, `social-ig.svg`, `social-in.svg`, `footer-ticto-1.svg`, `footer-ticto-2.svg`.

- [ ] **Step 2: Copy font files**

```bash
mkdir -p src/app/fonts
cp -r "D:/Users/Johan/Dev Projects/Teste_dev/src/app/fonts/." src/app/fonts/
```

Font files:
- `TomatoGrotesk-Black.otf`, `TomatoGrotesk-BlackSlanted.otf`, `TomatoGrotesk-Bold.otf`, `TomatoGrotesk-BoldSlanted.otf`, `TomatoGrotesk-Light.otf`, `TomatoGrotesk-LightSlanted.otf`, `TomatoGrotesk-Regular.otf`, `TomatoGrotesk-Slanted.otf`
- `SpaceGrotesk-Bold.ttf`, `SpaceGrotesk-Light.ttf`, `SpaceGrotesk-Medium.ttf`, `SpaceGrotesk-Regular.ttf`, `SpaceGrotesk-SemiBold.ttf`

- [ ] **Step 3: Replace `src/app/globals.css` with Teste_dev version**

Replace the entire contents of `src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
    --color-brand-cyan: #5bbed9;
    --color-bg-dark: #030712;
    --color-bg-black: #000000;
    --color-bg-white: #ffffff;
    --color-input-bg: #f2f2f2;
    --color-placeholder: #6d6d6d;
    --color-dark-700: #0d0b1a;
    --color-accent-orange: #ff9c2b;
    --color-text-muted: #d9d9d9;

    --font-tomato: "Tomato Grotesk", sans-serif;
    --font-inter: "Inter", sans-serif;
    --font-space: "Space Grotesk", sans-serif;
}

@layer base {
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    html,
    body {
        min-height: 100vh; /* Fallback for Safari < 15.4 */
        min-height: 100svh; /* Modern browsers */
        background-color: var(--color-bg-dark);
        color: var(--color-bg-white);
        font-family: var(--font-space);
        color-scheme: dark;
        -webkit-font-smoothing: antialiased;
        /* Safari: prevent tap highlight flash on interactive elements */
        -webkit-tap-highlight-color: transparent;
    }

    /* Safari < 15.4: backdrop-filter prefix */
    .backdrop-blur-sm {
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
    }

    /* Fix border-radius on inputs/selects in Safari */
    input,
    select,
    textarea {
        -webkit-appearance: none;
        appearance: none;
    }
}

@layer utilities {
    @keyframes fade-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .animate-fade-in {
        animation: fade-in 0.4s ease-out both;
    }

    .pill-input {
        @apply w-full px-[25px] py-[16px] rounded-[66px] bg-[var(--color-input-bg)] border border-transparent text-bg-black font-space text-[14px] transition-[background-color,border-color,box-shadow,color] duration-300;
    }
    .pill-input::placeholder {
        @apply text-placeholder;
    }
    .pill-input:focus-visible {
        @apply border-brand-cyan bg-bg-white shadow-[0_0_0_2px_rgba(91,190,217,0.2)] outline outline-2 outline-brand-cyan/40;
    }

    .ddd-input:focus {
        @apply border-accent-orange shadow-[0_0_0_2px_rgba(255,156,43,0.2)];
    }

    @keyframes shimmer {
        0% {
            transform: translateX(-150%) skewX(-20deg);
        }
        100% {
            transform: translateX(250%) skewX(-20deg);
        }
    }

    .btn-primary {
        @apply flex w-full justify-center items-center gap-2.5 px-[76px] py-4 rounded-[66px] bg-brand-cyan text-[#F6F6F6] font-tomato font-bold text-sm border-none cursor-pointer transition-transform duration-200 active:scale-95 hover:opacity-90 relative overflow-hidden;
    }

    .btn-primary::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 45%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.25),
            transparent
        );
        animation: shimmer 2.5s ease-in-out infinite 0.8s;
    }

    .promo-frame-gradient {
        --border-width: 1px;
        position: relative;
        border-radius: 8px;
        background: linear-gradient(
            261deg,
            rgba(255, 255, 255, 0.10) -16.3%,
            rgba(255, 255, 255, 0.00) 113.33%
        );
    }

    .promo-frame-gradient::before {
        content: "";
        position: absolute;
        inset: 0;
        padding: var(--border-width, 1px);
        border-radius: inherit;
        background: linear-gradient(
            225deg,
            rgba(91, 190, 217, 1) 0%,
            rgba(91, 190, 217, 0) 65%
        );
        mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
        mask-composite: exclude;
        -webkit-mask-composite: xor;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        .animate-fade-in,
        .btn-primary::after {
            animation: none !important;
        }

        *,
        *::before,
        *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
        }
    }
}
```

- [ ] **Step 4: Update `src/app/layout.tsx` to reference new fonts**

Replace the Geist font imports with local font declarations:

```tsx
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const tomatoGrotesk = localFont({
  src: [
    { path: './fonts/TomatoGrotesk-Regular.otf',  weight: '400', style: 'normal' },
    { path: './fonts/TomatoGrotesk-Bold.otf',     weight: '700', style: 'normal' },
    { path: './fonts/TomatoGrotesk-Black.otf',    weight: '900', style: 'normal' },
  ],
  variable: '--font-tomato',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: [
    { path: './fonts/SpaceGrotesk-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Medium.ttf',  weight: '500', style: 'normal' },
    { path: './fonts/SpaceGrotesk-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Bold.ttf',    weight: '700', style: 'normal' },
  ],
  variable: '--font-space',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Ebulição × Ticto',
  description: 'Cadastre-se e concorra a um iPhone 16 Pro. Evento Rafa Prado × Ticto.',
  openGraph: {
    title: 'Ebulição × Ticto',
    description: 'Cadastre-se e concorra a um iPhone 16 Pro. Evento Rafa Prado × Ticto.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${tomatoGrotesk.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Add Safari ≥ 15.4 to browserslist in `package.json`**

Add or merge a `browserslist` field in `package.json`:
```json
"browserslist": [
  "last 2 Chrome versions",
  "last 2 Firefox versions",
  "last 2 Edge versions",
  "Safari >= 15.4",
  "iOS >= 15.4"
]
```

- [ ] **Step 6: Verify**

```bash
pnpm build
pnpm check:secrets
```

Expected: build succeeds; `check:secrets` passes.

- [ ] **Step 7: Commit**

```bash
git add public/images src/app/fonts src/app/globals.css src/app/layout.tsx package.json
git commit -m "feat(design): port Teste_dev assets, fonts, and globals.css (Ebulição brand tokens)"
```

---

### Task 17: [FEATURE] Port Teste_dev LP components (Hero, Rules, Footer) (agent:ok)

**Files:**
- Create: `src/components/Hero.tsx`, `src/components/Rules.tsx`, `src/components/Footer.tsx`
- Modify: `src/app/page.tsx` (layout skeleton from Teste_dev, form column uses TypeformEmbed)

**Dependencies:** Task 15 (TypeformEmbed component), Task 16 (assets + globals.css).

**Port source:** `D:/Users/Johan/Dev Projects/Teste_dev/src/components/` — Hero.tsx, Rules.tsx, Footer.tsx are already Ebulição-correct. Copy verbatim. Do NOT port `SignupForm.tsx` (form UI is now the Typeform widget). Do NOT port `src/lib/supabase.ts` or `api/send-email/route.ts` (unused in this architecture).

**canvas-confetti:** Optional nice-to-have — the Typeform React SDK supports an `onSubmit` callback. If time allows, fire confetti on submission for delight. Not required for acceptance.

- [ ] **Step 1: Copy components from Teste_dev**

```bash
cp "D:/Users/Johan/Dev Projects/Teste_dev/src/components/Hero.tsx" src/components/
cp "D:/Users/Johan/Dev Projects/Teste_dev/src/components/Rules.tsx" src/components/
cp "D:/Users/Johan/Dev Projects/Teste_dev/src/components/Footer.tsx" src/components/
```

- [ ] **Step 2: Replace `src/app/page.tsx` with Teste_dev's layout skeleton**

Port `D:/Users/Johan/Dev Projects/Teste_dev/src/app/page.tsx` — but replace the form column's `<SignupForm />` with the Typeform embed wrapper:

```tsx
import { UTMRehydrator } from '@/components/utm-rehydrator';
import { Hero } from '@/components/Hero';
import { Rules } from '@/components/Rules';
import { Footer } from '@/components/Footer';
import { TypeformEmbed } from '@/components/typeform-embed';

export default function Page() {
  return (
    <>
      <UTMRehydrator />
      <main>
        <Hero />
        <Rules />
        {/* Typeform embed — replaces Teste_dev's SignupForm */}
        <section id="cadastro" className="px-6 py-16">
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border border-brand-cyan/20 bg-dark-700 p-8 shadow-xl">
              <h2 className="mb-2 font-tomato text-2xl font-bold text-bg-white">
                CADASTRO 100% GRATUITO
              </h2>
              <p className="mb-6 text-sm text-text-muted flex items-center gap-1">
                <span>🔒</span> Seus dados estão seguros
              </p>
              <TypeformEmbed formId={process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID!} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Start dev server and smoke-test at 4 viewports**

```bash
pnpm dev
```

Load `http://localhost:3000/`. Check:
- LP renders visually 1:1 with Figma (except form card inner which shows Typeform widget)
- Hero, Rules, Footer sections visible at 375, 768, 1280, 1920 widths
- No hydration warnings in console

Stop the server (`Ctrl-C`) when done.

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Hero.tsx src/components/Rules.tsx src/components/Footer.tsx src/app/page.tsx
git commit -m "feat(ui): port Teste_dev LP components (Hero, Rules, Footer) + Typeform embed slot"
```

---

### Task 18: [FEATURE] Integrate TypeformEmbed on LP — verified end-to-end locally

**Files:**
- Modify: `src/app/page.tsx` if TypeformEmbed wrapper needs adjustment after smoke test.
- Test: manual ad-hoc smoke — no file changes unless a fix is needed.

**Dependencies:** Task 17 (LP shell with Typeform embed slot).

- [ ] **Step 1: Start dev server with UTM query string**

```bash
pnpm dev
```

Open:
```
http://localhost:3000/?utm_source=linkedin&utm_medium=organic&utm_campaign=ebulicao2026&utm_content=hero-cta&utm_term=raffle&sck=abc123&src=lp
```

- [ ] **Step 2: Confirm localStorage was written**

In the browser DevTools Console:
```javascript
JSON.parse(localStorage.getItem('first_touch_utms_v1'))
```
Expected: an object containing all 7 params + `landing_page: "/"` + a `captured_at` ISO timestamp.

- [ ] **Step 3: Reload without query string and verify rehydration**

Navigate to `http://localhost:3000/` (no query string). The UTMRehydrator should call `history.replaceState` before mount — confirm in the URL bar that all 7 params are restored.

- [ ] **Step 4: Confirm Typeform widget receives UTMs**

The `TypeformEmbed` passes `utms` to the Widget's `hidden` prop — Typeform will populate `form_response.hidden` on submission. Inspect the Network tab: when the Typeform iframe loads, it should include the UTM params in its `?typeform-source=` or query string.

- [ ] **Step 5: Submit a test lead** (if `TYPEFORM_WEBHOOK_SECRET` + `DATACRAZY_API_TOKEN` set locally)

Fill and submit the form. The Typeform webhook fires to your configured endpoint (currently webhook.site during dev — update to `http://localhost:3000/api/lead` via an `ngrok` tunnel or Vercel Preview for real E2E). Watch terminal logs: you should see `lead.received`, `lead.mapped`, `lead.forwarded` JSON lines.

> If local webhook routing is not set up, skip Step 5 — Task 19 covers CRM mock testing. A single real submission on Vercel Preview (Task 25) is the live evidence.

- [ ] **Step 6: Commit if any fix needed**

If `page.tsx` or `typeform-embed.tsx` needed a fix, commit it now. Otherwise no commit needed.

```bash
git add src/app/page.tsx src/components/typeform-embed.tsx
git commit -m "fix(ui): adjust TypeformEmbed wrapper after smoke test"
```

---

### Task 19: [TEST] E2E Playwright test — lead flow with Datacrazy MOCKED

**Files:**
- Create: `tests/e2e/lead-flow.spec.ts`
- Modify: none
- Test: itself

**Dependencies:** Tasks 11, 17, 18.

- [ ] **Step 1: Write the Playwright spec**

Create `tests/e2e/lead-flow.spec.ts`:
```typescript
import { expect, test } from '@playwright/test';

const UTM_QUERY =
  'utm_source=linkedin&utm_medium=organic&utm_campaign=ebulicao2026&utm_content=hero-cta&utm_term=raffle&sck=abc123&src=review';

test.describe('Lead flow — mocked Datacrazy', () => {
  test('first visit persists UTMs and a later submission carries them to the CRM call', async ({ page, context }) => {
    const crmRequests: { body: Record<string, unknown>; url: string }[] = [];

    // Stub Datacrazy
    await page.route('https://api.g1.datacrazy.io/**', async (route) => {
      const request = route.request();
      const postData = request.postData() ?? '';
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(postData) as Record<string, unknown>;
      } catch { /* leave empty */ }
      crmRequests.push({ body: parsed, url: request.url() });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'lead_mocked_1' }),
      });
    });

    await page.goto(`/?${UTM_QUERY}`);

    // Sanity: localStorage was written
    const stored = await page.evaluate(() => localStorage.getItem('first_touch_utms_v1'));
    expect(stored).toBeTruthy();
    const storedObj = JSON.parse(stored!) as Record<string, string>;
    expect(storedObj.utm_source).toBe('linkedin');
    expect(storedObj.sck).toBe('abc123');
    expect(storedObj.src).toBe('review');

    // Fill Typeform iframe (Typeform renders inside an iframe)
    const iframeLocator = page
      .frameLocator('iframe[src*="typeform"]')
      .first();
    await iframeLocator.getByLabel(/nome/i).fill('Teste Playwright');
    await iframeLocator.getByLabel(/cpf/i).fill('12345678900');
    await iframeLocator.getByLabel(/e-?mail/i).fill('qa+playwright@example.com');
    await iframeLocator.getByLabel(/telefone|phone/i).fill('+5511988887777');
    // sells_online is a multiple choice — select "Sim"
    await iframeLocator.getByRole('button', { name: /sim/i }).click();
    await iframeLocator.getByRole('button', { name: /enviar|submeter|submit|próximo/i }).click();

    // Wait for the mocked CRM call to be captured
    await expect.poll(() => crmRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const last = crmRequests.at(-1)!;
    expect(last.body.name).toBe('Teste Playwright');
    expect(last.body.email).toBe('qa+playwright@example.com');
    expect(last.body.phone).toBe('+5511988887777');
    expect(last.body.source).toBe('linkedin');

    const sourceReferral = last.body.sourceReferral as { sourceUrl: string };
    expect(sourceReferral.sourceUrl).toContain('utm_source=linkedin');
    expect(sourceReferral.sourceUrl).toContain('sck=abc123');
    expect(sourceReferral.sourceUrl).toContain('src=review');

    const notes = JSON.parse(last.body.notes as string) as Record<string, string>;
    expect(notes.utm_source).toBe('linkedin');
    expect(notes.utm_medium).toBe('organic');
    expect(notes.utm_campaign).toBe('ebulicao2026');
    expect(notes.utm_content).toBe('hero-cta');
    expect(notes.utm_term).toBe('raffle');
    expect(notes.sck).toBe('abc123');
    expect(notes.src).toBe('review');
  });
});
```

> The iframe selector uses `iframe[src*="typeform"]` to target Typeform's embed specifically. If the selector flakes (Typeform may use `embed.typeform.com`), broaden to `.frameLocator('iframe').first()` and note the change.

- [ ] **Step 2: Run locally against the dev server**

```bash
pnpm e2e
```

Expected: the test passes. Playwright auto-starts `pnpm dev` via `webServer` config. If the iframe label locator fails, open the Typeform form (`https://form.typeform.com/to/FbFMsO5x`) in a browser and read the field question text — update the regex in `getByLabel` to match. Commit the final passing locator.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/lead-flow.spec.ts
git commit -m "test(e2e): happy-path lead flow with Datacrazy mocked via page.route"
```

---

### Task 20: [SETUP] GitHub Actions CI workflow (`ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: none
- Test: a successful CI run on the next push to `main`

**Dependencies:** Task 2, Task 19.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - uses: actions/setup-node@v4
        with:
          node-version: 24.14.1
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit tests
        run: pnpm test

      - name: Build (required for check:secrets)
        run: pnpm build
        env:
          DATACRAZY_API_TOKEN: ci-placeholder-token
          TYPEFORM_WEBHOOK_SECRET: ci-placeholder-typeform-secret-abcdef
          TYPEFORM_FORM_ID: FbFMsO5x
          NEXT_PUBLIC_TYPEFORM_FORM_ID: FbFMsO5x
          NEXT_PUBLIC_SITE_URL: https://ticto-ebulicao-lp.vercel.app

      - name: Check secret leaks
        run: pnpm check:secrets
```

> Placeholder env values are injected only for `pnpm build` so `getServerEnv()` doesn't fail-fast during the build. Real values live in Vercel Dashboard, never in CI.

- [ ] **Step 2: Commit + push and watch the CI run**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck/lint/test/build/check-secrets workflow"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
gh run watch
```

Expected: the run completes green.

---

### Task 21: [SETUP] GitHub Actions E2E workflow (`e2e.yml`) against Vercel Preview

**Files:**
- Create: `.github/workflows/e2e.yml`
- Modify: none

**Dependencies:** Task 20.

- [ ] **Step 1: Create `.github/workflows/e2e.yml`**

```yaml
name: E2E (Preview)

on:
  deployment_status:

jobs:
  e2e:
    if: github.event.deployment_status.state == 'success' && github.event.deployment.environment != 'Production'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - uses: actions/setup-node@v4
        with:
          node-version: 24.14.1
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E against preview URL
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.deployment_status.target_url }}
        run: pnpm e2e

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Commit + push**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: run E2E suite against Vercel preview deployments"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

The workflow runs on the **next** PR's Preview deployment. For a first smoke test, open a no-op PR (e.g., a typo fix in README after Task 24) and verify E2E runs green against the Preview URL.

---

### Task 22: [SETUP] Claude Code Action workflow + CodeQL + templates

**Files:**
- Create:
  - `.github/workflows/claude.yml`
  - `.github/ISSUE_TEMPLATE/bug.md`
  - `.github/ISSUE_TEMPLATE/task.md`
  - `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: none (CodeQL enabled via `gh` API)

**Dependencies:** Task 2.

- [ ] **Step 1: Create `.github/workflows/claude.yml`**

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

> **Version verification:** Before committing, run `gh api /repos/anthropics/claude-code-action/releases/latest --jq .tag_name` to confirm `@v1` is the current major tag. If it reports a different major (e.g., `v2`), update accordingly. This is a 2026 workflow — the API may have shifted from any fixed version reference.

- [ ] **Step 2: Set `ANTHROPIC_API_KEY` secret in the repo**

```bash
gh secret set ANTHROPIC_API_KEY
# paste the API key when prompted (from https://console.anthropic.com/settings/keys)
```

- [ ] **Step 3: Enable CodeQL (default config)**

```bash
gh api -X PUT /repos/johansabent/ticto-ebulicao-lp/code-scanning/default-setup \
  -f state=configured \
  -F query_suite=default \
  -F languages[]=javascript-typescript
```

> If the endpoint returns `404` because the repo isn't yet enrolled in GHAS for public repos, open `https://github.com/johansabent/ticto-ebulicao-lp/settings/security_analysis` and click **Enable** under *Code scanning* → *Default setup*. Public repos get GHAS free tier.

- [ ] **Step 4: Create issue + PR templates**

`.github/ISSUE_TEMPLATE/bug.md`:
```markdown
---
name: Bug report
about: Something broke
labels: ['type:feature', 'status:ready']
---

## Summary

<!-- One sentence -->

## Reproduction

1.
2.
3.

## Expected

## Actual

## Environment

- Browser:
- Preview URL:
- Commit SHA:

## Logs
```

`.github/ISSUE_TEMPLATE/task.md`:
```markdown
---
name: Agent task
about: Scoped chunk of work suitable for agentic execution
labels: ['type:feature', 'status:ready', 'agent:ok']
---

## Scope

<!-- What this task does and does NOT cover -->

## Files to touch

- [ ] `src/...`
- [ ] `tests/...`

## Acceptance criteria

- [ ]
- [ ]

## Dependencies

- Blocks:
- Blocked by:
```

`.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## Summary

<!-- 1–3 bullets: what this PR does and why -->

## Test plan

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test` passes
- [ ] `pnpm check:secrets` passes (after preview build)
- [ ] E2E workflow green against preview (if UI changed)
- [ ] Screencast attached (if CRM-path changed)

## Related issues

Closes #
```

- [ ] **Step 5: Commit + push**

```bash
git add .github/workflows/claude.yml .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
git commit -m "ci: Claude Code Action, issue/PR templates, enable CodeQL default scan"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

- [ ] **Step 6: Smoke-test Claude Code Action**

```bash
gh issue create --title "Smoke: @claude please reply with the word 'hello'" \
  --body "@claude ping"
```

Expected within 1–2 minutes: Claude comments on the issue with an acknowledgement. Close the issue after verification.

---

### Task 23: [TEST+SETUP] Manual test coverage pass — unit suite review

**Files:**
- Modify: any test missing or thin, based on coverage review
- Test: `pnpm test --coverage` (optional instrumented run)

**Dependencies:** Tasks 5–13 (all TDD libs exist).

- [ ] **Step 1: Run the full unit suite**

```bash
pnpm test
```

Expected: all tests from Tasks 5–13 pass. Count test cases; confirm the mental model matches:
- env: 5 cases
- logger: 4 cases
- typeform-fields: 5 cases
- webhook-auth: 7 cases
- utm-mapping: 7 cases
- datacrazy: 5 cases
- attribution: 7 cases

Total ≥ 40 unit cases.

- [ ] **Step 2: Optional coverage instrumented run**

```bash
pnpm test -- --coverage
```

Check that `src/lib/*.ts` shows ≥ 90% line coverage. If any lib is under 80%, add a test for the uncovered branch and commit.

- [ ] **Step 3: Commit if any test added**

```bash
git add tests/unit/
git commit -m "test: close coverage gaps in lib/*"
```

If nothing needed to be added, skip the commit.

---

### Task 24: [DOCS] README — every section required by briefing + spec §12

**Files:**
- Create/overwrite: `README.md`
- Modify: none

**Dependencies:** Tasks 1–22 (content references final behavior).

- [ ] **Step 1: Write `README.md` (overwrite the `create-next-app` default)**

```markdown
# Ebulição × Ticto — Landing Page

> Teste técnico para Gerente de Automações @ Ticto — 2026-04-15.

[![CI](https://github.com/johansabent/ticto-ebulicao-lp/actions/workflows/ci.yml/badge.svg)](https://github.com/johansabent/ticto-ebulicao-lp/actions/workflows/ci.yml)
[![E2E](https://github.com/johansabent/ticto-ebulicao-lp/actions/workflows/e2e.yml/badge.svg)](https://github.com/johansabent/ticto-ebulicao-lp/actions/workflows/e2e.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Live demo

- **Produção:** https://ticto-ebulicao-lp.vercel.app
- **Repo:** https://github.com/johansabent/ticto-ebulicao-lp

### URL de teste parametrizada

```
https://ticto-ebulicao-lp.vercel.app/?utm_source=google&utm_medium=cpc&utm_campaign=ebulicao2026&utm_content=banner&utm_term=raffle&sck=testclick&src=lp
```

Os 7 parâmetros são capturados no first-touch, persistidos em localStorage e repassados via Typeform `hidden` fields até o CRM Datacrazy.

### Screencast (≤ 2 min)

<!-- Replace with unlisted YouTube/Vimeo link after Task 25 -->
https://youtu.be/<SCREENCAST_ID>

## Sumário

1. [Quick start](#quick-start)
2. [Stack e racional](#stack-e-racional)
3. [Integração direta (Typeform → Datacrazy)](#integração-direta-typeform--datacrazy)
4. [Mapeamento UTM → Datacrazy (3 camadas)](#mapeamento-utm--datacrazy-3-camadas)
5. [First-touch attribution com re-injeção](#first-touch-attribution-com-re-injeção)
6. [Dificuldades encontradas](#dificuldades-encontradas)
7. [Limitações conscientes (escopo 72h)](#limitações-conscientes-escopo-72h)
8. [Testes](#testes)
9. [Deploy](#deploy)

## Quick start

Pré-requisitos: Node.js 24 LTS (`.node-version`), pnpm 9, conta Vercel (para `vercel env pull`).

```bash
pnpm install
cp .env.example .env.local    # preencher DATACRAZY_API_TOKEN + TYPEFORM_WEBHOOK_SECRET
# ou: vercel link && vercel env pull .env.local
pnpm dev                      # http://localhost:3000
pnpm test                     # unit (Vitest)
pnpm e2e                      # Playwright com Datacrazy mockado
```

## Stack e racional

- **Next.js ^16.2** (App Router, `proxy.ts`, async Request APIs).
- **Node.js 24 LTS** em **Vercel Fluid Compute** — `node:crypto` nativo para HMAC; timeout 300s cobre retries.
- **Tailwind CSS ^4** (CSS-first via `@theme`), design tokens portados do Teste_dev (Tomato Grotesk + Space Grotesk, brand-cyan `#5bbed9`).
- **`@typeform/embed-react` ^4** — Widget inline com `hidden` prop para UTM passthrough.
- **pnpm** — cache nativo na Vercel.
- **Zod** para validação fail-fast de env vars no boot.
- **Playwright ^1.59** para E2E; **Vitest** para unit. CI no GitHub Actions. Deploy via integração GitHub ↔ Vercel.

São os defaults estáveis de 2026 — escolhi não experimentar com `cacheComponents`, `vercel.ts` ou middleware alternativo porque a LP é essencialmente estática e o ganho não justifica complexidade no escopo de 72h.

## Integração direta (Typeform → Datacrazy)

A Ticto pode integrar Typeform ao Datacrazy via Zapier, Make ou n8n — são ferramentas legítimas. Para este teste escolhi o caminho direto: um Route Handler Next.js (`src/app/api/lead/route.ts`) recebe o webhook, valida autenticação HMAC SHA-256 (`typeform-signature` header, base64), transforma o payload e chama a REST API do Datacrazy. É uma escolha de engenharia pragmática — controle total, latência mínima, falhas visíveis em `vercel logs`, zero vendor lock-in na rota crítica.

**Auth do webhook:** confirmado via day-0 spike (ver `docs/decisions/2026-04-16-typeform-webhook-auth.md`). Typeform oferece apenas HMAC — um único modo, sem branching de `WEBHOOK_AUTH_MODE`. Signature header: `typeform-signature: sha256=<base64>`. A implementação em `src/lib/webhook-auth.ts` inclui replay window de ±5 minutos via `form_response.submitted_at`.

## Mapeamento UTM → Datacrazy (3 camadas)

A REST API pública do Datacrazy (`POST /api/v1/leads`) não documenta campos customizados. Os 7 parâmetros são mapeados em 3 camadas nativas do schema:

- **`source`** recebe `utm_source` (origem primária, indexada no CRM).
- **`sourceReferral.sourceUrl`** preserva a URL completa com todas as query strings (auditoria).
- **`notes`** contém JSON estruturado com todos os 7 params + `landing_page` + `captured_at` — parseável downstream, legível humanamente.

Essa decisão prioriza preservação do dado bruto sobre inventar estrutura em campos que não sei se o CRM indexa. **`tags` não é usado** — explicitamente rejeitado no spec.

## First-touch attribution com re-injeção

O `@typeform/embed-react` Widget aceita `hidden` prop — passa diretamente os 7 UTMs para `form_response.hidden` na submissão. O componente `src/components/utm-rehydrator.tsx` salva os 7 parâmetros em `localStorage` na primeira visita; em visitas sem UTMs na URL, reescreve via `history.replaceState` **antes do paint** (via `useLayoutEffect`). O hook `useAttribution()` lê o localStorage e alimenta o Widget.

Trade-off consciente: URL copiada de um retorno contém os UTMs da primeira visita. O ganho (atribuição first-touch sem forkar a lib) vale o custo.

## Dificuldades encontradas

1. **Pivot de YayForms para Typeform.** Reviewer request no dia-1. Day-0 spike foi refeito para Typeform; ADR em `docs/decisions/2026-04-16-typeform-webhook-auth.md`. Principal diferença técnica: encoding é **base64** (não hex) e a assinatura usa o prefixo `sha256=`.

2. **Datacrazy sem campo customizado genérico.** Schema REST público não expõe `customFields` / `additionalFields`. Resolvi com mapping 3-layer em campos nativos.

3. **Typeform PAT exposto durante spike.** Regenerado via Typeform → Settings → Personal Tokens → `openclaw-automation`. PAT não é necessário em runtime — apenas para Management API.

4. **Design portado de Teste_dev.** Figma MCP foi lido inline; design tokens, componentes e assets foram portados diretamente de `D:/Users/Johan/Dev Projects/Teste_dev/` — zero re-extração, zero rate limit.

## Limitações conscientes (escopo 72h)

1. **Dedup durável de webhooks:** em produção eu usaria Upstash Redis via Marketplace Vercel armazenando `form_response.token` com TTL. Aqui, a idempotência é delegada ao Datacrazy — a plataforma identifica leads por `nome + email` ou `nome + telefone`, então retries convergem para o mesmo lead no CRM.

2. **Observabilidade além de Vercel Logs:** em produção, Sentry ou equivalente. Aqui, logs JSON estruturados via `console.log` — auditáveis em `vercel logs`, zero custo adicional.

3. **CSP específica:** começar com CSP rigorosa sem quebrar embed + analytics exige iteração. Enviei com security headers básicos (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS).

## Testes

- **Unit (Vitest)** — `pnpm test`: 7 arquivos em `tests/unit/`, cobrindo env, logger, typeform-fields, webhook-auth, utm-mapping, datacrazy, attribution. Fixture canônica em `tests/fixtures/typeform-webhook.json`.
- **E2E (Playwright)** — `pnpm e2e`: `tests/e2e/lead-flow.spec.ts`, Datacrazy **mockado** via `page.route` para evitar flakiness e respeitar rate limits em CI. Smoke live é manual (screencast).
- **Secret-leak check** — `pnpm check:secrets`: varre `.next/static` + `out` por tokens server-only. Rodado em CI.

## Deploy

- **Vercel + GitHub integration.** Push em `main` = produção; PRs = Preview deployments.
- **CI** — `.github/workflows/ci.yml`: typecheck + lint + unit + build + secret check em cada PR e push.
- **E2E** — `.github/workflows/e2e.yml`: roda contra a Preview URL após cada deploy bem-sucedido.
- **Claude Code Action** — `.github/workflows/claude.yml`: `@claude` responde a issues/PRs, abre PRs por instrução. Showcase direto do cargo de Gerente de Automações.
- **CodeQL** — ativo (default setup, free para repos públicos).

## Licença

MIT — ver [LICENSE](./LICENSE).
```

- [ ] **Step 2: Add a LICENSE file**

Create `LICENSE`:
```
MIT License

Copyright (c) 2026 Johan Sabent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: README covering stack, integration, mapping, testing, and deploy"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

---

### Task 25: [DEPLOY] Preview deploy + smoke live + screencast (agent:pair)

**Files:**
- Modify: `README.md` (replace `<SCREENCAST_ID>` placeholder in Step 4 of this task)

**Dependencies:** Task 24.

**Handoff:** The agent cannot record screen video. The human does Steps 2–3; the agent edits the README in Step 4.

- [ ] **Step 1: Trigger a Preview deploy**

```bash
git checkout -b chore/smoke-live
git commit --allow-empty -m "chore: smoke live submission"
git push -u origin chore/smoke-live
gh pr create --title "chore: smoke live submission" --body "Preview for smoke run." --base main
```

Wait for Vercel to post the Preview URL in the PR.

- [ ] **Step 2 (HUMAN): Run the smoke against live Datacrazy**

Open the Preview URL with the URL-parametrized query string (the same one that ships in README). Fill the form with real test data (`Teste QA`, `12345678900`, a throwaway email you control, a valid phone, select `Sim` for vende online). Submit.

- [ ] **Step 3 (HUMAN): Record the screencast**

Using OBS / Screen Studio / any recorder:

1. Open the Preview URL with all 7 UTMs in the query string. Confirm URL bar visible.
2. Fill the form end-to-end (all 5 fields). Click submit.
3. Show the Typeform success screen (thank you page).
4. Switch to Datacrazy CRM (`https://crm.datacrazy.io`). Show the new lead list → click into the lead.
5. Show:
   - Name / email / phone fields populated
   - `source` = `linkedin` (or whatever `utm_source` was)
   - `sourceReferral.sourceUrl` preserving the full URL
   - `notes` field containing the 7-key JSON blob

Keep the recording ≤ 2 minutes. Upload as unlisted YouTube (or Vimeo). Copy the URL.

- [ ] **Step 4 (AGENT): Patch the README screencast link**

Edit `README.md`, replace `https://youtu.be/<SCREENCAST_ID>` with the real URL.

- [ ] **Step 5: Merge the Preview PR and confirm production**

```bash
gh pr merge --squash --delete-branch
```

Wait for the production deploy to complete. Visit `https://ticto-ebulicao-lp.vercel.app/` — confirm the LP loads and the form still works end-to-end on production.

- [ ] **Step 6: Final commit on main** (if README edit was made on `main`)

```bash
git checkout main
git pull --ff-only
git add README.md
git commit -m "docs: link final screencast URL"
git push -u origin HEAD
# Per Workflow Contract: open a PR against main — never push main directly.
# gh pr create --fill --base main
```

- [ ] **Step 7: Run the delivery checklist from spec §13**

Confirm each item ticked off:
- [ ] Preview URL público funcionando
- [ ] Repo GitHub público criado e push feito
- [ ] Env vars configuradas em Production + Preview no Vercel
- [ ] URL de teste parametrizada documentada no README
- [ ] Screencast gravado e linkado
- [ ] README com §12.1–§12.8
- [ ] `pnpm check:secrets` passando
- [ ] `pnpm test` + `pnpm e2e` passando em CI
- [ ] `docs/decisions/2026-04-16-typeform-webhook-auth.md` presente
- [ ] Typeform webhook secret rotacionado — o valor original do spike foi comprometido ao ser commitado no repo público e NÃO pode voltar a ser usado; valor ativo vive apenas em Vercel env + `.env.local` local

- [ ] **Step 8: Submit the deliverable**

Reply to the Ticto email/thread with the 5 required items (briefing §4):
1. URL published: `https://ticto-ebulicao-lp.vercel.app`
2. GitHub repo: `https://github.com/johansabent/ticto-ebulicao-lp`
3. Parametrized test URL: (copy from README)
4. Screencast link: (YouTube/Vimeo unlisted)
5. README: link to the README section of the repo

**Acceptance:** email sent; timestamp precedes the 72h deadline.

---

## Self-review

Running the spec-coverage checklist against the plan:

| Spec item | Covered by |
|---|---|
| LP in Next.js 16 matching Figma/Teste_dev design | Tasks 3, 16, 17 |
| Typeform inline embed (`@typeform/embed-react` Widget) | Tasks 1, 15, 17 |
| 7 UTM/sck/src capture + transmission via hidden fields | Tasks 13, 14, 15, 19 |
| Datacrazy integration via Route Handler | Tasks 10, 11 |
| Typeform HMAC webhook auth (single mode, sha256=base64) | Tasks 1, 8, 11 |
| 3-layer UTM mapping (source / sourceUrl / notes-JSON) | Task 9 |
| No tags field (rejected decision preserved) | Task 9 |
| Env validation fail-fast | Task 5 |
| PII redaction in logs | Task 6 |
| First-touch with useLayoutEffect + history.replaceState | Tasks 13, 14 |
| Security headers via proxy.ts | Task 12 |
| check:secrets pre-push gate | Tasks 3, 20 |
| Vitest unit tests for env, logger, typeform-fields, webhook-auth, utm-mapping, datacrazy, attribution | Tasks 5–10, 13, 23 |
| Playwright E2E with Datacrazy mocked | Task 19 |
| Canonical fixture at tests/fixtures/typeform-webhook.json | Task 1 |
| GitHub repo public + topics + labels | Task 2 |
| Vercel deploy via GitHub integration | Task 2 |
| CI workflow (typecheck / lint / test / build / secrets) | Task 20 |
| E2E workflow against Preview URL | Task 21 |
| Claude Code Action workflow | Task 22 |
| Issue + PR templates | Task 22 |
| CodeQL default setup | Task 22 |
| README with all §12.1–§12.8 + briefing deliverables | Task 24 |
| Screencast recorded + linked | Task 25 |
| Day-1 Typeform spike as BLOCKER for webhook-auth | Task 1 → Task 8 |
| Design assets ported from Teste_dev (no Figma MCP rate-limit risk) | Task 16 |
| CVE silence (no specific CVE cited in README) | Task 24 |
| Dependabot OFF | not enabled (Task 2 only creates labels; no Dependabot PR) |

No gaps.

Placeholder sweep: the only literal `<PLACEHOLDERS>` in the plan are inside the ADR template in Task 1 Step 6 — those are explicitly meant to be filled from real webhook evidence, so they are not plan failures.

Type/name consistency: `mapToDatacrazy` (Task 9), `postLead` (Task 10), `validateWebhook` (Task 8), `extractNamedFields` (Task 7), `UTM_KEYS` + `applyStoredToUrl` (Task 13) — all referenced by Task 11 with the exact names declared.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-15-ticto-lp-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Works especially well for Tasks 5–10 (pure libs) which can run in parallel once Task 5 lands. Tasks 1 (day-0 spike), 16 (Figma), and 25 (screencast) are `agent:pair` and will hand back to you for human input.

**2. Inline Execution** — execute tasks sequentially in this session using `superpowers:executing-plans`, batch execution with checkpoints after each task.

Which approach?
