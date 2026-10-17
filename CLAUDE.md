# Claude AI Agent Guidelines for Dispute Resolver

The Dispute Resolver (`resolve.kleros.io`) is being rebuilt on branch `feat/rewrite`. The contract is `docs/parity/` (frozen on 2026-10-14): the behavioral spec of today's app (02), the security checklist (03), the golden cases (04), the deviations ledger (05) and the registry schema (06). The decisions are `docs/adr/`; behavior changes awaiting the maintainer's review are in `docs/ledger-proposals.md`.

- A behavior that is neither in the spec nor in the ledger is not built. A difference from the spec that is not a ledger entry is a regression.
- The spec describes the old app; the ledger says what changes; the checklist gates the merge.
- If a correct implementation seems to require a behavior difference that the ledger does not record, do not ship it silently: report it back. The orchestrator records it in `docs/ledger-proposals.md` for the maintainer's review.

## Layout

- `packages/core` (`@dispute-resolver/core`): registry, URL and CID rules, chain reads through an injected client, the Reality pipeline, meta-evidence and evidence pipelines, appeal math, write-call builders, allowlists. No React, no DOM, no `window`, no `localStorage`.
- `packages/web` (`@dispute-resolver/web`): the React app, the script runner page (`public/__runner/index.html`) and its host, the Netlify headers.
- The **old app** (`src/`, `public/`, `scripts/generate-reality-known-questions.js`) is no longer in this tree; it stays readable on `master`. Read its files with `git show master:<path>` (for example `git show master:src/app.js`) when the spec points at them. It is reference only: nothing in this tree imports from it.

## Commands

```bash
yarn install
yarn typecheck
yarn lint
yarn test
yarn build
yarn workspace @dispute-resolver/web dev
```

## Hard rules

**Security** (each maps to a row in `docs/parity/03-security-checklist.md`):
- Untrusted: meta-evidence and evidence JSON, dynamic-script output, Reality questions and templates, every arbitrable contract, the chain ID in the URL, user input, anything a third-party frame sends back.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` anywhere in the app. The only place untrusted script text is evaluated is the runner page of ADR 0004.
- Markdown never gets a raw-HTML plugin (`rehype-raw` is forbidden).
- External links go through the shared link component: https only, `target="_blank" rel="noopener noreferrer"`.
- Meta-evidence, evidence and dynamic-script URIs must pass the canonical content-addressing check in `core` before any fetch. Rejections are never cached.
- The arbitrable used for any write comes from the arbitrator (`disputes(id).arbitrated`), never from meta-evidence.
- Every write path checks that the wallet's chain equals the page's chain first, and refuses visibly when they differ.
- Reads go through the configured per-chain RPC only; the wallet is used for signing only.
- UI code never inspects a contract address. It asks the registry for the family and the overrides.
- Registry addresses are lowercase; every override carries a justification.

**No test-only code in the production bundle**: no fixture modes, mock providers, or flags that swap in fake data. Test doubles live in test files and the Playwright harness only.

**Failure behavior**: a bad or malformed dispute degrades one section behind an error boundary, never blanks the page. Transaction failures are always shown to the user, never swallowed.

**Tests**: written first for `core`. Name tests after the row or entry they prove, for example `it("B2: rejects /ipfs/<cid>/../../ipns/x")` or `it("D-30: applies the round offset in the execution period")`, so the checklist audit can map rows to tests. Unit tests never touch the network; RPC is mocked through the injected transport. Recorded on-chain data lives in fixture files with the block number it was read at.

**Dependencies**: only the orchestrating session adds or removes dependencies. If a task needs one, report it back instead of running `yarn add`. Every dependency is justified in `docs/adr/0002-application-stack.md`.

**Secrets**: never print, log, copy or commit values from `.env` (RPC URLs carry API keys). Scripts that need an RPC read `process.env` and print only results.

**Git**: agents never run git commands that write (`add`, `commit`, `stash`, `checkout`, `reset`, `restore`, `clean`, `rebase`, `merge`, `push`). Commits are signed by the maintainer.

## Code quality

This project uses SonarCloud. Never introduce code that would trigger SonarCloud warnings; fix existing issues in files you touch. TypeScript is strict; `any` is not allowed, and untrusted JSON is typed `unknown` until a Zod schema parses it.

## Kleros arbitration notes

- Some arbitrables implement only IEvidence and IArbitrable; some implement IDisputeResolver as well. Evidence submission and crowdfunded appeals are only guaranteed through IDisputeResolver; other families are described in `docs/parity/06-registry-schema.md`.
- View functionality must work for every dispute.
- Bad disputes exist (badly configured, not following the standard). They do not need to render perfectly, but they must never crash the application.
