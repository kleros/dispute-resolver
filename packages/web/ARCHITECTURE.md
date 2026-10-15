# `@dispute-resolver/web` architecture

The shared contract of `packages/web` for the phase 3 foundation builders and the phase 4 screen builders. The behavior contract is `docs/parity/` (frozen 2026-10-14) and `docs/adr/`; core's contract is `packages/core/MODULES.md` and the types exported by `@dispute-resolver/core`. References: `§n` alone is a section of this document; `spec §n` is `02-behavioral-spec.md`; `A`/`B`/`C` rows are `03-security-checklist.md`; `D-nn` entries are `05-deviations-ledger.md`; `04 §1` is the parity snapshot; `P-nn` are proposals awaiting the maintainer (`docs/ledger-proposals.md`).

Read the whole of §1 before writing a file. The `types.ts` of each directory is already written; it is the contract between builders. Change a type you do not own only through the orchestrator.

## Rules for every builder

- **Ownership is by directory** (§1). Write only inside your directories and the shared files assigned to you. A name you need from another directory that is not listed in its `types.ts` or in this document is a request to the orchestrator, not a local copy.
- **Imports across directories go through the directory's `index.ts`** (`import { … } from "../data"`), never into its files, and follow the dependency table of §1.3. Core is imported only from `@dispute-resolver/core`.
- **No `any`.** Untrusted JSON is `unknown` until a Zod schema or a core parser accepts it.
- **No test-only code in `src/` outside `src/test/` and `*.test.ts(x)`** (C9). No fixture modes, mock connectors, mock providers, `window._setup*` hooks or flags that swap in fake data. The v2 web app's `createMockAdapter` and its `window._setupMockAccount` hook are not copied in any form. Test doubles live in test files, in `src/test/`, and in the Playwright harness.
- **No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function`** anywhere, with one exception: `src/runner/page/evaluate.ts` (ADR 0004, §7).
- **Reads go through core's read clients** (`createReadClients(env)`), never through wagmi (`usePublicClient`, `useReadContract`, `useBalance`, `useBlockNumber`, `getPublicClient`, `readContract` from wagmi). Wagmi is for connecting, switching chains and signing only (A13; see §6.4 for why wagmi's transports are not a read path).
- **UI code never inspects a contract address.** It reads `FamilyDetection`, `Capabilities`, `AppealPanel` and the registry helpers core exports.
- **Every external link goes through `ExternalLink`** (§9.1); every iframe is `EvidenceDisplayFrame` (§9.3) or the runner host (§7). Raw `<a href>` and `<iframe>` JSX appear only inside `safe-content/` (router links use react-router's `Link`).
- **Every failure is shown.** A bad dispute degrades one section behind a `SectionBoundary` (§5.7); a write outcome is always reported (§6).
- **Tests** are named after the row or entry they prove (`it("B3: refuses to sign when the wallet is on another chain")`). Unit tests never touch the network.
- Copy wording, layout and colors are free (ledger preamble). State machines, data shown, actions available, links and their targets, and error behavior follow the spec and the ledger.

---

## 1. Directory layout and ownership

### 1.1 Directories

```
packages/web/
├── ARCHITECTURE.md                this document (orchestrator)
├── index.html                     shell
├── vite.config.ts                 shell (wires the plugins exported by runner and routing)
├── postcss.config.mjs             shell
├── playwright.config.ts           verification (phase 5)
├── tsconfig.json, package.json    orchestrator (dependencies, scripts)
├── e2e/                           verification (phase 5), except e2e/runner/ (runner)
├── scripts/check-bundle.mjs       orchestrator (the production bundle check of C9, A20, C3; `yarn check:bundle` after `yarn build`)
├── public/
│   ├── favicon.ico                shell
│   ├── _headers                   routing (§10)
│   └── __runner/index.html        runner (§7)
└── src/
    ├── main.tsx                   shell
    ├── App.tsx                    shell
    ├── AppRoutes.tsx              routing
    ├── index.css                  shell
    ├── theme.ts, theme.test.ts    shell (may move them into shell/)
    ├── App.test.tsx               shell
    ├── core.test.ts               data (workspace wiring test)
    ├── env/                       shell      the one reader of import.meta.env (§4)
    ├── parity/                    shell      the `TestId` union of the parity hooks (§12), importable by every directory
    ├── ui/                        shell      design-system primitives and section states (§11)
    ├── shell/                     shell      page frame: header, footer, root boundary, toasts, fonts
    ├── routing/                   routing    paths, route guards, redirects, chain following, error screens, headers
    ├── wallet/                    wallet     wagmi + AppKit, connect UI, chain guard, write flow, smart-wallet warning
    ├── data/                      data       QueryClient, persister, core dependencies, one hook per core read
    ├── runner/                    runner     script runner host, runner page bootstrap, its Vite plugin
    ├── atlas/                     atlas      sign-in-then-upload wrapper over @kleros/kleros-app, upload field
    ├── safe-content/              safe-content  ExternalLink, SafeMarkdown, EvidenceDisplayFrame, Attachment, court link
    ├── pages/
    │   ├── ongoing/               ongoing
    │   ├── create/                create
    │   ├── case/                  case-page      container, search box, page states, compatibility banner, accordion, question panel
    │   ├── case-summary/          case-summary   dispute summary, evidence display, info row, timeline, decision, Reality notice
    │   ├── case-appeal/           case-appeal    appeal panel, crowdfunding cards, composer, free input, escrow, withdraw
    │   └── case-evidence/         case-evidence  evidence list, submit control, submit modal
    └── test/                      shell (setup.ts); each builder may add src/test/<builder>/ for shared test doubles
```

Each directory has an `index.ts` (its public surface) and a `types.ts` (the types that cross directories, written now); the `pages/*` directories have only an `index.ts`, since their sections take `data`'s `CaseSectionProps`. Builders add value exports (components, hooks, functions) to their own `index.ts`; the names are fixed by this document.

### 1.2 Shared files and their single owner

| File                         | Owner        | What the others may expect                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`               | shell        | mounts `<App/>` in `StrictMode`, imports `index.css`, applies the color scheme before first paint                                                                                                                                                                                                                                                                                                                                                             |
| `src/App.tsx`                | shell        | the provider tree of §2.1, rendering `<AppRoutes/>`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/AppRoutes.tsx`          | routing      | the route table of §3 from `createAppRoutes`, with shell's `PageFrame` and the pages' named components (`OngoingPage`, `CreatePage`, `CasePage`), each loaded in its own chunk on first render (`React.lazy` behind a `Suspense` whose fallback is ui's `SectionSkeleton`, inside the frame)                                                                                                                                                                  |
| `src/index.css`              | shell        | Tailwind, the library theme, fonts, base typography (§11)                                                                                                                                                                                                                                                                                                                                                                                                     |
| `vite.config.ts`             | shell        | adds `runnerBootstrapPlugin()` from `src/runner/build` and `headersPlugin()` from `src/routing/headers` (both wired; neither directory's `index.ts` re-exports its plugin, so this Node-side build code never enters the app's module graph), plus `resolve.mainFields` set to Vite's client default so Vitest resolves `@kleros/kleros-app` (its `package.json` has only `module`; `vite build` is unchanged); nothing else changes without the orchestrator |
| `index.html`                 | shell        | no external `<script>` or stylesheet (A20)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `public/_headers`            | routing      | §10                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `public/__runner/index.html` | runner       | §7.2                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `e2e/runner/`                | runner       | the Playwright guard tests of C4, B1, C7                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `eslint.config.mjs` (root)   | orchestrator | the rules requested in §1.4                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 1.3 Dependency direction

A directory imports only from those listed; every directory may also import `parity`. `AppRoutes.tsx` and `App.tsx` sit on top.

| Directory                                                        | May import                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `env`, `parity`                                                  | core                                                                                      |
| `safe-content`                                                   | core, `env`, `parity`, the UI library                                                     |
| `ui`                                                             | core, the UI library, `safe-content`                                                      |
| `runner`                                                         | core, `env`                                                                               |
| `data`                                                           | core, `env`, `runner`                                                                     |
| `wallet`                                                         | core, `env`, `data`, `ui`, `safe-content`                                                 |
| `atlas`                                                          | core, `env`, `wallet`, `ui`                                                               |
| `routing`                                                        | core, `env`, `wallet`, `ui`                                                               |
| `shell`                                                          | core, `env`, `ui`, `safe-content`, `routing`, `wallet`                                    |
| `pages/case-summary`, `pages/case-appeal`, `pages/case-evidence` | core, `env`, `ui`, `safe-content`, `data`, `wallet`, `atlas`, `routing`                   |
| `pages/case`                                                     | the above plus the three `case-*` directories                                             |
| `pages/ongoing`, `pages/create`                                  | core, `env`, `ui`, `safe-content`, `data`, `wallet`, `atlas`, `routing`, `shell` (toasts) |
| `AppRoutes.tsx`                                                  | `routing`, `shell`, `ui` (the loading fallback), `pages/*`                                |
| `App.tsx`                                                        | `env`, `data`, `wallet`, `atlas`, `shell`, `AppRoutes.tsx`                                |

The table binds the files that ship. Tests (`*.test.ts(x)`) and the doubles under `src/test/` may import any directory's `index.ts`: `src/test/shell/renderWithProviders.tsx` composes the data, wallet, atlas and routing doubles, and its test sits in `shell/`.

`routing` never imports `shell` and `shell` never imports `AppRoutes.tsx`, which is why the route table is a separate file: the header needs routing's paths and hooks, and the route table needs the header.

### 1.4 Lint rules requested from the orchestrator

Each enforces a rule of this document; the orchestrator adds them to the root `eslint.config.mjs`.

1. `import.meta.env` only in `packages/web/src/env/env.ts` (`no-restricted-syntax` on `MemberExpression[object.type='MetaProperty'][property.name='env']`, with an override for that file).
2. `no-eval`, `no-implied-eval`, `no-new-func` and `sonarjs/code-eval` turned off for exactly `packages/web/src/runner/page/evaluate.ts`, with the ADR 0004 justification in the config comment.
3. JSX `<a>` with an `href` and JSX `<iframe>` only under `packages/web/src/safe-content/**`.
4. `no-restricted-imports`: `FileViewer` from `@kleros/ui-components-library` (A17); `react-markdown` outside `safe-content/`; `@kleros/kleros-app` outside `atlas/`; `@reown/*` outside `wallet/`; `wagmi`'s read hooks (`usePublicClient`, `useReadContract`, `useReadContracts`, `useBalance`, `useBlockNumber`, `useClient`) everywhere in web; deep imports into another directory (`../<dir>/*` other than its index).
5. No import of `src/test/**` from any file under `packages/web/src` that is not a test (`*.test.ts(x)`) or itself under `src/test/` (C9; the bundle grep of phase 5 is the other guard).

### 1.5 Test doubles shipped by the foundation builders

Screen builders render pages in component tests through these, so nobody writes a second harness. Each lives under `src/test/<dir>/` (lint rule 5 keeps them out of the bundle) and is exported from `src/test/<dir>/index.ts`:

| Builder      | Ships                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| data         | `createTestDeps(options)` (a `CoreDeps` over a custom-transport read client answering `options.rpc`, a stub fetcher answering `options.responses`, a fake `ScriptRunner` answering `options.runScript`; any `CoreDeps` field can be overridden), `TestDataProvider` (`{ deps?, client?, seed? }`: fresh QueryClient from `createTestQueryClient()`, no persister, retries off), `sectionLoading()` / `sectionReady(value)` / `sectionUnavailable(code, message?)` builders of `SectionData`, `createMemoryStorage()`, and dispute fixtures (`testDispute`, `testBinding`, `testDetails`, `testFamily`, `testCourt`, `testFoundLookup`, `testOkMetaEvidence`, `TEST_ARBITRATOR`, `TEST_ARBITRABLE`, `TEST_META_EVIDENCE_URI`); besides the index, `src/test/data/mockCoreReads.ts` exports `mockCoreReads(importOriginal)`, a `vi.mock` factory for `@dispute-resolver/core` that replaces every network read with `vi.fn()` and keeps the pure functions, imported directly inside the factory (a factory must not load the module it mocks, which the index does) |
| wallet       | `createTestWallet(options)` (a wagmi config whose only connector is wagmi's `mock` connector, created inside the test file's import graph only, with a fake AppKit modal in `appkit` mode) rendered by `TestWalletProvider({ wallet })` or `walletWrapper`, `fakeWriteController(script, options)` for driving every `WriteStatus`, write fixtures (`testWriteBuild`, `testReceipt`, `testReplacementReceipt`, `TEST_TX_HASH`, `TEST_REPLACEMENT_TX_HASH`), `TEST_WALLET_ACCOUNT`, `TEST_WALLET_ADDRESS`, `UNCONFIGURED_CHAIN_ID`, `installOfflineAppKitEnvironment()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| atlas        | `fakeUploader(overrides)`, an `AtlasUploader` for `TestAtlasProvider` or `atlasWrapper`; `installFakeAtlasServer(options)` (the library's HTTP and GraphQL answered locally), `testJwt` / `sessionJwt`, `settle()`, and the constants `TEST_ATLAS_URI`, `TEST_SERVER_ROLES`, `TEST_ROLE_LIMITS`, `TEST_UPLOAD_CID`, `TEST_UPLOAD_PATH`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| routing      | `renderAtPath(ui, path, options)` (a `MemoryRouter` with `AppRoutes`-equivalent chain layout), `renderInRouter`, `TestFrame`, `testPageChain(chainId)`, and the Netlify `_headers` parser of §10.4 (`parseNetlifyHeaders`, `matchingRules`, `matchesPattern`, `headerValues`, `policies`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| shell        | `renderWithProviders(ui, { path, deps, wallet, uploader, frame })` composing the four above (`frame`: routing's `TestFrame` or the app's `PageFrame`), plus `setup.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| runner       | `createFakeRunnerEnvironment()` and `runRequest` (a fake `RunnerEnvironment` for `bootstrapRunner`), `createFakeRunnerDocument()` (fake frames for the host), `flushMicrotasks`, `settleMacrotasks`, `SAMPLE_PARAMS`, `SAMPLE_REDIRECTS`, `FAKE_APP_ORIGIN`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| safe-content | `MARKDOWN_CORPUS` (the §9.2 corpus with today's renderings), `testMetaEvidence`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 2. Provider tree and boot

### 2.1 Provider tree (`App.tsx`, shell)

```
<StrictMode>                                   main.tsx
  <RootErrorBoundary>                          shell: last resort, keeps a minimal frame with a reload button
    <DataProvider config={APP_CONFIG}>         data: QueryClient + persister + CoreDeps (§5)
      <WalletProvider config={APP_CONFIG}>     wallet: WagmiProvider + the AppKit setup or the unconfigured read-only mode (§2.3)
        <AtlasGate config={APP_CONFIG}>        atlas: AtlasProvider only when the URI is configured (§8)
          <BrowserRouter>
            <ToastProvider>                    shell
              <AppRoutes/>                     routing (§3)
```

`AppProviders` (shell) renders this tree from `RootErrorBoundary` to `ToastProvider`. Since `shell` may not import `data` or `atlas` (§1.3), it takes them as props: `<AppProviders config={APP_CONFIG} dataProvider={DataProvider} atlasGate={AtlasGate}><AppRoutes/></AppProviders>`, which is what `App.tsx` renders.

Order is forced: wagmi needs a TanStack `QueryClientProvider` above it; `@kleros/kleros-app` needs both the QueryClient (it registers its own `["UserSettings"]` and `["RoleRestrictions"]` queries in ours, §5.4) and the wagmi config; routing and every page need all three.

### 2.2 Boot sequence

1. `main.tsx` applies the color scheme (`theme.ts`) and renders. `APP_CONFIG` is computed once at module load in `env/` (§4); nothing throws on a missing variable.
2. `DataProvider` creates the QueryClient, restores the persisted cache through the validating deserializer (§5.4), creates the read clients from `env` (`createReadClients`) and the iframe script runner (§7). No network request yet.
3. `WalletProvider` creates the wallet setup once per configuration and, when a WalletConnect project ID is configured, loads AppKit from its own chunk after the first render (§2.3). Wagmi reconnects a previously authorized connector silently (`reconnectOnMount`); it never calls `eth_requestAccounts`. The app is read-only until the user presses Connect (D-06).
4. `AtlasGate` mounts `AtlasProvider` only when `APP_CONFIG.atlasUri` is set; the library then issues its one unauthenticated `roles(CourtV1)` request (D-20). Without the URI nothing is requested and uploads are shown as unavailable (D-21).
5. Routing resolves the page chain from the URL (§3). Pages start their queries through the configured RPC of that chain. A connected wallet's chain is compared with the page chain only for the one-time switch request of §3.6 and for the write guard (§6).

Nothing prompts at load: no connect prompt, no signature (A15: no SIWE before the first upload action, D-52). The only wallet request that can appear without a click is the switch request of D-55 when an already-authorized wallet reconnects on another chain (§3.6).

### 2.3 Wallet setup (wallet)

A `WalletSetup` is the wagmi `Config`, the mode and, in `appkit` mode, the `WalletModal`. `WalletProvider` reads it from `walletSetupStoreFor(config)` (`setup.ts`), one store per `AppConfig` (AppKit must be created once per page), and renders `WalletSetupProvider({ setup, pending, pendingReconnect, reconnectOnMount })`, which the test wallet also uses. Without a project ID the store holds `createReadOnlySetup(config)` from the start. With one, AppKit lives in its own chunk (`appKitSetup.ts`, loaded only through a dynamic import, so the first paint never waits for AppKit or WalletConnect): the store starts with a `pending` stand-in in `appkit` mode, a wagmi config with no connector and no storage plus a `WalletModal` that loads AppKit before opening; `WalletProvider` starts the load once mounted, and `createAppKitSetup(config, projectId)` then replaces the stand-in without remounting the tree, wagmi reconnecting on the new config. When the store is created it reads wagmi's persisted store (`wagmi.store` in `localStorage`, the AppKit config's storage) once: `pendingReconnect` is `true` when it holds a current connection. While `pending` with `pendingReconnect`, `useWallet()` reports `connecting`, so routing waits for a returning wallet as it does for wagmi's reconnect (§3.1); without a stored connection (a first visit, a wallet that disconnected, unreadable storage) it reports `disconnected` from the first render, so `/` and the chain-less redirects never wait for AppKit. A wallet that reconnects without a stored connection (its site permission outlived cleared storage) is then handled as a later connection (§3.6). A chunk that fails to load leaves the stand-in, no longer pending: the app is read-only and Connect retries the load (D-06).

**With `REACT_APP_WALLETCONNECT_PROJECT_ID` set (`mode: "appkit"`):**

- `new WagmiAdapter({ networks, projectId, transports })` with `networks` = the 14 chains of core's `CHAINS` mapped to viem chain objects (`viem/chains`, falling back to `defineChain` from the core table), `ssr: false`.
- `createAppKit({ adapters: [wagmiAdapter], networks, projectId, metadata, defaultNetwork: mainnet, allowUnsupportedChain: true, features: { analytics: false, email: false, socials: [], swaps: false, onramp: false }, themeMode, themeVariables })` (C8). `socials` is an empty array, never `false` (ADR 0002). No `connectors` option is passed, so the adapter's defaults apply: EIP-6963 injected discovery, the plain injected connector, WalletConnect, Coinbase (ADR 0002). No Safe in-app connector is added; the adapter itself only activates its Safe connector inside Safe's iframe, which C1 forbids.
- `allowUnsupportedChain: true` so AppKit does not take over the screen when the wallet is on a chain outside the 14; the app shows its own unsupported-network state instead (D-55, §3.5).
- **C8 tests** (AppKit's controllers are module singletons, so each run is its own file): build the setup in jsdom with a fake project ID and `ApiController.fetchProjectConfig` stubbed, await AppKit's ready promise (the adapter adds connectors in `syncConnectors()` during init, and AppKit adds its own embedded-wallet connector after the remote fetch, so asserting right after `createAppKit` proves nothing), then check the wagmi config, AppKit's connector registry (`ConnectorController`) and `OptionsController.state.features`. Three runs, the AppKit version pinned in the test names (a version bump re-runs them):
  - remote config fetch failing (`wallet/config.test.ts`): no connector with id or type `"AUTH"` in the wagmi config or in AppKit's registry; the features object is the C8 one;
  - remote config enabling `social_login` (`wallet/config.remoteSocial.test.tsx`): the wagmi config still has no `AUTH` connector, but AppKit's registry gains one (K-01), and the K-03 guard holds (below);
  - remote config returning `social_login`, `swap` and `onramp` disabled (`wallet/config.remoteSocialDisabled.test.ts`): no `AUTH` connector anywhere. This is the mitigation K-01 relies on.
- **Finding for the operator checklist (K-01).** In AppKit 1.8.24, `ConfigUtil.fetchRemoteFeatures` replaces the local `features` with the Reown dashboard's project settings whenever that fetch succeeds (`email`, `socials`, `swaps`, `onramp`), and only warns that the local configuration was ignored. The wagmi config never holds an embedded-wallet connector, but AppKit's own connector registry gains its `AUTH` connector whenever the dashboard enables social login or email (`AppKit.createAuthProvider` runs after the remote fetch), and the modal's views and the swap/onramp entry points follow the dashboard. The embedded wallet loads a `secure.walletconnect.org` iframe, so the dashboard settings are a security gate, not a cosmetic one: the Reown project behind `REACT_APP_WALLETCONNECT_PROJECT_ID` must have social login, email, swaps and onramp disabled. This belongs next to C8 in the deploy requirements (checklist §D).
- **Fail closed (K-03).** `WalletModal.hasEmbeddedWallet()` awaits AppKit's ready promise and reports whether `appKit.getConnectors()` holds a connector with id or type `"AUTH"` (the public AppKit API; `@reown/appkit-controllers` is a test-only dependency). When it does, `openConnect` rejects without opening anything, so no caller (WalletControl, `WriteStatusNotice`'s Connect offer, `useWrite().connect`, `AtlasFileField`) and no click made before AppKit is ready can open the Connect view. `useConnectWallet()` then reports `available: false` with `unavailableReason: "misconfigured"`, and every Connect control is disabled with the text that wallet connection is misconfigured on this deployment. The app stays read-only. Tests: `wallet/config.remoteSocial.test.tsx` (real AppKit with social login enabled: `openConnect` rejects, the modal stays closed, WalletControl's Connect is disabled with the message) and `wallet/WalletControl.test.tsx`, `wallet/WriteStatusNotice.test.tsx` with the test wallet's `embeddedWallet` option.

**Without the project ID (`mode: "unconfigured"`)** (orchestrator decision: no second connect UI):

- AppKit is not created (`createAppKit` without a project ID opens an error alert and stops initializing), and the wagmi config is `createConfig({ chains, transports, connectors: [] })` so the hooks still work.
- The app runs read-only. `WalletControl` shows a disabled Connect control with the text that wallet connection is not configured on this deployment. A missing project ID is an operator error listed with the deploy requirements; it must never blank the app (the spirit of D-21).

**Transports.** Wagmi needs one transport per chain. It is `http(readRpcUrl)` from core's `resolveReadRpcUrl(chain, env)` when configured, and for an unconfigured chain a `custom` transport whose every request rejects with "no RPC configured for chain N" (D-56: never a public default). AppKit wraps a given transport in `fallback([transport, reownRpc])` for chains Reown supports, which is why wagmi is never a read path (§6.4).

**Connect.** `useConnectWallet()` returns `{ available, unavailableReason, open(chainId?) }`: `unavailableReason` is `"unconfigured"` without a project ID (K-02), `"misconfigured"` once AppKit is ready with an embedded-wallet connector registered (K-03), and `null` otherwise (`available` is `unavailableReason === null`). `open` calls the modal's `openConnect(chainId)`: it refuses when AppKit holds an embedded-wallet connector (K-03), otherwise it first sets AppKit's active network to `chainId`, the page chain (so a WalletConnect session starts on the page chain), then `appKit.open({ view: "Connect" })`; while Connect is unavailable it is never called because the controls are disabled. Rejecting any prompt returns to read-only with no error state (D-06).

**Exports.** Besides the components and hooks named in §6 and §11.2, `wallet/index.ts` exports `isUserRejection(error)` (viem's `UserRejectedRequestError` or EIP-1193 code 4001 anywhere in the cause chain), which atlas uses for a declined sign-in signature, and the `ConnectUnavailableReason` type.

---

## 3. Routing (routing)

### 3.1 URL contract (ADR 0001, spec §1.2, D-01, D-09)

| Path                                                                                                                                      | Result                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                                       | redirect (replace) to `/{default}/ongoing`                                                                                               |
| `/:chainId`, `/:chainId/`, `/:chainId/disputes`, `/:chainId/disputes/`                                                                    | redirect to `/:chainId/ongoing` (D-01)                                                                                                   |
| `/:chainId/ongoing[/]`                                                                                                                    | Ongoing page                                                                                                                             |
| `/:chainId/create[/]`                                                                                                                     | Create page (reachable by URL even when the header hides its link, spec §4.1)                                                            |
| `/:chainId/cases[/]`                                                                                                                      | Case page with the search box and no dispute loaded (D-09)                                                                               |
| `/:chainId/cases/:id[/]`                                                                                                                  | Case page for `:id`                                                                                                                      |
| `/:chainId/interact/:id/*`                                                                                                                | redirect to `/:chainId/cases/:id` (prefix match, spec §1.2) when `:id` parses; otherwise the case page's not-found state in place (P-11) |
| `/ongoing`, `/create`, `/cases`, `/cases/:id`, `/interact/:id/*`, `/disputes` (chain-less legacy, first segment is one of the page names) | redirect to the same path under `{default}` (D-01)                                                                                       |
| `/:chainId/…` where `:chainId` is not a configured chain                                                                                  | Unsupported-network screen (§3.5)                                                                                                        |
| anything else under a configured chain                                                                                                    | 404 inside the page frame (spec §2.6)                                                                                                    |

- `{default}` is the connected wallet's chain when it is one of the 14 configured chains, otherwise `DEFAULT_CHAIN_ID` (1). The redirect waits until wagmi's reconnect has settled (`status` is not `reconnecting`), so a returning user lands on their wallet's chain.
- `:chainId` is parsed only with core's `parseChainId` (A19, spec §1.3): `"01"`, `"1.0"`, `" 1"` are not chain 1. A first segment that is not a page name and does not parse is treated as an unconfigured chain, as today (any first segment was a chain).
- `:id` is parsed only with core's `parseDisputeId` (A19). On the case page an unparseable ID shows the not-found state with the search box and makes no read. On a legacy interact link an unparseable ID is not redirected (P-11): routing's `DisputeNotFoundScreen` renders, inside the page frame and at the `/interact/` URL, the case page's not-found copy "Dispute with ID {id} does not exist on this network." (the raw segment rendered as React text only, never put in a URL or attribute) and a "View Ongoing Disputes" link to `paths.ongoing(chainId)`; nothing is read and no target is built from the raw segment. Today's redirect to `/:chainId/cases/:id` showed the same screen; only the URL differs.
- Trailing slashes match (react-router matches them by default); header links are written without them.
- `APP_ROUTE_PATTERNS` (a `readonly AppRoutePattern[]` in `routing/`) lists the patterns of C1 and is the single source for the headers test (§10.4) and for the route-table test that every pattern is served by the app (`routing/createAppRoutes.test.tsx`); the route table itself writes its paths literally.

Router: react-router 7, declarative mode (`BrowserRouter` + `Routes`); `MemoryRouter` in tests.

### 3.2 Page chain and wallet chain

- **The page chain is the URL's chain.** `usePageChain(): PageChain` (inside the `/:chainId` layout route) returns the parsed chain, its `ChainConfig` and `ChainCapabilities`. Every read uses the page chain's read client. Pages never read the wallet's chain for data.
- **The wallet chain is only an input** to the write guard (§6) and to chain following (§3.6).
- `useResolvedChain(): ResolvedChain` serves the header and footer on every screen, including the 404 and unsupported-network screens (D-45): the page chain when the URL names a configured chain; otherwise the wallet chain when connected and configured; otherwise chain 1. Header links are always built from it, never from a raw route parameter.

### 3.3 Path builders (A19)

`paths.ongoing(chainId)`, `paths.create(chainId)`, `paths.cases(chainId)`, `paths.case(chainId, disputeId: bigint)`, `paths.chainRoot(chainId)` take a validated `ChainId` and a `bigint` and return strings; no builder accepts a raw string. `replaceChainSegment(pathname, chainId)` implements today's `syncUrlWithChain` rule (spec §1.3): replace an all-digit first segment, otherwise insert the chain as the first segment.

### 3.4 Internal navigation

Header links, Ongoing cards, the not-found screen's "View Ongoing Disputes" and the post-create navigation use react-router (`Link`, `navigate`). Targets are unchanged from spec §1.4; only the mechanism changes (no full page load), which the ledger preamble does not count as a deviation (links and targets are equal). Ongoing cards stay real anchors (`Link` renders `<a href>`), so open-in-new-tab works.

### 3.5 Unsupported network and 404 (spec §2.5, spec §2.6, D-45)

- `UnsupportedNetworkScreen` renders inside `PageFrame` with the heading "Unsupported Network {segment}" (text, escaped by React), the explanation, and the 14 chains as `NAME (id)` in ascending order. Each entry is a button that asks the wallet to switch (wallet's `useNetworkSwitch()`, over wagmi `switchChain`); the app follows the new chain (§3.6). As proposed in P-03, a failed, rejected or impossible switch (no wallet connected) shows an inline message instead of only logging, and wagmi's built-in `wallet_addEthereumChain` fallback for a chain the wallet does not know is kept (today: no fallback, spec §2.5). The entries are not navigation links: today they never navigate, and a read-only user changes chain through the URL, as today.
- `NotFoundScreen` (spec §2.6): "404", "Something went wrong in Athens!", the illustration, inside `PageFrame` with header links from `useResolvedChain()`.

### 3.6 Chain following without a reload (D-55, spec §1.3, spec §8.3, spec §8.4)

`useChainFollowing()` runs once in the layout route:

- **Wallet chain changes while connected** (the previous and the new connected chain are both known and differ): navigate with `replace` to `replaceChainSegment(location.pathname, newChainId)`, keeping the rest of the path and the search. A configured chain renders the same page on the new chain (the Ongoing list refetches because its keys include the chain; the Create page remounts because its form is keyed by chain, spec §4.1; the case page loads the same ID on the new chain). An unconfigured chain renders the unsupported-network screen (§3.5). No `window.location.reload()` anywhere (D-55).
- **Load-time mismatch**: once wagmi's reconnect settles at load, if a wallet is connected on a chain other than a configured page chain, request `switchChain(pageChain)` once. Declining leaves reads on the URL chain; writes refuse until the chains match (D-48).
- **First connect**: right after the user connects, the same one-time switch request is made when the wallet's chain differs from the page chain (the on-demand equivalent of today's load-time request, which ran when the injected wallet was always connected). Connecting itself never navigates.
- The initial `undefined → chain` transition of a reconnect is not a "change". A successful switch requested by the app makes the wallet chain equal the page chain, so no navigation follows.

### 3.7 Exports

`routing/index.ts` (values added by the builder): `APP_ROUTE_PATTERNS`, `paths`, `replaceChainSegment`, `usePageChain`, `useResolvedChain`, `useChainFollowing`, `ChainLayout` (the `/:chainId` layout route element), `RedirectToOngoing`, `ChainlessRedirect`, `UnsupportedNetworkScreen`, `NotFoundScreen`, `createAppRoutes({ PageFrame, OngoingPage, CreatePage, CasePage })` (returns the `AppRoutes` component of §3.1; `AppRoutes.tsx` calls it with shell's frame and the pages, so routing imports neither). `headersPlugin` is not in the index: `vite.config.ts` imports it from `routing/headers/`, so it never enters the app's module graph. Types: `routing/types.ts`.

---

## 4. Env (shell)

`src/env/env.ts` is the only file that reads `import.meta.env` (lint rule 1 of §1.4):

```ts
// Vite's envPrefix (vite.config.ts) lets only these through to the bundle; the filter keeps the type honest as well.
const ENV_PREFIX = "REACT_APP_";

// The REACT_APP_* string entries of a raw environment object, frozen; exported for tests.
export function readEnv(source: Readonly<Record<string, unknown>>): Env {
  const entries = Object.entries(source).filter((entry): entry is [string, string] => entry[0].startsWith(ENV_PREFIX) && typeof entry[1] === "string");
  return Object.freeze(Object.fromEntries(entries));
}

// The one reader of import.meta.env.
export const ENV: Env = readEnv(import.meta.env);
```

`src/env/config.ts` derives `APP_CONFIG: AppConfig` from `ENV` and `window.location` once:

| Field                    | Rule                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`                    | `ENV`, passed to every core call that takes an `Env`                                                                                                                    |
| `walletConnectProjectId` | `REACT_APP_WALLETCONNECT_PROJECT_ID` trimmed; empty → `null` (§2.3)                                                                                                     |
| `atlasUri`               | `REACT_APP_ATLAS_URI` trimmed, accepted only when it parses as an `https:` URL without credentials, query or fragment (trailing slash removed); otherwise `null` (D-21) |
| `gateway`                | `resolveGateway(ENV)` (core)                                                                                                                                            |
| `selfHosts`              | `{ appHost: location.host, canonicalHosts: REGISTRY.canonicalHosts }` (D-28)                                                                                            |
| `appOrigin`              | `location.origin` (C5)                                                                                                                                                  |

`buildAppConfig(env, location)` is exported as a pure function for tests; `APP_CONFIG` is its result for the real environment. Nothing in web reads an `REACT_APP_*` key directly except `config.ts`; RPC variables are read only by core through `env`. Values from `.env` are never logged.

---

## 5. Data layer (data)

### 5.1 Core dependencies

`DataProvider` builds one QueryClient (`createQueryClient()`) and one `CoreDeps` object (`createCoreDeps(config, { document, fetch, storage })` in `data/coreDeps.ts`, internal to `data/`) and exposes the deps through `CoreDepsProvider` to `useCoreDeps()`; `createQueryClient` and `CoreDepsProvider` are exported for the test doubles:

| Field                 | Value                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`                 | `APP_CONFIG.env`                                                                                                                                                                                                                                                                      |
| `getReadClient`       | `createReadClients(env)` (core; `undefined` for unknown or unconfigured chains, D-18, D-56)                                                                                                                                                                                           |
| `fetcher`             | `createFetcher` over `window.fetch` bound, wrapped so it never sends credentials (`credentials: "omit"`)                                                                                                                                                                              |
| `runner`              | `createIframeScriptRunner(...)` (§7.4)                                                                                                                                                                                                                                                |
| `familyCache`         | `createFamilyCache()` (core; in memory, never persisted, C11)                                                                                                                                                                                                                         |
| `realityCache`        | `createRealityQuestionCache(storage)` over `window.localStorage`, `undefined` when the browser refuses it (data; today's key `@@kleros/court/reality-question/v1/{chain}/{proxy}/{disputeId}`, values returned as `unknown` and validated by core, every storage access in try/catch) |
| `gateway`, `registry` | `APP_CONFIG.gateway`, core's `REGISTRY`                                                                                                                                                                                                                                               |
| `waitForReceipt`      | `createReceiptWaiter(env)` (`data/receipts.ts`): `(chainId, hash) => Promise<WriteReceipt>` over a viem public client built from the same `resolveReadRpcUrl` result (A13; §6.4)                                                                                                      |

### 5.2 Query keys

Keys are arrays of strings and numbers only: TanStack hashes keys with `JSON.stringify`, which throws on `bigint`, so dispute IDs and rounds are decimal strings. Every key starts with `"dr"`. `session` is the context's `evidenceGroupId` (a governor's session, D-47) as a decimal string, `"none"` while the Dispute event is unread, so funding and withdraw reads run again once that event recovers. `queryKeys` (data) is the only constructor:

| Key                                                                              | Hook                   |
| -------------------------------------------------------------------------------- | ---------------------- |
| `["dr", "courts", chainId]`                                                      | `useCourts`            |
| `["dr", "ongoing", chainId, courtsState]` (`courtsState` = `"ok"` or `"none"`)   | `useOngoingList`       |
| `["dr", "lookup", chainId, disputeId]`                                           | `useDisputeLookup`     |
| `["dr", "family", chainId, arbitrable]`                                          | `useFamily`            |
| `["dr", "metaEvidence", chainId, disputeId, arbitrable]`                         | `useMetaEvidence`      |
| `["dr", "disputeEvent", chainId, disputeId, arbitrable]`                         | `useDisputeEvent`      |
| `["dr", "evidence", chainId, disputeId, arbitrable, evidenceGroupId]`            | `useEvidence`          |
| `["dr", "details", chainId, disputeId, family.writeFamily, disputeEventBlock]`   | `useDisputeDetails`    |
| `["dr", "multipliers", chainId, arbitrable]`                                     | `useMultipliers`       |
| `["dr", "funding", chainId, disputeId, round, fromBlock, session]`               | `useRoundFunding`      |
| `["dr", "withdrawable", chainId, disputeId, account, rounds.join(","), session]` | `useWithdrawable`      |
| `["dr", "cost", chainId, extraData]`                                             | `useArbitrationCost`   |
| `["dr", "accountCode", chainId, account]`                                        | `useIsContractAccount` |

### 5.3 Hooks (one per core read)

Every hook returns `SectionData<T>` (`data/types.ts`): `loading`, `ready` with the value, or `unavailable` with core's `Unavailable` (an `Outcome` with `ok: false` maps to `unavailable`; a rejected promise maps to `unavailable` with code `rpc-error`). Hooks never throw to React.

| Hook                                                    | Core call                                                            | Input                                                                                      | Output                                                                                           | Stale / refetch                                                                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useCourts(chainId)`                                    | `listCourts`                                                         | page chain                                                                                 | `SectionData<readonly Court[]>`                                                                  | stale 3 h (today's subcourt cache age, spec §2.2); persisted                                                                                                             |
| `useOngoingList(chainId)`                               | `listOngoingDisputes(ctx, courts or null)`                           | runs after `useCourts` settles                                                             | `SectionData<OngoingList>`                                                                       | stale 60 s; refetch on chain change only                                                                                                                                 |
| `useOngoingTitle(chainId, dispute)`                     | `loadMetaEvidence` with `ONGOING_BUDGET_MS`                          | `OngoingDispute`                                                                           | `SectionData<OngoingTitle>`                                                                      | shares the meta-evidence key and policy below                                                                                                                            |
| `useDisputeLookup(chainId, disputeId)`                  | `lookupDispute`                                                      | page chain, parsed ID                                                                      | `SectionData<DisputeLookup>`                                                                     | stale 30 s; never persisted (holds an `ArbitratedBinding`, A22)                                                                                                          |
| `useFamily(chainId, arbitrable)`                        | `detectFamily` with `familyCache`                                    | from the binding                                                                           | `SectionData<FamilyDetection>`                                                                   | stale ∞, never persisted (C11), 1 retry on rejection                                                                                                                     |
| `useMetaEvidence(chainId, binding, budget)`             | `loadMetaEvidence` with `CASE_PAGE_BUDGET_MS` or `ONGOING_BUDGET_MS` | binding                                                                                    | `SectionData<MetaEvidenceResult>`                                                                | `staleTime` by `metaEvidenceCachePolicy(result)`: `persist` → ∞; `memory-brief` → 30 s (D-38); `never` → 0. The case page refetches on mount any result that is not `ok` |
| `useDisputeEvent(chainId, binding)`                     | `readDisputeEvent` from `arbitratorDeployedAtBlock ?? 0`             | binding                                                                                    | `SectionData<DisputeEventResult>`                                                                | stale ∞ once `found`, else 60 s                                                                                                                                          |
| `useEvidence(chainId, binding, disputeEvent)`           | `loadEvidence`                                                       | `evidenceGroupId` from the found event                                                     | `SectionData<EvidenceList>`                                                                      | stale 60 s                                                                                                                                                               |
| `useDisputeDetails(chainId, found, family, eventBlock)` | `readDisputeDetails`                                                 | lookup `found`, family or `undefined` when detection failed, Dispute-event block or `null` | `SectionData<DisputeReads>`                                                                      | stale 30 s; never persisted                                                                                                                                              |
| `useMultipliers(chainId, family)`                       | `readMultipliers`                                                    | period ≥ 3                                                                                 | `SectionData<Multipliers>`                                                                       | stale 10 min                                                                                                                                                             |
| `useRoundFunding(context, round, fromBlock)`            | `readRoundFunding`                                                   | `fundingRound` and `roundStartBlock` (core)                                                | `SectionData<RoundFunding>`                                                                      | stale 30 s; keyed by the governor session (§5.2)                                                                                                                         |
| `useWithdrawable(context, account, rounds, starts)`     | `readWithdrawable`                                                   | period 4                                                                                   | `SectionData<WithdrawState>`                                                                     | stale 30 s; keyed by the governor session (§5.2); never persisted (account-specific)                                                                                     |
| `useArbitrationCost(chainId, extraData)`                | `readArbitrationCost`                                                | Create form                                                                                | `SectionData<bigint>`                                                                            | stale 60 s                                                                                                                                                               |
| `useIsContractAccount(chainId, account)`                | `client.getCode`                                                     | page chain, connected account                                                              | `SectionData<boolean>` (A14 rule incl. the `0xef0100` exemption; an error is `false`, spec §2.3) | stale ∞; never persisted                                                                                                                                                 |

Composite hooks assemble what the screens render, so no screen orchestrates core calls itself:

- **`useCase(chainId, disputeId | null, account?): CaseData`** — `null` is the D-09 state; `account` is the connected wallet, for the withdraw panel. Order (MODULES.md "typical composition"): lookup → (family, meta-evidence, Dispute event, courts in parallel) → details → by period: multipliers (period 3), current-round funding (periods 3 and 4; the decision's "won by default" in period 4), and `useWithdrawable` over `roundsToScan` for the connected account (period 4) → `buildDisputeView` and `buildAppealPanel`. Each field of `CaseData` is its own `SectionData`, so one failing read degrades one section (D-36). `CaseData.write` carries the binding, family, local ID, override and appeal info that the write builders need. A new ID or chain starts from a fresh lookup; nothing of the previous dispute is shown (D-53).
- **`useOngoing(chainId): OngoingData`** — list plus courts.

`CaseData` is `{ status: "no-id" }` (D-09) or a `CaseDispute`; every case section component of the screen builders takes `CaseSectionProps` (`{ dispute: CaseDispute; chain: ChainConfig }`, `data/types.ts`), so `pages/case` renders the sections of `case-summary`, `case-appeal` and `case-evidence` without those directories importing each other. Component names: `case-summary` exports `CaseOverview` (header card and info row), `DisputeSummary`, `DisputeTimeline`, `DecisionAlert`, `RealityNotice`; `case-appeal` exports `AppealSection`; `case-evidence` exports `EvidenceSection`; `pages/case`, `pages/ongoing` and `pages/create` export `CasePage`, `OngoingPage` and `CreatePage`.

- **`useCaseRefresh(chainId, disputeId)`** — §5.6.

### 5.4 Persisted cache (B15, D-13)

- `PersistQueryClientProvider` with `createPersistOptions(storage)`: `createStoragePersister(storage)` (the three methods of TanStack's `Persister` as its deprecated `createSyncStoragePersister` implements them, over `window.localStorage` under the key `"dr-query-cache"`, writes throttled to one per second, every storage call in try/catch) and `buster: CACHE_VERSION`. `CACHE_VERSION` is a string constant in `data/`; any change to a content-addressing rule, a core schema, or a persisted shape bumps it, and a bumped version discards everything persisted under the old one. `maxAge` is 30 days.
- **Allowlist, not denylist.** `shouldPersistQuery` (passed as `dehydrateOptions.shouldDehydrateQuery`) persists a query only when its key is `["dr", "courts", …]` with an `ok` value, or `["dr", "metaEvidence", …]` whose data has `metaEvidenceCachePolicy(data) === "persist"`. Everything else stays in memory: the library's `["UserSettings"]` (it holds the user's email) and `["RoleRestrictions"]`, every key holding an `ArbitratedBinding` (a binding rehydrated from storage would be a forged one, A22), family detections (C11), anything keyed by an account, every rejection (A2) and every brief failure (D-38).
- **`bigint`.** `serializePersistedClient` encodes `bigint` as `{"$bigint":"<decimal>"}`; `deserializePersistedClient` decodes it.
- **Validation on read.** `deserializePersistedClient` parses inside try/catch, then keeps a persisted query only when its data passes the validator for its key kind: `parseCachedMetaEvidenceResult` (core) for meta-evidence, a web Zod schema of `Outcome<readonly Court[]>` for courts. Invalid entries are dropped, never repaired; a parse failure drops the whole blob. Unit tests: "B15: a malformed meta-evidence entry is ignored", "D-13: a version bump invalidates every entry", "A2: an invalid result is never written".
- The Reality question cache (§5.1) keeps its own localStorage keys and core-side validation (A5); the smart-contract-wallet dismissal keeps today's key (spec §6.5).

### 5.5 Ongoing page loading (D-37)

`useOngoingList` resolves the open IDs and structs; the page renders the card grid as soon as it resolves. Each card calls `useOngoingTitle` and renders its title when its own meta-evidence settles: `ok` → title, or "Meta Evidence Missing" when the title is empty (spec §3); `missing` → "Meta Evidence Missing" (spec §3: null meta-evidence); `invalid` → the placeholder title; only `failed` → the dispute ID with "title unavailable" (D-37 changes the failure case alone). `failedIds` (a failed `disputes(id)` read, which core reports instead of dropping) render as cards with the ID and "details unavailable", visible under the "Ongoing" filter only, since their period is unknown; this applies D-37's "show the ID instead of dropping the card" to the struct read as well. The 40 s budget bounds every card (D-37, D-38); script runs are capped at four at a time by the runner (D-29). There is no page-wide spinner after the list resolves.

### 5.6 Reload after a write (spec §5.3 `reload()`, D-02, D-07)

`useCaseRefresh(chainId, disputeId)` returns `refresh(scope: RefreshScope)`, called by the write flow's `onMined` only after the receipt is mined (D-07: no reload on submission, no immediate reload):

| Scope      | Invalidates                                                                                                                                     | Spec                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `evidence` | lookup, evidence                                                                                                                                | spec §5.14 submit; D-07                                                    |
| `appeal`   | lookup, details (holds `getDispute`, `AppealDecision`, current ruling, appeal info), evidence, round funding (every funding key of the dispute) | spec §5.3 `reload()` after funding; D-02 (same scan range on every reload) |
| `withdraw` | withdrawable                                                                                                                                    | P-02                                                                       |

Because `readDisputeDetails` and `readRoundFunding` read several values together, the `appeal` refresh also refreshes `currentRuling`, `appealCost`/`appealPeriod` and `RulingFunded`, which today's `reload()` leaves stale; that difference is proposal P-02.

### 5.7 Section error boundaries (D-36, B12)

`SectionBoundary` (ui) is a small class component (`getDerivedStateFromError`), no dependency. It wraps every independently degradable section: on the case page each of summary, evidence display, timeline, info row, decision, Reality notice, appeal panel, question panel, evidence panel; on the Ongoing page each card and the filter; on the Create page each step. A render error shows `SectionUnavailable` ("{section} unavailable" with the reason) and a Retry that resets the boundary and refetches the section's queries. `RootErrorBoundary` (shell) is the last resort; it keeps the header and footer. Data failures never reach a boundary: they arrive as `SectionData` `unavailable` and render the same `SectionUnavailable` with core's `Unavailable.message` (no fake data, D-36).

---

## 6. Write flow (wallet)

### 6.1 One hook

```ts
const write = useWrite(); // WriteController
await write.execute(build, { pageChainId, onMined });
```

`execute` takes a core `WriteBuild` (never a hand-made call):

1. `build.ok === false` → status `refused` with the core `WriteRefusal`; nothing is sent (D-07, D-47).
2. `checkChainMatch(walletChainId, pageChainId)` (core):
   - `no-wallet` → status `needs-wallet`; the controller's `connect()` opens Connect (§2.3).
   - `wrong-chain` → status `wrong-chain` with `walletChainId` and `pageChainId`, and the controller's `switchChain(pageChainId)` offers the switch; no signature is requested (B3, D-48). The refusal message names both chains and offers the switch again.
3. Immediately before signing, the guard runs again on the connector's current chain, and `writeContract` is called with `chainId: call.chainId`, so wagmi itself rejects a chain mismatch as a second barrier.
4. `pending` (awaiting the wallet) → `submitted` with the hash and an explorer link (`explorerTxUrl`, D-40) → `mined` (receipt status `success`, then `onMined(receipt)`) or `failed` (receipt `reverted`, or any error after submission, or any wallet error other than a rejection) → or `rejected` (user rejection: viem `UserRejectedRequestError`, EIP-1193 code 4001), which is shown as a neutral notice, not an error (D-07).
5. The receipt is awaited through `CoreDeps.waitForReceipt` (configured read RPC, §6.4).

`WriteStatusNotice` (wallet) renders any `WriteStatus` with ui's `Notice` over the library `AlertMessage` (variants are the closed set of §11.3, D-14), followed by the explorer link as an `ExternalLink` and, for `wrong-chain` and `needs-wallet`, the switch or Connect offer. Screens place it next to the action; a failed evidence submission keeps the modal open with the notice (D-07). Unit tests: B3/D-48 guard, each outcome, "D-07: a rejected signature is not an error".

### 6.2 Withdrawals in sequence (D-51)

`useWriteSequence()` takes `readonly WriteBuild[]` (core's `buildWithdrawCalls`), runs `execute` on each in order, waits for each receipt before the next signature, stops at the first `rejected` or `failed`, and reports `{ index, total, current: WriteStatus }`. After the last mined receipt (or a stop that follows at least one mined write) it calls `options.onMined` once with the last receipt; the caller passes `refresh("withdraw")` there.

### 6.3 Smart-contract-wallet warning (A14)

`SmartContractWalletWarning` (wallet, rendered by the header with `chainId` = the header's resolved chain): `useIsContractAccount(chainId, account)`; dismissible; dismissal stored under today's key `@kleros/dispute-resolver/alert/smart-contract-wallet-warning:{address}`, storage access in try/catch; copy and link as spec §2.3.

### 6.4 Why receipts do not go through wagmi

AppKit wraps every wagmi transport in a fallback to Reown's RPC for the chains Reown supports (`CaipNetworksUtil.extendWagmiTransports`), so a wagmi read could leave the configured RPC (A13). Receipts are therefore polled by a viem public client built in `data/` from `resolveReadRpcUrl` (one client per chain, `waitForTransactionReceipt` only). The data builder owns this receipt client (orchestrator decision: core's `ReadClient` stays read-only and unchanged).

---

## 7. Script runner (runner; ADR 0004, B1, B4, B5, B8, C3, C4, C7, D-05, D-25, D-29)

### 7.1 Why the runner page is a static HTML with a classic script

A document served with `sandbox allow-scripts` (frame attribute and response header) has an opaque origin. A `<script type="module">` (what a Vite HTML entry emits) is fetched in CORS mode, and from an opaque origin the request carries `Origin: null`; the app's own `/assets/*` answers without `Access-Control-Allow-Origin`, so the module would not load. A classic `<script src>` is fetched without CORS and loads. Hence:

- `public/__runner/index.html` (runner): a static page, copied verbatim by Vite, served at `/__runner/index.html` (a path no app pattern matches, C3):

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Dispute Resolver script runner</title>
    </head>
    <body>
      <script src="/__runner/bootstrap.js"></script>
    </body>
  </html>
  ```

- `/__runner/bootstrap.js` is the bootstrap compiled from `src/runner/page/main.ts` as one classic IIFE by `runnerBootstrapPlugin()` (`src/runner/build/`): in `vite build` it runs a nested Vite library build (`formats: ["iife"]`, `write: false`) and emits the file next to the HTML; in `vite dev` it serves the same output from a middleware. In `vite dev` and `vite preview` (`configureServer`, `configurePreviewServer`) it also sends the runner's enforced `Content-Security-Policy` of §10.1 on every response under `/__runner/`, so the runner behaves locally as on the deploy, where `public/_headers` sends it. `src/runner/build/index.ts` exports the plugin, `buildRunnerBootstrap(root)` and `RUNNER_CONTENT_SECURITY_POLICY` (the policy string of §10.1); `runner/index.ts` does not re-export them, so this Node-side build code never enters the app's module graph. This is the "separate entry" of the runner: separately built, never part of the app bundle, never importing React or core. CLAUDE.md's `public/__runner/index.html` and the task's "separate Vite entry" both hold: the HTML is static, the script is its own build.

### 7.2 Runner page bootstrap (`src/runner/page/`)

`main.ts` only calls `bootstrapRunner(realEnvironment())`. `bootstrap.ts` exports `bootstrapRunner(env: RunnerEnvironment)`, where `RunnerEnvironment` bundles `selfOrigin`, `isTopLevel`, `parent`, `locationOrigin`, `addMessageListener`, `globals`, `evaluate`, `runScript` and the XHR/fetch hooks (`network`), so every guard is unit-testable with a fake environment. `evaluate.ts` is the only file in web that evaluates code: `export function evaluateInGlobalScope(source: string): void { (0, eval)(source); }` (indirect eval, global scope, so top-level `function getMetaEvidence` becomes a global as it did in a `<script>` tag) and `runScriptInGlobalScope(scriptText)`, which evaluates `` `${scriptText}\n;getMetaEvidence();` `` in one call, allowed by lint rule 2 of §1.4.

Order, all inside `bootstrapRunner`:

1. **Guards (C4).** Evaluate nothing unless `self.origin === "null"` (the document really is sandboxed) and the window is not top-level (`window.top !== window` and `window.parent !== window`). On failure: install no listener and stop.
2. **Accept one message.** A `message` listener accepts the first event with `event.source === window.parent`, `event.origin === location.origin` (the URL's origin is the app's even in an opaque document), `event.data` a `RunnerRequestMessage` (`type === "dr-runner/run"`, `version === 1`, fields type-checked by hand) and exactly one transferred port. Anything else is ignored. After one accepted message the listener is removed: one frame, one run.
3. **Globals.** `scriptParameters` (frozen copy of `params`), `resolveScript(value)` and `rejectScript(reason)` are defined on `globalThis` as non-writable, non-configurable properties.
4. **RPC redirect (D-25).** Patch `fetch` and `XMLHttpRequest.prototype.open` so a request whose URL matches a rule of `rpcRedirects` (scheme `https`, exact host, path starting with the rule's prefix) goes to the rule's target URL instead. The page knows no provider; the host sends the rules (§7.3).
5. **Duplicate-key guard (A4).** When `guardSource` is not `null` (the host sends core's `JSON_DUPLICATE_KEY_GUARD` for `kind === "reality"`), evaluate it first.
6. **Run.** Evaluate `scriptText` and the call of `getMetaEvidence()` in one evaluation (`runScript`), as the old runner's single `<script>` did, so an entry point declared with `const` or `let` (the default script `QmZZHw…` does) is called too. A synchronous throw from either, a missing `getMetaEvidence`, or a `rejectScript` call posts `{ type: "dr-runner/error", message }`. `resolveScript(value)` posts `{ type: "dr-runner/result", value, jsonDuplicateKeys: globalThis.__klerosJsonDuplicateKeys === true }`; a value that cannot be structured-cloned posts an error instead. Only the first resolve or reject is posted. Asynchronous errors are not reported; the host's timeout settles those runs (a script that throws later never reports, ADR 0004).

The pinned scripts see the same contract as today: `scriptParameters` with the spec §9.5 keys, `resolveScript`, `rejectScript`, a call to `getMetaEvidence()`, `window.parent` existing.

### 7.3 Host protocol (`src/runner/host/`)

`createIframeScriptRunner(options: IframeRunnerOptions): ScriptRunner` (core's interface). Per `run(request)`:

1. **Validate parameters (B5).** A Zod schema re-checks `ScriptParameters` even though core built them: `disputeID` ASCII digits; `arbitrableContractAddress` a lowercase address; `arbitratorChainID` and `arbitrableChainID` integers for which `parseChainId(id) === id` (configured set); each RPC URL `null` or an absolute `https:` URL. Invalid → `{ status: "failed", reason: "runner-error" }` without creating a frame. `scriptText` must be a string.
2. **Queue.** At most `maxConcurrent` (4, D-29) frames at a time, FIFO. The timeout clock starts when `run` is called, so queue time counts against the meta-evidence budget (D-38). An abort while queued settles `aborted` without a frame.
3. **Frame.** `document.createElement("iframe")`; `setAttribute("sandbox", "allow-scripts")` **before** `src`; `referrerpolicy="no-referrer"`; `aria-hidden`, `tabindex=-1`, hidden by style; `src = options.runnerUrl` (`/__runner/index.html`); append to a hidden container in `document.body`.
4. **Post.** On the frame's `load` event, create a fresh `MessageChannel`, keep `port1`, and `iframe.contentWindow.postMessage(message, "*", [port2])` with `RunnerRequestMessage` `{ type: "dr-runner/run", version: 1, scriptText, params, guardSource, rpcRedirects }`. `"*"` is the only target origin an opaque document accepts.
5. **Results only via the port.** `port1.onmessage` parses the reply with a Zod schema of `RunnerReplyMessage`; `result` → `{ status: "ok", value, jsonDuplicateKeys }` (`value` stays `unknown`; core validates after the merge, A23, C13); `error` → `{ status: "failed", reason: "script-error" }`; a malformed reply → `runner-error`. There is no `window` message handler anywhere in the host (B1, D-05).
6. **Settle once.** On reply, timeout (`reason: "timeout"`) or `request.signal` abort (`aborted`): clear the timer, close `port1`, remove the iframe, release the queue slot (B8). The promise never rejects.

**RPC redirect rules (D-25, D-35).** The host builds `rpcRedirects` from `APP_CONFIG.env`: for each Infura network name with a configured chain (`mainnet` 1, `sepolia` 11155111, `polygon-mainnet` 137, `arbitrum-mainnet` 42161, `arbitrum-sepolia` 421614, `optimism-sepolia` 11155420, `base-mainnet` 8453, `base-sepolia` 84532, `unichain-mainnet` 130, `unichain-sepolia` 1301, `zksync-mainnet` 324, `zksync-sepolia` 300), a rule `{ host: "<net>.infura.io", pathPrefix: "/v3/", target: <public RPC of that chain> }`, emitted only when `resolvePublicRpcUrl` is `configured`. The target is the public RPC of D-35 (the URL given to third-party frames and scripts, defaulting to the read RPC), which is also the endpoint C10's null-origin pre-flight covers. Hosts outside the table (the dead `ipfs.kleros.io`, other providers) are not rewritten, as today (ADR 0004 consequences).

### 7.4 Wiring and tests

`DataProvider` creates the runner once, through `createCoreDeps` (§5.1): `createIframeScriptRunner({ document, runnerUrl: RUNNER_PATH, maxConcurrent: 4, rpcRedirects: buildRpcRedirects(config.env) })`. Core's `loadMetaEvidence` calls it; nothing else does. `runner/index.ts` exports `RUNNER_PATH`, `createIframeScriptRunner` and `buildRpcRedirects`; types: `runner/types.ts`.

Vitest (jsdom): B5 parameter rejection (`"1</script>"`, `"01"`, unconfigured `10`, non-https RPC); host sets `sandbox` before `src` (attribute mutation order observed); B1/D-05 "a message posted to window by another frame is ignored" (the host has no window listener; a forged `window.postMessage` resolves nothing); B8 "two concurrent runs resolve to their own results" (fake frames answering on their own ports in reverse order); D-29 concurrency cap; timeout and abort remove the frame; every C4 guard of `bootstrapRunner` with a fake environment (opaque origin missing, top-level, wrong `event.source`, wrong `event.origin`, no port, second message ignored); the four ported duplicate-key guard tests (A4) and "C7: a script with a non-ASCII literal round-trips" through `evaluateInGlobalScope` in jsdom.

Playwright (`e2e/runner/`, runner; run with `yarn e2e:runner` against `vite preview`, which `playwright.config.ts` starts after `yarn build`, in Chromium, Firefox and WebKit through the projects `chromium`, `runner-firefox` and `runner-webkit`; the guard tests that need a separate browser launch the project's engine). `e2e/runner/case-page-script.spec.ts` drives the built case page of mainnet dispute 1621 with every network dependency served by its own routes, recognized by shape and never by host (the meta-evidence locator, the gateway serving a test meta-evidence file and a test script under the allowlisted governor CID, the chain-1 JSON-RPC reads from `e2e/runner/fixtures/mainnet-1621.rpc.json`, recorded at the block it names): §7.3/D-38 the script's title and ruling options are rendered well within the budget and the frame is removed; B4/C4/B1/D-05 the app's runner frame has `sandbox="allow-scripts"` exactly, runs at an opaque origin with `location.origin` the app's, and a foreign window forging run requests to every frame and results to the app changes nothing; C4 a run request from a window other than the parent is ignored while the parent's own request still runs. `e2e/runner/runner.spec.ts`: C3 the runner page and `/__runner/bootstrap.js` are served with the runner policy; §7.1/B4/C7 a sandboxed runner loads its classic bootstrap, runs a script with `self.origin === "null"`, no access to its own or the parent's storage or the parent's document, and replies through the port; C4 a runner loaded without the sandbox attribute or its header evaluates nothing; C4 a runner framed by a parent outside the app evaluates nothing; C4 a runner opened as the top-level page evaluates nothing; C7 `QmQGMR…` against mainnet dispute 1650's parameters returns "Harris", "Trump" and "Answered Too Soon" (skipped without `REACT_APP_PUBLIC_RPC_1` or `REACT_APP_WEB3_PROVIDER_URL`); B1 a page outside the app cannot frame it (needs the C1 headers, which `vite preview` does not apply, so it runs only with `DR_E2E_DEPLOY_URL` set to the branch deploy). The C4 guard tests strip the runner policy from the response, as a header misconfiguration would, so they prove the bootstrap's own checks.

The two assumptions of §7.1 and §10.1 (a classic script loads in the opaque-origin document; `'self'` in the header policy matches the response URL's origin there) are proven locally before the branch deploy by the §7.1/B4/C7 test above: `runnerBootstrapPlugin()` sends the runner's `Content-Security-Policy` of §10.1 on `/__runner/*` in `vite preview` (§7.1), and the script runs and reports through the port under it. Fallback if `'self'` does not match: drop `script-src` from the runner policy (ADR 0004 requires only `sandbox allow-scripts` and `frame-ancestors 'self'`), and the C3 test then checks app policies for `'unsafe-eval'` directly.

---

## 8. Atlas (atlas; ADR 0002, A15, A16, B16, D-20, D-21, D-42, D-52)

### 8.1 Gate

`AtlasGate` renders the library's `AtlasProvider` with `{ uri: atlasUri, signupProduct: SignupProduct.CourtV1, ipfsProduct: IpfsProduct.CourtV1, wagmiConfig }` only when `APP_CONFIG.atlasUri` is set. It provides the atlas context either way, through `AtlasUploaderProvider` (exported so `TestAtlasProvider` can provide a fake uploader); without the URI, `useAtlasUpload()` reports `availability: "unconfigured"` and never calls the library's `useAtlasProvider()` (which would throw outside its provider). Upload controls then render "Uploads are unavailable on this deployment" (D-21) and everything else works.

### 8.2 `useAtlasUpload(): AtlasUploader`

- **`limits(role)`** — the role's `{ maxSize, allowedMimeTypes }` from the library's `roleRestrictions` (`evidence` and `policy` roles of `CourtV1`); `null` while unknown. Dropzones show the server's size limit instead of today's fixed 20 MB (D-42).
- **`upload(file, role)`** — one click, in this order:
  1. Unconfigured → `unconfigured`; no connected address → `no-wallet` (the caller offers Connect).
  2. **Client-side limits first** (B16, D-42): reject a file whose `type` is not allowed (exact match or `type/*` prefix, the library's rule) with `mime-not-allowed`, or whose size exceeds `maxSize` with `too-large`. Unknown limits are fetched once more first: the library's `["RoleRestrictions"]` query catches every error, is never stale, and the app's QueryClient never retries it, so one transient failure at load would otherwise block uploads until a reload. The uploader gets the QueryClient with TanStack's `useQueryClient()`, calls `refetchQueries({ queryKey: ["RoleRestrictions"], exact: true })` (a bounded wait of 10 s, like the sign-in wait of step 4) and reads the result from the query cache, since the library's new context is committed only later; still unknown → `limits-unavailable` (no upload without the server's rules; the copy says that reloading may help). Nothing is signed for a file that would be refused.
  3. **Session check.** Signed in means: the library says `isVerified` **and** the stored token has a numeric `exp` in the future. The library's own check treats a token without `exp` as valid (`a.exp && a.exp < now`), so the wrapper reads the token itself: sessionStorage key `"authToken"` (JSON-encoded string, the library's `useSessionStorage`), payload decoded with base64url + `JSON.parse` + a Zod schema `{ exp: number, sub: string }` (no `jose` import; it is the library's dependency, not web's, C14). A token without `exp`, undecodable, or expired counts as signed out (B16). This is a coupling to `@kleros/kleros-app` 3.1.0 internals, pinned by a test named after the version.
  4. **Sign in if needed (D-52, A15).** Call `authoriseUser()`; phase `signing-in`. A wallet rejection → `sign-in-rejected` (neutral), any other error → `sign-in-failed`. The library's `uploadFile` closure captures `isVerified` and the token from the render it came from, so after `authoriseUser()` resolves the wrapper waits (bounded, 10 s) for a render whose context reports `isVerified` with a valid token, through a ref updated every render, and then calls that render's `uploadFile`. Calling the stale closure would silently return `null`.
  5. **Upload.** Phase `uploading`; `uploadFile(file, role)`. `null` or a thrown error → `upload-failed` with the message (the library throws "Unsupported file type." and "File too big…" from the same rules; an `AuthorizationError` or `UNAUTHENTICATED` marks the session unverified, so the next click signs in again).
  6. **Content addressing (B16).** The returned path must pass core's `normalizeIpfsPath`; the canonical form is returned (`CanonicalIpfsPath`); anything else → `not-content-addressed` and nothing goes on-chain. Write builders re-check it (core `writes`).
- **`uploadJson(fileName, value, role)`** — `new File([JSON.stringify(value)], fileName, { type: "application/json" })`, then `upload` with the same steps. Used with `role: "policy"` for `metaEvidence.json` (spec §4.5) and `evidence.json` (spec §5.14), as today (A16).
- No signature is requested before the user's first upload action (A15); nothing in atlas runs at mount except the library's `roles` query.

Account switch: the library keeps the token and marks the session unverified (its `sub` check); the next upload signs in again (D-20). Same-tab reload keeps the session; a new tab asks again (D-20, Playwright in phase 5).

### 8.3 `AtlasFileField` (atlas)

The dropzone used by Create (primary document, role `evidence`) and the evidence modal (attachment, role `evidence`): the library's `FileUploader`, whose file picker is filtered by `limits(role).allowedMimeTypes` through `fileTriggerProps.acceptedFileTypes` while the dropzone stays unfiltered (the library's drop filter matches exact types only, so a `type/*` entry would silently refuse every drop; `upload()` applies the exact-or-prefix rule and reports `mime-not-allowed`, B16; screens never pass `acceptedFileTypes` to the dropzone), a message line showing the limit, "Uploading to IPFS..." while uploading, the selected file name afterwards (D-08), and the upload error otherwise. `onUploaded(file: UploadedFile)` (`{ path: CanonicalIpfsPath, fileName }`) and `onCleared()` props; `value: UploadedFile | null` is controlled so the evidence modal can reset it after success (D-44). It never renders the file (A17).

---

## 9. Safe content (safe-content)

### 9.1 `ExternalLink` (A10, B19, D-32)

`<ExternalLink href={string} testId?>{children}</ExternalLink>`: renders `<a href target="_blank" rel="noopener noreferrer">` only when core's `isSafeNavigationUrl(href)` (absolute `https:`); otherwise renders the children (or the raw value) as plain text in a `<span>`, never as a link (D-32). Explorer, court, social and arbitrable-app links all use it. Component test: every external anchor rendered by any page carries `rel="noopener noreferrer"` (A10).

### 9.2 `SafeMarkdown` (A11, B14, D-31)

Library: **`react-markdown` 9.1**, the version the UI library already depends on (no new transitive packages; a direct dependency is declared, §13). Reasons: it renders through React (no `innerHTML`), renders raw HTML in markdown as text by default (its `raw → text` transform when `skipHtml` is off, A11's `<img src=x onerror=…>` payload test), and exposes `urlTransform` and per-element components for the link and image rules.

- No rehype plugins (`rehype-raw` is forbidden). GitHub-flavored syntax must match today's renderer, which the parity snapshot compares as plain text: today's `react-markdown` 4.2.2 parses with `remark-parse` 5, whose `gfm` option defaults to on (tables, strikethrough, literal URLs). Establish the exact behavior empirically before choosing: install `react-markdown@4.2.2` (and React 17) in a scratch directory outside the repo, render a corpus of descriptions (tables, strikethrough, literal `http(s)://` and `www.` URLs, task lists, footnotes, raw HTML, `javascript:` links) with both renderers, compare the plain text, and add `remark-gfm` (or a narrower plugin) only for what today's renderer supports. Record the corpus as a test fixture and the result in ADR 0002's dependency table.
- **Undefined references (P-10).** Today's parser turns bracketed text that no definition names into a link to the current page (`href=""`) with its brackets dropped; CommonMark keeps it as text with its brackets. `legacyGfm` follows remark-parse 5's reference rule on the text CommonMark left (a literal `[` not preceded by `!`, its closing `]`, an optional `[identifier]` after optional whitespace; an empty label only with an identifier; brackets inside the label only with a non-empty identifier) and renders the label as today's text without the brackets and without a link. Footnote markers and definitions (`[^1]`, `[^1]: text`) and a bare task marker (`- [x]`) are such text. A defined reference stays a CommonMark link; `![alt]` without a definition stays text; backslash escapes and a backslash hard line break stay CommonMark. The corpus test compares today's rendering with its `href=""` links removed (as it removes refused links, A11), so the entries `reference-undefined*`, `footnote*` and `task-list-no-text` must match it exactly.
- `urlTransform`: keep relative URLs and the schemes `http`, `https`, `mailto`, `tel` (A11, today's react-markdown 4 allowlist); everything else becomes `""`. (v9's default would allow `irc`, `ircs`, `xmpp` and drop `tel`.)
- `a` → an anchor with `target="_blank" rel="noopener noreferrer"` (D-31). Markdown links follow A11, not D-32: `http://` links in descriptions stay links, because D-32 covers attachment and interface URLs.
- `img` → rendered only for an absolute `https:` `src` (D-31), with `referrerPolicy="no-referrer"` and `loading="lazy"`; otherwise its alt text.
- Payload tests (A11, B14, D-31): `<img src=x onerror=alert(1)>` renders as text; `[x](javascript:alert(1))` has no `javascript:` href; `![x](http://…)` renders no image; links carry `rel`.

### 9.3 `EvidenceDisplayFrame` (A8, B6, B13, C5, D-26, D-34, D-35)

`buildEvidenceDisplay(input: EvidenceDisplayInput): EvidenceDisplayModel | null` is a pure function; the component renders its result.

- **Source:** `resolveDisplayUrl(metaEvidence.evidenceDisplayInterfaceURI, gateway)` (core: canonical IPFS paths and `https://…/ipfs/<CID>…` through the gateway, D-26; otherwise the https URL as is). `null` → no iframe (A8). The T2CR override is gone; the gateway rule covers it (D-26).
- **Parameters (spec §9.4 with D-35):** `disputeID` (decimal string), `chainID` (page chain), `arbitratorContractAddress` (`klerosLiquid` of the page chain), `arbitratorChainID`, `arbitrableContractAddress` (`binding.arbitrated`, A22), `arbitrableChainID`, `arbitratorJsonRpcUrl`, `arbitrableJsonRpcUrl`, `jsonRpcUrl`. Chain-ID fields use the meta-evidence value when its `ChainIdField` is `valid`, the page chain when `absent` or `invalid`. RPC URLs are `resolvePublicRpcUrl` of the respective chain (D-35), `null` when unconfigured.
- **Encoding (spec §9.4):** `displayParamsVersion` `null` or `"0"` → `uri + "?" + encodeURIComponent(JSON.stringify(params))`; otherwise `uri + "?" + new URLSearchParams(params)` with `null` values written as empty strings.
- **Sandbox (A8, B6, C5, D-34):** `relaxed` (`allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`) when `isDisplayAllowlisted(REGISTRY, displayAllowlistKey(arbitrableChainIdOrUndefined, arbitratorChainId), arbitrable)` **and** `new URL(src).origin !== appOrigin`; otherwise `allow-scripts`. The `sandbox` prop precedes `src` in the JSX (React sets attributes in prop order).
- **Size:** `width: 100%`, fixed `height: 360px`, no `allow` attribute, `title` for accessibility, `data-testid="evidence-display"`. **No iframe-resizer dependency:** resizing needs a script inside the child page that the displays do not ship, it would act on messages from a third-party frame (untrusted, trust model), and today's height is fixed at 360 px (`iframe-resizer-react` is installed and unused today).
- Unit tests: `src` builder per `_v`, D-35 public RPC in the params, flag selection, C5 same-origin refusal, D-34 non-integer `arbitrableChainID` falls back.

### 9.4 Attachments and court links

- `Attachment` (component) takes core's `AttachmentLink | null`: `link` → `ExternalLink` with the icon of `attachmentKind` and the label; `text` → plain text (D-32). Attachments are never rendered inline: no `<img>`, `<video>`, `<object>` or iframe of an attachment, and the library's `FileViewer` is banned (A17, lint rule 4).
- `courtCaseUrl(disputeId: bigint, chainId: ChainId): string` builds `https://court.kleros.io/cases/{encodeURIComponent(id)}?requiredChainId={chainId}` with `new URL` and `searchParams` (A18). Used by the search label (spec §5.2) and the question panel (spec §5.13).

---

## 10. Headers (routing; C1, C2, C3, B9, D-41)

### 10.1 `public/_headers`

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: SAMEORIGIN

/
  Content-Security-Policy: frame-ancestors 'none'
  Content-Security-Policy-Report-Only: __APP_CSP__

/index.html
  (same two lines)

/:chain
/:chain/ongoing
/:chain/create
/:chain/cases
/:chain/cases/*
/:chain/interact/*
/:chain/disputes
/cases/*
/interact/*
  (each: the same two lines)

/__runner/*
  Content-Security-Policy: sandbox allow-scripts; frame-ancestors 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'
```

- The app patterns are C1's list plus the two chain-less legacy prefixes (`/cases/*`, `/interact/*`; `/ongoing`, `/create`, `/cases`, `/disputes` already match `/:chain`), which only adds protection and matches nothing under `/__runner/`. They are attached to enumerated patterns because Netlify's rules have no negation and every matching rule's headers are combined (C3).
- The runner rule is enforced from the first deploy, never report-only, never a `<meta>` (ADR 0004). `'self'` in a header policy refers to the response URL's origin even in a sandboxed document, so the classic bootstrap loads; `'unsafe-eval'` allows the evaluation the runner exists for. `X-Frame-Options: SAMEORIGIN` from `/*` lets the app frame it.
- The legacy `public/create/` and `public/interact/` SVG copies (spec §1.5) are not carried over.

### 10.2 The report-only policy (C2)

`__APP_CSP__` is replaced at build time (§10.3) by:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self';
connect-src 'self' <generated origins>; frame-src https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'
```

Generated `connect-src` origins (scheme, host and port only, never a path or query, since RPC URLs carry keys in the path): every configured read RPC and public RPC origin of the 14 chains (the env variables and the zkSync literals), the Atlas origin, the meta-evidence API origin, the IPFS gateway origin, and the fixed wallet origins `https://api.web3modal.org`, `https://rpc.walletconnect.org`, `https://pulse.walletconnect.org`, `wss://relay.walletconnect.org`, `wss://relay.walletconnect.com`. Court policies are fetched through the gateway or from their own https host; the hosts outside the gateway are added from the report-only log. `style-src 'unsafe-inline'` covers AppKit's shadow-DOM `<style>` elements; whether it can be dropped is decided from the report-only run. There is no report endpoint (no backend); the golden suite collects `[Report Only]` console violations. After a clean run the orchestrator renames the header to `Content-Security-Policy` in a reviewed change (C2).

### 10.3 `headersPlugin()` (routing/headers)

A Vite plugin used only in `vite build`: after Vite copies `public/`, it replaces `__APP_CSP__` in `dist/_headers` with the policy of §10.2, computing the origins from `process.env` (the same `REACT_APP_*` names core's `CHAINS` declares, read through `loadEnv`). The plugin loads `appCsp.ts` at `writeBundle` through Vite's `runnerImport` (marked experimental): Vite's config loader leaves the bare `@dispute-resolver/core` import to Node, which cannot load core's TypeScript source, and `runnerImport` keeps core the single source of the env names and the zkSync defaults. The alternative, `vite build --configLoader runner`, is not used. `headers.test.ts` runs `writeBundle` through it, so a Vite upgrade that breaks it fails the suite (the lockfile holds Vite at 8.3.4). It fails the build when the placeholder remains or any generated source contains `/`, `?` or `#` after the origin. It never prints values.

### 10.4 Local test (`routing/headers/headers.test.ts`)

Parses `public/_headers` with a small Netlify-format parser and a path matcher (`:placeholder` = one segment, `*` = the rest), then asserts:

1. `/*` carries exactly the four C1 headers.
2. Every pattern of `APP_ROUTE_PATTERNS` (and the legacy prefixes) carries `Content-Security-Policy: frame-ancestors 'none'` and the report-only policy; the sample paths `/`, `/1/ongoing`, `/1/cases/5`, `/1/interact/5`, `/1`, `/ongoing` each resolve to exactly one enforced policy containing `frame-ancestors 'none'`.
3. `/__runner/index.html` and `/__runner/bootstrap.js` match no app pattern; their combined `Content-Security-Policy` values, split on commas, are exactly one policy that contains `sandbox allow-scripts`, does not contain `allow-same-origin`, and contains `frame-ancestors 'self'` (C3).
4. No app path's enforced or report-only policy contains `'unsafe-eval'` (the runner's eval allowance, C3).
5. The plugin, given a fake env with keyed RPC URLs, emits only origins.

The deploy test of C1–C3 against the branch deploy is phase 5's.

---

## 11. Design system (shell)

### 11.1 Look

The Kleros v2 look through `@kleros/ui-components-library` 3.9 and its tokens (`--klerosUIComponents*`, Tailwind colors `klerosUIComponents*`). Light and dark mode follow `prefers-color-scheme` by toggling `.dark` on `<html>` (`theme.ts`), which switches the library's tokens; app markup uses only token colors, never literals. No theme toggle is added.

- **Fonts (A20).** Open Sans, self-hosted through `@fontsource/open-sans` (weights 400, 600, 700, latin and latin-ext subsets), declared in `index.css` as `@font-face` rules over the package's `woff2` files, not an `@import` (an `@import` of the package ships broken font URLs: Tailwind inlines the stylesheet without rebasing `url(./files/…)`, and the per-subset files lack `unicode-range`); Vite bundles the `woff2` files under `/assets` (`font-src 'self'`). No Google Fonts, no CDN.
- **Typography** (v2 base elements, in `@layer components`, only on app markup: selectors exclude `[class*="klerosUIComponents"]` so library text keeps its own styles): `h1` 24/32 semibold; `h2` 24/32 regular; `h3` 16/24 semibold; body `p` 16/24; `small` 14/18 semibold; `label` 14/18 secondary text; links primary blue. Monospace for addresses and hashes: the system stack.
- **Spacing.** Tailwind's 4 px scale. Page gutter 16 px below `lg` (900 px, the library's breakpoint), `clamp(16px, 8vw, 132px)` above. Content max width 1400 px for the frame; the case page's reading column is 1080 px. Vertical rhythm between sections 24 px (`gap-6`), inside cards 16 px.
- **Desktop-first, usable on every width (ADR 0002).** Every screen is a single column below `lg`; the header collapses its navigation into a menu button below `lg`; tables become stacked key-value lists; appeal cards go from a 3-column grid to 1 column.

### 11.2 Page frame (shell)

`PageFrame` (`{ resolvedChain: ResolvedChain; children }`) = `Header` + main + `Footer`.

- **Header** (spec §2.3): sticky; light background primary purple, dark background `lightBlue` at 65 % with backdrop blur (v2). Left: brand (Kleros Dispute Resolver logo) linking to `paths.chainRoot(chain)`. Center: "Ongoing Disputes" (`paths.ongoing`), "Create" (`paths.create`, only when a wallet is connected, spec §2.3), "Interact" (`paths.cases`). Right: `ChainIndicator` and `WalletControl` (both wallet). Below the bar: `SmartContractWalletWarning` (A14), and when no wallet is connected the view-only banner (spec §2.3; text adapted to "connect a wallet", the Metamask link kept as an `ExternalLink`).
- **`ChainIndicator`** shows the resolved chain's name. When a connected wallet is on a different chain it shows "Switch to {page chain}" (wagmi `switchChain`), the switch offer of D-48. In `appkit` mode, pressing the chain name while connected opens AppKit's Networks view, which changes the wallet's chain, and the app follows (D-55). It is not a free chain picker that navigates: that would be a new action the spec does not have, and it is not built.
- **`WalletControl`**: "Connect" (§2.3) when disconnected; when connected, the short address with an identicon and the app's own menu (copy address with library `Copiable`, explorer link, disconnect). AppKit is only ever opened on its Connect and Networks views; its account button and account view (which read balances through Reown's RPC) are not used.
- **Footer** (spec §2.4): "Secured by Kleros" → `https://kleros.io`; the resolved chain's name ("Unsupported Network" on that screen); "I need help" → `https://t.me/kleros`; the chain's explorer link to its ArbitrableProxy when both exist (D-40 extends today's mainnet-only Etherscan link to every chain); social links (GitHub `kleros/dispute-resolver`, Slack, Reddit, Twitter, forum, Telegram, LinkedIn) with inline SVG icons drawn in `shell/` (no icon dependency).

### 11.3 Section states (ui)

Reusable components every screen uses, so loading, empty and error look the same everywhere:

| Component                                                          | Use                                                                                                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectionSkeleton` (`lines`, `variant: "text" \| "card" \| "grid"`) | loading; token-colored blocks with the library's `animate-loading`, `aria-busy`                                                                                  |
| `EmptyState` (`title`, `body?`)                                    | "There are no open disputes.", "No evidence submitted yet."                                                                                                      |
| `SectionUnavailable` (`section`, `error: Unavailable`, `onRetry?`) | a data failure or a boundary catch (D-36): `Notice` variant `warning`, title "{section} unavailable", body `error.message`                                       |
| `PageMessage` (`title`, `body?`, `action?`)                        | full-page states: not found, no arbitrator, D-09                                                                                                                 |
| `SectionBoundary`                                                  | §5.7                                                                                                                                                             |
| `Notice` (`variant: NoticeVariant`, `title`, `body`)               | every alert in the app; `NoticeVariant` is the closed set `"success" \| "warning" \| "error" \| "info"` mapped to the library `AlertMessage` (D-14: no `danger`) |
| `Countdown` (`target: UnixSeconds`)                                | `DDd HHh MMm` (spec §3, spec §5.7, spec §5.12), one shared 30 s clock                                                                                            |
| `Amount` (`wei: bigint`, `chain`)                                  | `formatEther` plus the chain's currency symbol on every amount (D-10)                                                                                            |
| `AddressText` (`address`, `chain`)                                 | shortened address, `Copiable`, explorer `ExternalLink` (D-40)                                                                                                    |
| `Identicon` (`address`)                                            | a 5×5 symmetric SVG grid derived from the address bytes (replaces Blockies, no dependency)                                                                       |
| `PeriodBadge` (`period`)                                           | colored dot plus label: evidence primary blue, commit secondary purple, vote tint, appeal warning, execution success                                             |

`ui` also exports the pure formatters behind them: `shortenAddress` (`AddressText`), `formatAmount` (`Amount`) and `formatDuration` (`Countdown`).

### 11.4 Library component per UI element

| UI element (spec)                                                                                                                                                        | Library component                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alerts: decision (spec §5.9), Reality notice (spec §5.10), compatibility banner (spec §5.5), rewards note (spec §5.12), fees unavailable (spec §5.11), write status (§6) | `AlertMessage` through `Notice` (`msg` is a string; multi-line bodies use `whitespace-pre-line`, spec §5.10 "line breaks preserved")                                                                                                                                                                                                |
| Accordion: Appeal, Question, Evidence (spec §5.11), all collapsed initially                                                                                              | `CustomAccordion` (`items` with an `expandButton` per item, no `defaultExpanded`; one open at a time like today's), wrapped by `pages/case`'s `CaseAccordion`: a collapsed body stays mounted for the parity hooks (§12) and is `hidden` once the collapse animation ends, so its controls leave the tab order                      |
| Timeline (spec §5.7, D-39)                                                                                                                                               | No library component: `DisputeTimeline` draws an ordered list of the five columns inside a `Card`, horizontal from `lg` and vertical below, each with a bullet for its state and a line under the name: "Concluded", "Ends in" with a `Countdown`, or "Lasts" with the duration. The library `Steps` is used on Create only (§11.5) |
| Funding progress (spec §5.12)                                                                                                                                            | `LinearProgress` (value = funded percent)                                                                                                                                                                                                                                                                                           |
| Cards: Ongoing cards, crowdfunding cards, summary                                                                                                                        | `Card` (`hover` on Ongoing cards), `Box` for grouped panels                                                                                                                                                                                                                                                                         |
| Fields: title, question, option titles, aliases, addresses, evidence title                                                                                               | `TextField`; description fields `TextArea`; votes and option count `NumberField`; contribution amounts `BigNumberField`; uint/int free input `BigNumberField`; string/hash free input `TextField`                                                                                                                                   |
| Selects: court, question type, Ongoing filter                                                                                                                            | `DropdownSelect`                                                                                                                                                                                                                                                                                                                    |
| Multiple-select composer (D-33)                                                                                                                                          | `Checkbox` per option                                                                                                                                                                                                                                                                                                               |
| Date picker (datetime free input, spec §5.12, D-17)                                                                                                                      | `Datepicker` with `time`, starting empty with a placeholder of today 00:00 UTC (`now("UTC")` from `@internationalized/date`); the picked `DateValue` is converted with `toDate` (in UTC when it carries no zone) and encoded as the chosen Unix timestamp                                                                           |
| File upload (spec §4.3, spec §5.14)                                                                                                                                      | `FileUploader` inside `AtlasFileField` (§8.3)                                                                                                                                                                                                                                                                                       |
| Evidence modal (spec §5.14)                                                                                                                                              | `Modal`                                                                                                                                                                                                                                                                                                                             |
| Search box (spec §5.2)                                                                                                                                                   | `NumberField` (min 0, placeholder "Dispute ID"); the label link is an `ExternalLink`                                                                                                                                                                                                                                                |
| Copiable addresses and hashes                                                                                                                                            | `Copiable`                                                                                                                                                                                                                                                                                                                          |
| Buttons                                                                                                                                                                  | `Button` (`isLoading` while a write is pending)                                                                                                                                                                                                                                                                                     |
| Toasts (create success spec §4.6)                                                                                                                                        | `PushMessage` via shell's `ToastProvider` and `useToast()`                                                                                                                                                                                                                                                                          |
| Tags (court on Ongoing cards)                                                                                                                                            | Not the library `Tag`, which is a button inside a card that is already a link (§3.4): a token-colored `span` in the v2 tag style                                                                                                                                                                                                    |

### 11.5 Screens and hierarchy

- **Case page (the most important screen)**, top to bottom: search row (label with Court link, ID field) → case header card (`h1` "Dispute #{id}", `PeriodBadge`, chain name, court, number of votes: the info row of spec §5.8) → compatibility banner when view-only (spec §5.5) → summary card (title `h2`, markdown description, parties, arbitrable-app link, attachment, evidence display) → timeline → decision alert → Reality notice → accordion (Appeal, Question, Evidence). The decision alert and the appeal panel are the actions users come for; on desktop the case header and summary share the reading column so the decision is above the fold for short descriptions.
- **Ongoing**: heading with the period filter on the right; a responsive grid (3/2/1 columns) of cards: `PeriodBadge`, `#id`, title (2 lines, ellipsis), court tag, countdown.
- **Create**: two steps shown with `Steps` (Form, Summary); the form in grouped `Box`es (Court and cost; Dispute; Question and options; Parties; Primary document); the summary as a key-value list with Return and Create.

---

## 12. Parity hooks (04 §1)

The Playwright extractor reads these attributes. Every `data-*` value is written by React (escaped). Values that are not plain text are attributes; text fields are read with `textContent` (accordion bodies are mounted while collapsed). `TestId` (`parity/types.ts`) is the union of every `data-testid` below; builders type their literals with it. `parity/index.ts` also exports `TEST_IDS`, `DATA_ATTRIBUTES`, `testId()`, `dataAttributes()` and one attribute builder per element below (`casePageAttributes`, `decisionAttributes`, `timelineColumnAttributes`, `votesAttributes`, `rulingOptionsAttributes`, `appealPanelAttributes`, `appealCardAttributes`, `evidenceItemAttributes`, `hiddenEvidenceCountAttributes`, `ongoingPageAttributes`, `ongoingCardAttributes`, `createPageAttributes`, `createCourtAttributes`, `createCostAttributes`, `createQuestionTypeAttributes`, `createOptionCountAttributes`, `fieldAttributes`).

### 12.1 Case page

| Snapshot field                | Element / attribute                                                                                                                                                                                                                                                     | Owner                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `exists`                      | `[data-testid="case-page"]` `data-state` = `dispute` \| `not-found` \| `no-arbitrator` \| `unavailable` \| `no-id` \| `loading`; `exists` ⇔ `dispute`                                                                                                                   | case-page               |
| `arbitrable`                  | `case-page` `data-arbitrable` (lowercase address)                                                                                                                                                                                                                       | case-page               |
| `family`                      | `case-page` `data-family` (`Family`, or `unknown`)                                                                                                                                                                                                                      | case-page               |
| `compatibility`               | `case-page` `data-compatibility` = `full` \| `view-only`; the banner `[data-testid="case-compat-banner"]`                                                                                                                                                               | case-page               |
| `title`                       | `[data-testid="case-title"]` text                                                                                                                                                                                                                                       | case-summary            |
| `question`                    | `[data-testid="case-question"]` text (Question panel); absent when null                                                                                                                                                                                                 | case-page               |
| `descriptionText`             | `[data-testid="case-description"]` text; the phase 5 extractor removes all whitespace from both sides before comparing (react-markdown 9 writes a newline text node between block elements where today's markup has none; no rehype plugin may strip those nodes, §9.2) | case-summary            |
| `rulingOptions`               | `[data-testid="case-ruling-options"]` `data-ruling-options` = JSON `{type, titles, reserved, precision}` (Question panel)                                                                                                                                               | case-page               |
| `period`, `lastPeriodChange`  | `case-page` `data-period`, `data-last-period-change` (Unix seconds)                                                                                                                                                                                                     | case-page               |
| `timeline.columns[]`          | `[data-testid="timeline-column"]` with `data-name` (`TimelineColumnName`) and `data-state`                                                                                                                                                                              | case-summary            |
| `numberOfVotes`               | `[data-testid="case-votes"]` `data-value`                                                                                                                                                                                                                               | case-summary            |
| `courtName`                   | `[data-testid="case-court"]` text                                                                                                                                                                                                                                       | case-summary            |
| `decision`                    | `[data-testid="case-decision"]` `data-kind` = `none` \| `jury-decision` \| `winner`, `data-won-by`; ruling text in `[data-testid="case-decision-ruling"]`                                                                                                               | case-summary            |
| `realityNotice`               | `case-page` `data-reality-notice` (`RealityNoticeKind`); the alert `[data-testid="case-reality-notice"]`                                                                                                                                                                | case-page, case-summary |
| `appealPanel.kind`            | `[data-testid="appeal-panel"]` `data-kind` (`AppealPanel["kind"]`; 04 §1's six plus `handled-by-arbitrable`, `withdraw-unsupported`)                                                                                                                                    | case-appeal             |
| `appealPanel.cards[]`         | `[data-testid="appeal-card"]` with `data-code` (decimal), `data-funded-percent`, `data-remaining-wei`, `data-deadline`; title in `[data-testid="appeal-card-title"]`                                                                                                    | case-appeal             |
| `appealPanel.withdrawableWei` | `appeal-panel` `data-withdrawable-wei` (decimal; set only for `withdraw`)                                                                                                                                                                                               | case-appeal             |
| `evidence[]`                  | `[data-testid="evidence-item"]` with `data-submitter`, `data-timestamp`; `[data-testid="evidence-title"]`, `[data-testid="evidence-description"]` (text compared with all whitespace removed, as `descriptionText`), `[data-testid="evidence-attachment"]` (its `href`) | case-evidence           |
| `hiddenEvidenceCount`         | `[data-testid="evidence-hidden-count"]` `data-count`                                                                                                                                                                                                                    | case-evidence           |
| `links.court`                 | `[data-testid="link-court"]` `href` (search label)                                                                                                                                                                                                                      | case-page               |
| `links.arbitrableApp`         | `[data-testid="link-arbitrable-app"]` `href`, absent when null                                                                                                                                                                                                          | case-summary            |
| `links.metaEvidenceFile`      | `[data-testid="link-meta-evidence-file"]` `href`: the summary's attachment link from meta-evidence `fileURI` (spec §5.6)                                                                                                                                                | case-summary            |
| `evidenceDisplay`             | `[data-testid="evidence-display"]` iframe: `src` (origin and params parsed from it), `sandbox`                                                                                                                                                                          | case-summary            |

### 12.2 Ongoing and Create

| Snapshot field                | Element / attribute                                                                                                                                                                                                  | Owner   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `chain`, `state`              | `[data-testid="ongoing-page"]` `data-chain`, `data-state` = `list` \| `empty` \| `no-arbitrator` \| `failed` \| `loading`                                                                                            | ongoing |
| `disputes[]`                  | `[data-testid="ongoing-card"]` `data-dispute-id`, `data-period`; `[data-testid="ongoing-card-title"]`, `[data-testid="ongoing-card-court"]`, `[data-testid="ongoing-card-countdown"]` (present ⇔ `countdownPresent`) | ongoing |
| `chain`, `available`          | `[data-testid="create-page"]` `data-chain`, `data-available`                                                                                                                                                         | create  |
| `courts[]`                    | `[data-testid="create-court"]` `data-options` = JSON array of names                                                                                                                                                  | create  |
| `defaultCost`                 | `[data-testid="create-cost"]` `data-wei`                                                                                                                                                                             | create  |
| `questionTypes[]`             | `[data-testid="create-question-type"]` `data-options` = JSON array of labels                                                                                                                                         | create  |
| `optionRange`                 | `[data-testid="create-option-count"]` `data-min`, `data-max`                                                                                                                                                         | create  |
| `validation.requiredFields[]` | every field wrapper `data-field` (name) and `data-required="true"`                                                                                                                                                   | create  |

---

## 13. Dependencies added by the foundation

| Package                   | Range                             | Why                                                                                                                                                                                              |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-markdown`          | `9.1.0`                           | The markdown renderer of §9.2. Already in the lockfile as the UI library's dependency, so no new transitive package; web imports it, so it must be declared (C14) rather than found by hoisting. |
| `@fontsource/open-sans`   | `^5`                              | Self-hosted Open Sans, the v2 typeface (A20: no CDN fonts; `font-src 'self'`).                                                                                                                   |
| `@internationalized/date` | the UI library's range (`^3.7.0`) | `DateValue` construction for the library's `Datepicker` (datetime appeal input, D-17). Already in the lockfile through the library; declared because web imports it.                             |

Considered and not needed: `iframe-resizer` (§9.3), an identicon or Blockies package (`Identicon` in `ui/`), `react-error-boundary` (a 30-line class), a toast library (`PushMessage`), `remark-gfm` (§9.2), `jose` (§8.2), a dropzone (`FileUploader`), a date library (`@internationalized/date` plus `Intl`), `@tanstack/query-sync-storage-persister` (`data/persistence.ts` implements the `Persister` itself, §5.4; removed from `package.json`).

## 14. Requests to the orchestrator

1. (Done: the lint rules of §1.4 are in the root `eslint.config.mjs`.)
2. (Withdrawn: the receipt client stays in `data/`, §6.4.)
3. (Recorded: the C8 operator item of §2.3 is K-01 in `docs/ledger-proposals.md`, with K-02 and K-03, for checklist §D.)
4. (Recorded: P-02, refresh set after a write, §5.6, and P-03, network switching from the unsupported-network screen and the header, §3.5, are in `docs/ledger-proposals.md`.)
