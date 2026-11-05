[![Netlify Status](https://api.netlify.com/api/v1/badges/e6238990-c148-433c-8007-46680779c8b3/deploy-status)](https://app.netlify.com/sites/dispute-resolver/deploys)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)

[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)

[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=bugs)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)

# Dispute Resolver

The Kleros Dispute Resolver ([resolve.kleros.io](https://resolve.kleros.io)) is a general purpose arbitrable application for Kleros v1 arbitration.

- Create disputes by filling a form.
- List open disputes.
- See dispute details, the evidence and the ruling.
- Submit evidence.
- Fund appeals and withdraw rewards.

Viewing works for every dispute. Evidence submission and crowdfunded appeals are guaranteed for arbitrables that implement [IDisputeResolver](https://github.com/kleros/dispute-resolver-interface-contract); the other arbitrable families the app recognizes, and what each supports, are the `Family` and `Capabilities` types of [packages/core/src/families](packages/core/src/families/types.ts), with the per-address exceptions in [packages/core/src/registry](packages/core/src/registry). See the deployed arbitrable proxies [here](https://github.com/kleros/binary-arbitrable-proxy/blob/master/src/ethereum/network-contract-mapping.js).

The app is built with Vite, React 18, viem and wagmi with Reown AppKit, and `@kleros/ui-components-library`.

## Requirements

- Node 22: Netlify and CI build with its newest release (`.nvmrc`, `.node-version`, `netlify.toml` and CI name the line, not a patch). The `volta` field of `package.json` pins 22.23.4 for local work, and `engines` requires at least 22.23.4.
- Yarn 4.9.2 (the `packageManager` field; enable it with `corepack enable`).

## Install and commands

```bash
yarn install
yarn typecheck
yarn lint
yarn test
yarn build
yarn workspace @dispute-resolver/web dev
```

`yarn build` writes the site to `packages/web/dist`. `yarn workspace @dispute-resolver/web preview` serves a built copy locally.

## Workspace layout

| Path             | Package                  | Content                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`  | `@dispute-resolver/core` | The arbitrable registry and family detection, URL and CID rules, chain reads through an injected client, the Reality.eth pipeline, the meta-evidence and evidence pipelines, appeal math, write-call builders and allowlists. No React, no DOM. Its operator scripts (`packages/core/scripts/`) are the RPC pre-flight, the Reality.eth known-questions generator and the recorders of the governor-multiplier and meta-evidence-event fixtures. |
| `packages/web`   | `@dispute-resolver/web`  | The React app, the dynamic-script runner page (`public/__runner/index.html`) and its host, the Netlify headers (`public/_headers`), the build plugins (`vite-plugins/`) and the Playwright suites (`e2e/`).                                                                                                                                                                                                                                      |
| `REALITY_OPS.md` |                          | How to maintain the Reality.eth registry and its known-question map.                                                                                                                                                                                                                                                                                                                                                                             |
| `CLAUDE.md`      |                          | The guide for AI agents working on the code.                                                                                                                                                                                                                                                                                                                                                                                                     |

## Environment variables

Vite reads the `.env` file at the repository root and the process environment (the environment wins); only `REACT_APP_*` names reach the app. Start from `.env.example`, which lists every variable without values. The values are built into the public bundle, but RPC URLs carry API keys: never commit, log or paste them.

| Variable                              | Purpose                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REACT_APP_WALLETCONNECT_PROJECT_ID`  | Reown (WalletConnect) project ID. Without it the app boots read-only and no wallet can connect.                                                                                                                                                       |
| `REACT_APP_ATLAS_URI`                 | Atlas endpoint for sign-in and IPFS uploads (an `https:` URL); unset or invalid shows uploads as unavailable.                                                                                                                                         |
| `REACT_APP_METAEVIDENCE_URL`          | Meta-evidence locator API. A dispute whose `MetaEvidence` event is found on chain renders from that event's URI and only compares it with the API; without the event, the API supplies the URI, and unset leaves those disputes' details unavailable. |
| `REACT_APP_IPFS_GATEWAY`              | IPFS gateway origin (a bare `https:` origin); defaults to `https://cdn.kleros.link`.                                                                                                                                                                  |
| `REACT_APP_WEB3_PROVIDER_URL`         | Read RPC of Ethereum Mainnet (1).                                                                                                                                                                                                                     |
| `REACT_APP_WEB3_XDAI_PROVIDER_URL`    | Read RPC of Gnosis (100).                                                                                                                                                                                                                             |
| `REACT_APP_WEB3_CHIADO_PROVIDER_URL`  | Read RPC of Gnosis Chiado (10200).                                                                                                                                                                                                                    |
| `REACT_APP_WEB3_SEPOLIA_PROVIDER_URL` | Read RPC of Ethereum Sepolia (11155111).                                                                                                                                                                                                              |
| `REACT_APP_UNICHAIN`                  | Read RPC of Unichain (130).                                                                                                                                                                                                                           |
| `REACT_APP_UNICHAIN_SEPOLIA`          | Read RPC of Unichain Sepolia (1301).                                                                                                                                                                                                                  |
| `REACT_APP_WEB3_POLYGON_PROVIDER_URL` | Read RPC of Polygon (137).                                                                                                                                                                                                                            |
| `REACT_APP_ARBITRUM_ONE`              | Read RPC of Arbitrum One (42161).                                                                                                                                                                                                                     |
| `REACT_APP_ARBITRUM_SEPOLIA`          | Read RPC of Arbitrum Sepolia (421614).                                                                                                                                                                                                                |
| `REACT_APP_OPTIMISM_SEPOLIA`          | Read RPC of Optimism Sepolia (11155420).                                                                                                                                                                                                              |
| `REACT_APP_BASE`                      | Read RPC of Base (8453).                                                                                                                                                                                                                              |
| `REACT_APP_BASE_SEPOLIA`              | Read RPC of Base Sepolia (84532).                                                                                                                                                                                                                     |

zkSync Era (324) and zkSync Era Sepolia (300) have no read RPC variable; they use their public endpoints. Reads always go through the chain's read RPC; the wallet only signs. The chain table that declares these names is `packages/core/src/chains/table.ts`.

**Reown dashboard.** AppKit applies the Reown dashboard's settings of the project behind `REACT_APP_WALLETCONNECT_PROJECT_ID` over the app's own. That project must have social login, email, swaps and onramp disabled; when the dashboard enables an embedded wallet anyway, the app refuses wallet connection and stays read-only.

## Deploy on Netlify

`netlify.toml` configures the site:

- Build command: `yarn build` (the newest Node 22 and Yarn 4.9.2, dependencies installed with lifecycle scripts disabled).
- Publish directory: `packages/web/dist`.
- Headers: `packages/web/public/_headers`, copied to `dist/_headers` by the build, which fills in the app's report-only Content-Security-Policy from the configured endpoints. It holds the app's policies and the separate policy of the script runner page (`/__runner/`).
- Every path is rewritten to `/index.html` for the client-side router.

Set the environment variables above in the Netlify site settings.

## Tests

- **Unit and component tests**: `yarn test` (Vitest in both packages, plus the Node tests of `packages/web/scripts`). They never touch the network.
- **Bundle check**: `yarn check:bundle`, after `yarn build`, fails when the built site carries a test double, loads a script or stylesheet from another origin, has an inline script, or lacks a file the deploy needs.
- **Script runner, cross-engine**: `yarn workspace @dispute-resolver/web e2e:runner` runs `packages/web/e2e/runner` in Chromium, Firefox and WebKit against the built app.
- **Other browser tests**: `yarn workspace @dispute-resolver/web e2e` runs every spec in Chromium: the runner, the app's flows on a routed network with an injected wallet (`e2e/app`) and the deploy's response headers (`e2e/deploy`, which runs only when `DR_E2E_DEPLOY_URL` names a deploy's origin).
  Playwright builds the app and serves it with `vite preview` itself. Browsers are installed on demand: `yarn workspace @dispute-resolver/web playwright install chromium` (add `firefox webkit` for the runner suite).
- **RPC pre-flight**: `yarn rpc:preflight` checks every configured read RPC endpoint against live chains (the `eth_getLogs` range and the opaque-origin CORS the script runner needs). It reads `.env` and prints only results, never the URLs. It is run on demand, not in CI.
- **Reality.eth known-question map**: `yarn workspace @dispute-resolver/core reality:known-questions:check` compares the committed map with the chain data (see [REALITY_OPS.md](REALITY_OPS.md)).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, build and the bundle check on pull requests and pushes to the branches it lists, plus a dependency audit; CodeQL scans the code. SonarCloud analyzes every pull request.

## Reporting an Issue

Please open up a Github issue describing your problem and if it's urgent reach out to [me](https://github.com/0xferit) via email or [Telegram](https://t.me/ftunc).
