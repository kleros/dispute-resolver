---
status: accepted
date: 2026-10-12
---

# Stack: Vite, React 18, viem and wagmi with Reown AppKit, the Kleros UI components library, and the shared Atlas client

The rewrite adopts the Kleros v2 frontends' ethereum, wallet, Atlas and component-library stack (viem, wagmi, AppKit, `@kleros/kleros-app`, `@kleros/ui-components-library`), so that wallet, upload and design code is shared rather than hand-rolled and the resolver reads as a member of the v2 product family. It departs from `kleros-v2/web` on styling (Tailwind 4 rather than styled-components) and observability (no Sentry, no analytics, no internationalization). Several choices look wrong without context and are recorded here for that reason.

## Decision

- **Vite, TypeScript in strict mode, yarn 4 workspaces.** Two packages: `core` (no React, no DOM: the arbitrable registry, URL and CID rules, chain reads through an injected client, the Reality pipeline, the allowlists) and `web` (the React app, including the iframe sandbox runner because it needs a DOM). The package boundary makes "core cannot import React" a build error. This fixes only the package boundary; the module breakdown inside each package is deferred (ADR 0001).
- **React 18.3, not 19.** `@kleros/ui-components-library` 3.9 and `@kleros/kleros-app` 3.1 both declare React 18 as their peer. React 19 is adopted when they do.
- **viem 2 for every chain interaction, wagmi 2 with Reown AppKit (wagmi adapter) for wallets.** Wallets connect through EIP-6963 injected discovery (the standard by which browser-extension wallets announce themselves), WalletConnect and Coinbase, which are the adapter's defaults. The Safe in-app connector is not added: it only works when the app runs inside Safe's iframe, and the app forbids being framed (security checklist C1); Safe users connect through WalletConnect, which Safe's wallet provides. AppKit is created with `features: { analytics: false, email: false, socials: [], swaps: false, onramp: false }`, because it enables all of these by default; `socials` must be an empty array, not `false`, because the wagmi adapter reads a falsy value as "use the default list" and would still register the embedded-wallet connector. A test asserts that the wagmi config contains no embedded-wallet connector, re-checked against the AppKit version the rewrite pins. The app loads read-only on the configured RPC endpoints and never prompts until the user presses Connect. The wallet's chain must equal the page's chain before any signature is requested; today's app does not check this, and it is a security-checklist row.
- **ethers, web3, `@alch/alchemy-web3` and `@kleros/archon` are removed**, so every chain interaction goes through viem. The three archon functions the app used (`getDispute`, `getEvidence`, which also fetches the evidence JSON, and `getRuling`) are reimplemented in `core` with tests. Evidence URIs must be content-addressed (an `/ipfs/<CID>` path, not an IPNS name or an HTTP host), the rule the Kleros Court frontend adopted in kleros/court#594; items that fail it are counted visibly, not hidden silently.
- **`@kleros/ui-components-library` with Tailwind 4** (its peer) and the Kleros v2 design tokens, dark mode included. antd, bootstrap, react-bootstrap, styled-components, sass, jquery and moment are removed. Every other current dependency (router, markdown renderer, dropzone, date picker, iframe resizer, blockies) is re-chosen during the build and is not carried over by default; the router must preserve the URLs frozen in ADR 0001.
- **Atlas through `@kleros/kleros-app` 3.1, unforked.** Atlas is the Kleros backend that authenticates users by Sign-In with Ethereum (SIWE) and pins uploads to IPFS; each upload names a product and a role, and the resolver needs `CourtV1` with the `evidence` and `policy` roles, which the library provides. Its SIWE message fields, nonce and login mutations and multipart upload fields are the same as the current hand-rolled client; response handling differs (upload errors parsed as JSON, the result returned as `/ipfs/<cid>`), and sign-in is lazy. A thin wrapper in `web` sequences "sign in, then upload" in one click, wraps in-memory JSON blobs as `File` objects, and shows the per-role size limit Atlas serves instead of today's hardcoded 20 MB. The library keeps the token in per-tab session storage, so a freshly opened tab usually asks for a new signature while a reload of the same tab does not, once the wallet reconnects. That is how every Kleros v2 app behaves and is accepted as a deliberate deviation from the current cross-tab persistence; the same-tab reload guarantee has a Playwright assertion. `@kleros/kleros-app` declares wagmi 2 and viem 2 as peers, which is also why keeping ethers was rejected; it brings `graphql`, `graphql-request` and `jose` with it, the only dependencies added for its sake.
- **TanStack Query** for reads, with a persisted cache that is versioned so a rule change (for instance to content addressing) invalidates every entry cached under the old rule; today's localStorage caches have no version, and the meta-evidence cache has no expiry. **Zod** validates meta-evidence and evidence JSON at the boundary so malformed data degrades a section instead of blanking the page. An error boundary wraps each section.
- **Vitest** with React Testing Library for unit and component tests; **Playwright** for the golden-case suite against the branch deploy.
- **Environment variable names are unchanged.** Vite's `envPrefix` accepts the existing `REACT_APP_*` names. At cutover Netlify needs one new variable, `REACT_APP_WALLETCONNECT_PROJECT_ID`, and `netlify.toml` needs the workspace build command and publish directory. A missing Atlas URI no longer blocks boot (today it throws at module load); the deviations ledger records this.
- The layout is desktop-first and must stay usable on every screen size.
- No Sentry, no analytics, no internationalization.

## Considered options

- **Keep ethers 6 and add a connect modal on top.** Rejected: the shared Atlas client requires wagmi and viem, so this would mean running both stacks and two conventions inside Kleros.
- **RainbowKit instead of AppKit.** Rejected: simpler, but a second wallet convention inside Kleros; Kleros already runs a WalletConnect project for AppKit.
- **Custom components (Tailwind, or the CSS Modules over react-bootstrap that the abandoned `feat/ui-overhaul` restyle branch uses, see ADR 0001) in that branch's v1 purple look.** Rejected: hand-rolling a component library is the work the shared library already did, and the v2 look is where the other Kleros products are.
- **Bridging the Atlas token into localStorage to keep cross-tab sign-in** (seed the tab's storage from localStorage before the provider mounts, mirror writes back). Feasible, rejected: no v2 app does it, and per-tab sessions narrow the token's exposure.

## Consequences

- Upgrading to React 19 waits on two external libraries.
- Replacing archon means the evidence-fetching semantics are now ours to document and test, including the content-addressing rule.

## Dependencies chosen during the build

Recorded when the workspace was scaffolded (2026-10-14). Ranges are what the manifests declare; the lockfile pins the exact versions. Every direct dependency and devDependency is listed once, with the package that declares it in parentheses (root, `core`, `web`); a package declared in more than one place is listed once.

**Node 22 LTS (22.23.2).** Node 20 is end-of-life, and the current majors of the toolchain need a newer Node than the 20.18.1 the repository pinned: Vite 8 needs 20.19 or 22.12, Vitest 5 needs 22.12, jsdom 30 needs 22.22.2. The version is set in `.nvmrc`, `.node-version`, the `volta` and `engines` fields of the root `package.json` and `NODE_VERSION` in `netlify.toml`.

**TypeScript 5.9, not 6 or 7.** `typescript-eslint` 8 declares support for TypeScript below 6.1, and the type-aware lint rules are part of the security gate, so the compiler is held at `~5.9.3` until `typescript-eslint` supports the next major.

**ESLint 9, not 10.** `eslint-plugin-react` 7.37 declares ESLint up to 9.x as its peer.

**Runtime libraries**

| Package | Range | Why |
|---|---|---|
| `viem` (core, web) | `^2.57.6` | Every chain interaction. `@reown/appkit-adapter-wagmi` 1.8 needs 2.55.13 or later; `@kleros/kleros-app` needs 2.24.1 or later. |
| `zod` (core, web) | `^4.6.7` | Boundary validation of untrusted JSON. Version 4 compiles under `strict` and under core's `WebWorker`-only `lib`. |
| `react`, `react-dom` (web) | `18.3.1` | React 18, not 19, as decided above. Pinned exactly. |
| `react-is` (web) | `^18.3.1` | Peer of `@kleros/ui-components-library`. |
| `@kleros/ui-components-library` (web) | `3.9.0` | The Kleros design system. Pinned exactly. |
| `tailwindcss` (web) | `^4.3.3` | Peer of the component library; the styling system. |
| `@tailwindcss/postcss` (web) | `^4.3.3` | Peer of the component library; it is also the Tailwind integration used for the Vite build, so no second Tailwind plugin is added. |
| `tailwindcss-react-aria-components` (web) | `^2.2.0` | The Tailwind plugin that gives the library's `pressed:` and `hovered:` variants their meaning. The library's own stylesheet loads it; a consuming app has to load it too, and should not rely on hoisting to find it. |
| `@kleros/kleros-app` (web) | `3.1.0` | Atlas sign-in and upload client. Pinned exactly. |
| `wagmi` (web) | `^2.19.5` | Wallet hooks. Version 2, not 3, because `@kleros/kleros-app` 3.1 peers `^2.14.15`; 2.19.5 is the oldest 2.x the AppKit adapter accepts. |
| `@wagmi/core` (web) | `^2.22.1` | Peer of the AppKit adapter (2.21.2 or later); declared so the 2.x line is resolved, not 3.x. |
| `@reown/appkit`, `@reown/appkit-adapter-wagmi` (web) | `^1.8.24` | Wallet modal and its wagmi adapter. 1.8.24 accepts wagmi 2. |
| `@tanstack/react-query` (web) | `^5.104.2` | Read cache. Floor set by the persist client's peer. |
| `@tanstack/react-query-persist-client` (web) | `^5.104.2` | Persisted, versioned cache. |
| `@tanstack/query-sync-storage-persister` (web) | — | Not needed; `data/persistence.ts` implements TanStack's `Persister` over `localStorage`. |
| `graphql`, `graphql-request` (web) | `^16.14.2`, `^7.4.0` | Peers of `@kleros/kleros-app`. GraphQL 16, because 17 is outside the peer range. |
| `react-router` (web) | `^7.18.4` | Router, library mode (`react-router` v7 is the single package; there is no separate `-dom`). Version 8 needs React 19. |
| `@dispute-resolver/core` (web) | `workspace:^` | The core package, consumed from source. |
| `react-markdown` (web) | `9.1.0` | Markdown descriptions rendered through React, raw HTML shown as text (A11), with link and image rules through `urlTransform` and element overrides (D-31). The version `@kleros/ui-components-library` already depends on, so no new packages are pulled in. |
| `@fontsource/open-sans` (web) | `^5` | Self-hosted Open Sans, the Kleros v2 typeface; no font CDN (A20). |
| (no `remark-gfm`) | | Today's renderer (`react-markdown` 4 on `remark-parse` 5) parses pipe tables, `~~strikethrough~~`, task items and literal `http(s)://` and `mailto:` links. `remark-gfm` parses more than that (single-tilde strikethrough, `www.` and e-mail literals, footnotes), so a small in-house remark plugin (`safe-content/legacyGfm.ts`) restores exactly today's set instead; a corpus recorded with `react-markdown` 4.2.2 pins it. |
| `@internationalized/date` (web) | `^3.7.0` | Date values for the library's `Datepicker` (D-17); already present through the library. |
| `@reality.eth/reality-eth-lib` (core) | `3.4.34` | The ported Reality.eth pipeline uses its answer encoder (`answerToBytes32`) and its question formatter, the latter only to flag questions that other interfaces render differently (the `divergent` status). Same version as today. |

**Resolution override.** The root `package.json` pins `@wagmi/connectors@>=5.9.9` to `6.2.0`. `@reown/appkit-adapter-wagmi` declares that package as an optional dependency with an open range, which resolves to a release that requires `@wagmi/core` 3; `wagmi` 2.19.5 itself pins 6.2.0. Remove the override when the adapter bounds the range. A second override pins `eslint-plugin-sonarjs`'s own `typescript` dependency to the workspace's `~5.9.3`: the plugin's range (`>=5 <6.1.0`) otherwise resolves a nested TypeScript 6, whose different `TypeFlags` numbering makes `sonarjs/null-dereference`, `function-return-type`, `argument-type` and `different-types-comparison` misfire on ordinary code. A third override moves `ws` 8.18.0, which an older `viem` copy nested under the wallet connectors pins exactly, to 8.21.0 within the same major, because 8.18.0 carries a high-severity denial-of-service advisory; the other vulnerable transitive packages were refreshed within their declared ranges, so `yarn npm audit --all --recursive --severity high` reports nothing (C14).

**Tooling (devDependencies)**

| Package | Range | Why |
|---|---|---|
| `vite` (core, web) | `^8.3.4` | Bundler and dev server. Newest major; builds with `@vitejs/plugin-react` 6 and Tailwind 4 on Node 22. Core lists it as the peer of Vitest. |
| `@vitejs/plugin-react` (web) | `^6.1.2` | React transform; its peer is Vite 8. |
| `vitest` (core, web) | `^5.0.4` | Unit and component tests. |
| `jsdom` (web) | `^30.1.2` | DOM for component tests. |
| `@testing-library/react` (web) | `^16.3.3` | Component tests. |
| `@testing-library/dom` (web) | `^10.4.2` | Peer of `@testing-library/react`. |
| `@testing-library/jest-dom` (web) | `^7.0.1` | DOM matchers. |
| `@testing-library/user-event` (web) | `^14.6.8` | Realistic user input in tests. |
| `@reown/appkit-controllers` (web) | `1.8.24` | Test-only, pinned to the `@reown/appkit` version. The C8 tests stub its `ApiController.fetchProjectConfig` and read `ConnectorController` and `OptionsController` to prove the wagmi configuration never holds an embedded-wallet connector, that AppKit registers its own `AUTH` connector only when the Reown dashboard enables social login or email (K-01), and that the app then fails closed (K-03). |
| `@playwright/test` (web) | `^1.64.0` | Golden-case suite. Browsers are installed on demand (`yarn playwright install chromium`), never by `yarn install`. |
| `@types/react`, `@types/react-dom` (web) | `^18.3.31`, `^18.3.7` | Types for React 18; pinned to 18 because `latest` is 19. |
| `@types/node` (root, web) | `^22.20.5` | Node types for config files and Playwright, matching the Node major. Core does not load them. |
| `typescript` (root, core, web) | `~5.9.3` | See above. |
| `eslint`, `@eslint/js` (root; `eslint` also core, web) | `^9.39.5` | Linter. Declared in each workspace so `yarn lint` finds the binary there. |
| `typescript-eslint` (root) | `^8.71.2` | Type-aware strict rules. |
| `eslint-plugin-react` (root) | `^7.37.5` | React rules, including `react/no-danger`. |
| `eslint-plugin-react-hooks` (root) | `^7.1.1` | Rules of hooks. |
| `eslint-plugin-sonarjs` (root) | `^4.2.2` | The project is analysed by SonarCloud; this catches the same classes of issue locally. |
| `globals` (root) | `^17.13.0` | Global-variable tables for the lint config. |
| `prettier` (root, core, web) | `^3.9.10` | Formatting (`tabWidth` 2, `printWidth` 180, unchanged). The repository had 2.x. |
| `@kleros/kleros`, `@kleros/arbitrable-proxy-contracts`, `@kleros/kleros-interaction`, `IDRv1` and `IDRv2` (aliases of `@kleros/dispute-resolver-interface-contract` 1.0.2 and 8.0.0) (core) | `0.1.5`, `5.0.3`, `0.9.3`, `1.0.2`, `8.0.0` | Test-only. Core embeds minimal `as const` ABIs; the tests check those ABIs and the probe selectors against the published contract artifacts, so a transcription typo cannot survive (registry schema §1). Never imported by production code. |
| `tsx` (core) | `^4` | Runs the known-questions generator (`REALITY_OPS.md`, checklist A6) directly from core's TypeScript sources, whose extensionless imports Node's own type stripping cannot resolve. Operator tooling; never part of the bundle. |
| `@reality.eth/contracts` (core) | `3.2.31` | Test-only. The Reality.eth v3.0 and v3.2 ABIs the ABI tests compare the embedded lookup entries against; already present through `@reality.eth/reality-eth-lib`, declared so the tests do not depend on hoisting. |
