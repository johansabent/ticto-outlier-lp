---
description: Use the global /codex skill as a read-only second opinion for this repository's code, plans, and local agent contract.
---

# /review-codex - Codex Second Opinion

$ARGUMENTS

---

## Purpose

Use this workflow when you want an independent Codex pass before making or landing changes.

Typical uses:

- second-opinion code review on the current diff
- adversarial review of risky changes
- review of local agent contract files and workflow docs
- plan review when you want a harsher implementation or risk pass

This workflow is read-only. It does not replace `.agent/workflows/review-pr.md` for PR mutation steps.

---

## Repo-local bootstrap

For this repository, always point Codex at these files first when they are relevant:

- `AGENTS.md` as the repo contract
- `CLAUDE.md` as a supplemental shim
- `.agent/workflows/review-pr.md` for PR-review behavior
- other `.agent/workflows/*.md` files that match the task

If the review is about agent behavior, local review flow, or instruction quality, explicitly tell Codex to read those files before giving its answer.

---

## Default usage

- For code diff review:
  - use `/codex review`
  - add a short focus when useful, for example: `/codex review focus on security and data flow`
- For adversarial review:
  - use `/codex challenge`
  - use this for failure modes, auth holes, race conditions, and ways the implementation can break
- For contract or workflow review:
  - use `/codex` with a direct prompt that tells Codex to review `AGENTS.md`, `CLAUDE.md`, and relevant `.agent/workflows/*.md`
  - example: `/codex review the local repo contract and workflow docs for drift, missing safety gates, and contradictory instructions`

The global skill now defaults to `high` reasoning in all modes. Use `--xhigh` only for unusually sensitive reviews where latency and token cost are acceptable.

---

## Project-specific guidance

- Prefer `review-codex` before mutating PR state if you want a read-only second opinion.
- If the task is specifically about PR comment handling or thread resolution, read `.agent/workflows/review-pr.md` first, then use Codex as a second reviewer rather than the primary mutation workflow.
- If Codex findings conflict with the local repo contract, the repo contract wins unless the user decides to change it.

---

## Output expectations

When using this workflow, present:

- the exact `/codex ...` mode chosen
- the files or local workflows Codex was told to read
- Codex's full output
- a short synthesis after the full output, not instead of it

---

## Rules of Thumb

- Use `review-pr` for action on PR feedback.
- Use `review-codex` for a second opinion.
- Keep Codex read-only.
- If the review target is the local agent contract itself, include both `AGENTS.md` and `CLAUDE.md` plus the relevant workflow docs in the prompt.
