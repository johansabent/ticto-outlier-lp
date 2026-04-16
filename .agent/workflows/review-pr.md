---
description: Review PR feedback, summarize what matters, and optionally address it with explicit confirmation gates before any push, PR comment, or thread resolution.
---

# /review-pr - PR Review and Resolution

$ARGUMENTS

---

## Purpose

Use this workflow to inspect Pull Request feedback end to end:

- summarize review comments, requested changes, open questions, and CI status
- optionally fix issues locally when the user clearly asks to address review feedback
- only mutate GitHub state after explicit user confirmation

This is a sensitive workflow. Local analysis and code changes can proceed when intent is clear, but outward PR actions must always be confirmed.

---

## Safety Contract

Always stop and ask before any of the following:

- `git push`
- posting or replying to PR comments or reviews
- resolving GitHub review threads

Do not mark threads resolved unless the underlying issue was actually fixed and the relevant changes are already pushed or ready to push with user approval.

---

## Prerequisites

- Access to the PR branch and repository context
- A working GitHub path for reading PR data
  - use the available GitHub integration if it supports the needed data
  - if thread-level resolution data is missing, use `gh api graphql`
- GitKraken is approved for commit composition and push steps when those steps are explicitly approved by the user

Never assume extra repo config files exist unless they are documented in this repository.

---

## Phase 1: Fetch and Summarize

1. Fetch the PR metadata.
2. Fetch review comments, reviews, and current check or CI status.
3. Fetch unresolved review threads when available.
4. Summarize findings in these buckets:
   - `BLOCKING`: prevents merge or breaks expected behavior
   - `SUGGESTION`: worthwhile improvement, not a hard blocker
   - `NIT`: minor cleanup or style note
   - `QUESTION`: needs an answer or product judgment
5. Call out which items are actionable code changes versus which need a human reply.

If the user only asked for review, stop after the summary.

---

## Phase 2: Local Resolution

When the user clearly asks to address, fix, or resolve PR feedback:

1. Work through unresolved actionable items one by one.
2. Apply fixes locally.
3. Run the repo-defined validation checks from `AGENTS.md`.
4. Do not invent `npm`, `pnpm`, or other commands from another project. Only run checks that actually exist in this repo.
5. Keep a short mapping of:
   - issue raised
   - local fix made
   - validation run
   - whether the thread is ready to resolve after push

If an item requires product judgment or a non-code decision, stop and surface it clearly instead of guessing.

---

## Phase 3: External PR Actions

After local fixes are ready:

1. Ask for explicit confirmation before preparing any push, PR reply, or thread resolution.
2. If the user approves a push:
   - use GitKraken for commit composition and push, or another approved repo Git path if requested
   - keep the commit scope limited to the resolved PR feedback
3. If the user approves PR replies:
   - reply with a concise fix summary tied to the actual resolved comments
   - do not claim a fix was made if it was only analyzed
4. If the user approves thread resolution:
   - resolve only the threads whose underlying issue is actually addressed
   - leave disputed or partially addressed threads open

---

## Phase 4: Optional Bot Re-review

Only re-trigger bots when one of these is true:

- the user explicitly asks for bot re-review
- the repository later adds a documented bot-preference source

Never guess bot handles. If bot names are not explicitly requested or documented in this repo, skip bot mentions.

---

## Output Format

```markdown
## PR Review Summary — PR #<number>

**Status:** <CI/check status>
**Reviews:** <review summary>
**Threads:** <open vs resolved summary>

### Blocking
- [ ] <issue> — `path/to/file.ts:L42`

### Suggestions
- [ ] <issue> — `path/to/file.ts:L18`

### Nits
- [ ] <issue>

### Questions
- [ ] <question> — by @reviewer

### Local Resolution Status
- [ ] <item> -> <fix status / validation status>

### Awaiting Confirmation
- [ ] push changes
- [ ] post PR replies
- [ ] resolve review threads
```

---

## Rules of Thumb

- Prefer a read-only summary first when the user intent is ambiguous.
- If you want a read-only second opinion before mutating PR state, use `.agent/workflows/review-codex.md`.
- Prefer capability-level instructions over hardcoding tool names that may not exist here.
- Preserve GitKraken where commit composition or push is explicitly approved.
- Keep the workflow repo-valid. If a copied instruction depends on missing config or tooling, remove or restate it instead of assuming it exists.
