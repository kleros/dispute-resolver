---
name: verifying-ui-changes
description: Verifies a change to the Dispute Resolver UI before it is accepted, by running tests and build, and checking the affected pages both in fixture mode and in real mode. Use when asked to verify, check, test or accept a change to a page or UI component, including requests like "is this ready to merge?" or "check the Ongoing page", even if the word "verify" isn't used.
disallowed-tools: Edit Write
---

# Verifying UI changes

This procedure only reports. The user decides what gets fixed.

## Uncommitted changes
!`git status --short -- . ':(exclude).claude'`

## Inputs
- The change to verify: the uncommitted changes listed above, or commits the user names. If neither exists, ask which change to verify and stop.
- Affected pages: infer them from the changed files and state the inference.

## Steps
1. List what the change claims to do as the first rows of the table. Check them after step 2.
2. Run `CI=true yarn test`, then `yarn build`. If either fails, stop.
3. For each affected page, run its checklist, starting each configuration it names from `.claude/launch.json`.
   - Ongoing page: [references/ongoing.md](references/ongoing.md)
   - Case details page: [references/case.md](references/case.md)
   - Create page: [references/create.md](references/create.md)
4. Check each affected page at desktop, tablet and mobile widths.
5. When done, stop any dev servers you started.

## Evidence
Return the command outputs and one table: check, expected, result (pass or fail), and what you observed (visible text or computed style). Screenshots are optional.

## Stop or escalate
- A failing test or build: stop and report, as checking a broken build means nothing.
- An affected page with no checklist: run tests, build, and checks derived from the change in real mode, plus fixture mode if the README says fixtures cover that page, and say that the page has no checklist.
- If real mode can't reach the RPC, report it and keep the fixture results.