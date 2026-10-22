# Agent guide for Dispute Resolver

The Dispute Resolver ([resolve.kleros.io](https://resolve.kleros.io)) is a general-purpose arbitrable application for Kleros v1 arbitration: it lists the open disputes of a network, shows any dispute with its evidence and ruling, submits evidence, funds appeals, withdraws appeal rewards and creates disputes from a form. Reading needs no wallet; actions need a wallet on the page's network. Most disputes come from other arbitrable apps, some of them badly configured, so viewing must work for every dispute.

## Layout

- `packages/core` (`@dispute-resolver/core`): the arbitrable registry and family detection, URL and content-addressing rules, chain reads through an injected client, the Reality.eth pipeline, the meta-evidence and evidence pipelines, appeal math, write-call builders and allowlists. No React, no DOM, no `window`, no `localStorage`; everything environment-specific is an injected parameter. `web` imports core only from its package entry.
- `packages/web` (`@dispute-resolver/web`): the React app (Vite, React 18, viem and wagmi with Reown AppKit, `@kleros/ui-components-library`), the Netlify headers (`public/_headers`), the build plugins (`vite-plugins/`) and the Playwright suites (`e2e/`). Inside `src/`, a directory is imported through its `index.ts` only: `env/` (the only reader of `import.meta.env`), `data/` (every chain read, through core), `wallet/` (connect, switch chain, sign), `routing/`, `shell/`, `ui/`, `safe-content/` (links, markdown, frames, attachments), `atlas/` (uploads), `runner/` and `pages/`. Test doubles live in `src/test/` and `*.test.ts(x)` files.
- The script runner: dynamic scripts from meta-evidence run in `public/__runner/index.html`, a static page loaded in an opaque-origin sandboxed iframe with its own Content-Security-Policy, talking to the app over a message port only. The host is `src/runner/host/`, the page `src/runner/page/`, and `src/runner/page/evaluate.ts` is the only file in the repository that evaluates untrusted script text.

## Commands

```bash
yarn install
yarn typecheck
yarn lint
yarn test
yarn build
yarn workspace @dispute-resolver/web dev
```

`yarn check:bundle` (after `yarn build`) fails when the built site carries a test double, loads a script or stylesheet from another origin, has an inline script, or lacks a file the deploy needs. Browser suites: `yarn workspace @dispute-resolver/web e2e` and `e2e:runner`. Reality.eth operations are in `REALITY_OPS.md`.

## Hard rules

**Untrusted content.** Meta-evidence and evidence JSON, dynamic-script output, Reality.eth questions and templates, every arbitrable contract, the chain ID in the URL, user input and anything a third-party frame sends back are untrusted. Untrusted JSON is `unknown` until a Zod schema parses it (`z` comes from `packages/core/src/zod.ts`, which keeps zod from compiling parsers with `Function`).

**No raw-HTML sinks.** No `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` anywhere in the app; the runner page's `evaluate.ts` is the single exception. Markdown is rendered by `safe-content`'s `SafeMarkdown` and never gets a raw-HTML plugin (`rehype-raw` is forbidden). Attachments are never rendered inline (the library's `FileViewer` is banned); they open through `safe-content`'s `Attachment`.

**Links and frames.** Every external link the app renders goes through `safe-content`'s `ExternalLink`: https only, `target="_blank" rel="noopener noreferrer"`. Links inside Markdown are the exception: `SafeMarkdown` renders its own anchor, also `target="_blank" rel="noopener noreferrer"`, and keeps the `http`, `https`, `mailto` and `tel` links its URL transform allows (relative and fragment links too); any other URL keeps its label as text. Every iframe is `safe-content`'s evidence-display frame or the runner host. Raw `<a href>` and `<iframe>` JSX exist only under `safe-content/`; in-app navigation uses react-router's `Link`.

**Content addressing.** Meta-evidence, evidence and dynamic-script URIs must pass core's canonical content-addressing check before any fetch; a rejection is never cached. Dynamic scripts run only when their CID is on core's allowlist, and Reality.eth arbitrables listed in the registry never run their script: core derives the ruling options from the on-chain question instead.

**Writes.** The arbitrable for any write comes from the arbitrator (`disputes(id).arbitrated`), never from meta-evidence. Every write path checks that the wallet's chain equals the page's chain first and refuses visibly when they differ. Every write outcome, success or failure, is shown to the user; nothing is swallowed.

**Reads.** Reads go through core's read clients on the configured per-chain RPC only (`REACT_APP_*` variables, see `README.md`); the wallet is used for signing only. wagmi's read hooks are banned.

**Registry.** UI code never inspects a contract address: it asks core for the family, the capabilities and the overrides. Registry addresses are lowercase, and every override and Reality proxy entry carries a justification.

**Failure behavior.** A bad or malformed dispute degrades one section behind its error boundary and never blanks the page.

**No test-only code in the production bundle.** No fixture modes, mock providers, mock connectors or flags that swap in fake data. Test doubles live in test files, `src/test/` and the Playwright harness; `yarn check:bundle` enforces it on the built site.

**Library first.** UI elements are the components of `@kleros/ui-components-library` whenever the library has one (fields, selects, buttons, cards, accordions, steps, modals, alerts, toasts, progress, date picker, file uploader, copiable values). Custom markup is for what the library lacks, styled with the library's tokens only, never with color literals. The maintainer keeps the library on its latest release.

**Tests.** Test names describe the behavior they prove in plain words. Unit tests never touch the network: RPC is mocked through the injected transport. Recorded on-chain data lives in `__fixtures__/` files with the block number it was read at.

**Comments** only where they give a non-obvious why, a constraint or a trap. Never narrate what the code plainly does; prefer deleting a comment to rewording it.

**Dependencies.** Agents never add, remove or upgrade a dependency. A task that needs one reports it back; the maintainer adds and justifies it.

**Secrets.** Never print, log, copy or commit values from `.env` (RPC URLs carry API keys). Scripts that need an RPC read `process.env` and print only results, never the URLs.

**Git.** Agents never run git commands that write (`add`, `commit`, `stash`, `checkout`, `reset`, `restore`, `clean`, `rebase`, `merge`, `push`). The maintainer commits and signs.

## Code quality

TypeScript is strict and `any` is not allowed. The project uses SonarCloud: never introduce code that would raise an issue, and fix the existing issues in the files you touch. Before a push, read the pull request's open issues through the public API and resolve them:

```bash
curl "https://sonarcloud.io/api/issues/search?componentKeys=kleros_dispute-resolver&pullRequest=<n>&resolved=false"
```

where `<n>` is the pull request number.

## Kleros arbitration notes

- Some arbitrables implement only IEvidence and IArbitrable; some implement IDisputeResolver as well. Evidence submission and crowdfunded appeals are only guaranteed through IDisputeResolver. The other families the app recognizes, and what each supports, are the `Family` and `Capabilities` types of `packages/core/src/families/`.
- View functionality must work for every dispute.
- Bad disputes exist (badly configured, not following the standard). They do not need to render perfectly, but they must never crash the application.
