# `@dispute-resolver/core` modules

The public contract of `packages/core` for the phase 2 builders. Each module below is one directory under `src/`, owned by one builder. The contract is `docs/parity/` (frozen 2026-10-14) and `docs/adr/`; IDs in brackets point there: `§n` is `02-behavioral-spec.md`, `A`/`B`/`C` rows are `03-security-checklist.md`, `D-nn` entries are `05-deviations-ledger.md`, `06 §n` is `06-registry-schema.md`, `04 §1` is the parity snapshot.

## Rules for every builder

- **Types are already written.** Each module owns `src/<module>/types.ts`; `src/types.ts` owns the cross-cutting primitives (`ChainId`, `Address`, `Hex`, `RegistryKey`, `UnixSeconds`, `Env`, `ReadClient`, `GetReadClient`, `Fetcher`, `FetchInit`, `FetchResponse`, `ScriptParameters`, `ScriptKind`, `ScriptRunRequest`, `ScriptResult`, `ScriptRunner`, `Period`, `Unavailable`, `UnavailableCode`, `Outcome`, `WriteKind`, `WriteCall`). Change a type you do not own only through the orchestrator. Add private types freely inside your module.
- **Signatures below are binding.** Name, parameter order, parameter and return types. Internal helpers are free. A function you need from another module that is not listed here is a request to the orchestrator, not a local copy.
- **Imports.** Primitives from `../types`; another module's types from `../<module>/types`; another module's functions from `../<module>` (its `index.ts`). Never import from `src/types.ts` for module-owned types, never import a higher layer, never import the old app.
- **Untrusted values are `unknown`** until a Zod schema or a named parser accepts them. No `any`. No `window`, `document`, storage, `process.env` or `import.meta.env` (lint enforces it); everything is injected. The one exception is operator tooling under `packages/core/scripts/` (the known-questions generator), which reads `process.env` and the repository's `.env` and is never imported by `src/`.
- **Failures.** A function that reads the network returns `Outcome<T>` (or a module-specific union) when the failure is a normal degraded state (D-36), and rejects only where noted. No fake fallback data (D-36): today's fallback structs (`numberOfChoices: "2"`, zero periods, `{}` contributions) are not reproduced.
- **Addresses from the chain** (`readContract` results, decoded log arguments, the EIP-1967 slot) are viem `0x${string}`; each passes through `toRegistryAddress` before it becomes a core `Address`, because registry lookups and `ArbitratedBinding` rely on lowercase (B21).
- **`@reality.eth/reality-eth-lib`** ships its own declarations; import from `@reality.eth/reality-eth-lib/formatters/question.js` (and `…/template.js`). Its parameters are typed `any`: wrap each call in a typed local function in `rulings` or `reality`, never leak `any`.
- **Amounts** are `bigint` wei; **block numbers** `bigint`; **timestamps** `UnixSeconds`; **dispute IDs** `bigint`.
- **Tests first**, named after the row or entry they prove (`it("B2: rejects /ipfs/<cid>/../../ipns/x")`). Unit tests never touch the network: a `ReadClient` is `createPublicClient({ transport: custom({ request }) })` answering from fixtures; a `Fetcher` is a stub. Recorded chain data lives in `src/<module>/__fixtures__/` with the block number it was read at.

## Layers

A module imports only from modules in lower layers. `src/types.ts` is a barrel, not a layer: it defines the primitives (layer 0) and re-exports every module's types for `index.ts`.

| Layer | Modules                           | May import                                                                                                                                         |
| ----- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `src/types.ts` primitives         | `viem` types                                                                                                                                       |
| 1     | `chains`, `abi`, `uri`, `rulings` | layer 0                                                                                                                                            |
| 2     | `registry`, `rpc`                 | `registry`: `chains`, `uri`. `rpc`: `chains`                                                                                                       |
| 3     | `families`, `reality`             | `families`: `abi`, `registry`. `reality`: `abi`, `registry`, `rpc`, `rulings`                                                                      |
| 4     | `metaEvidence`, `evidence`        | `metaEvidence`: `chains`, `uri`, `registry`, `rpc`, `rulings`, `reality`. `evidence`: `chains`, `abi`, `uri`, `registry`, `rpc`                    |
| 5     | `disputes`                        | `chains`, `abi`, `uri`, `rpc`, `rulings`, `registry`, `families`, `metaEvidence`, `evidence` (types)                                               |
| 6     | `appeals`, `create`               | `appeals`: `abi`, `rpc`, `rulings`, `registry`, `families`, `disputes`. `create`: `chains`, `abi`, `uri`, `rpc`, `registry`, `rulings`, `disputes` |
| 7     | `writes`                          | `chains`, `abi`, `uri`, `families`, `disputes` (types), `appeals` (types)                                                                          |

The table binds module code. Tests, `testHelpers.ts` and `__fixtures__/` may share recorded data and helpers across layers (`abi/__fixtures__/bytecode.ts` and `disputes/testHelpers.ts` read `families/__fixtures__/`, `rpc/getLogsChunked.test.ts` reads an `appeals` fixture, `appeals` and `writes` test helpers use `families` and `registry`).

Two splits differ from the task's list, for these reasons:

- **`rulings` (new, layer 1).** `RulingOptions` is produced by two modules (`reality`'s on-chain derivation and `metaEvidence`'s schema) and consumed by four (`disputes`, `appeals`, `create`, `writes`). `reality` sits below `metaEvidence`, so neither producer can own it without a cycle. The same module holds the ruling formatter of §5.9 and the answer encoders of §5.12 / D-15 / D-16 / D-17, which both `disputes` (decision text) and `appeals` (card titles, free-input codes) need.
- **`disputes` above `metaEvidence` and `evidence`, below `appeals`.** `DisputeView` carries the Reality notice (from `metaEvidence`), and its decision needs the current round's funded rulings (from `appeals`). The decision builder takes those rulings as a plain `readonly bigint[]`, so `disputes` never imports `appeals`; `web` passes `appeals.readRoundFunding(...)`'s `fundedRulings` in. The ERC-1497 `Dispute` event is read by `evidence` (it holds the evidence group); `disputes` takes its block number as an input.

Typical composition in `web` for the case page: `disputes.lookupDispute` → `families.detectFamily` (with `binding.arbitrated`) → in parallel `metaEvidence.loadMetaEvidence`, `evidence.readDisputeEvent` then `evidence.loadEvidence`, `disputes.readDisputeDetails`, `disputes.listCourts` → `appeals.readMultipliers` / `appeals.readRoundFunding` / `appeals.readWithdrawable` by period → `disputes.buildDisputeView` and `appeals.buildAppealPanel` → on user action, `writes.checkChainMatch` then a `writes.build*` call.

---

## `chains` (layer 1)

The chain table and everything derived from a chain ID: config, RPC URL resolution from `Env`, explorer links, currency. Implements §1.3, §6.3 (lookback and deploy blocks), §7 minus D-23, D-10, D-18, D-35, D-40, D-56, A13 (config half), B5 and B6 (chain-ID validation).

```ts
export const CHAINS: ChainTable;
export const DEFAULT_CHAIN_ID: ChainId; // 1, the target of chain-less redirects (D-01)
export function getChain(chainId: ChainId): ChainConfig | undefined;
export function parseChainId(input: unknown): ChainId | undefined;
export function chainCapabilities(chain: ChainConfig): ChainCapabilities;
export function resolveReadRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution;
export function resolvePublicRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution;
export function currencySymbol(chain: ChainConfig): string;
export function explorerAddressUrl(chain: ChainConfig, address: Address): string | null;
export function explorerTxUrl(chain: ChainConfig, hash: Hex): string | null;
export function ongoingScanStart(chain: ChainConfig, head: bigint): bigint;
```

- `CHAINS` holds the 14 chains of §7 after D-23 and P-13 (1, 100, 10200, 11155111, 130, 1301, 137, 300, 324, 42161, 421614, 11155420, 8453, 84532; Redstone, 690, is dropped), with today's names, addresses (lowercased), currency (§7 "Other per-chain configuration"), testnet flag (the §7 testnet set minus 5 and 80001), `maxLookback`, `arbitratorDeployedAtBlock` (today's `QUERY_FROM_BLOCK`; chains without an arbitrator copy chain 1's or Sepolia's value as today, and 84532 gets Sepolia's, fixing the `"111155111"` key typo per D-23), `readRpcEnv` (today's variable names, §7 table), `defaultRpcUrl` for 300 and 324 only, `publicRpcEnv` `REACT_APP_PUBLIC_RPC_<chainId>` on every chain, and `explorerBaseUrl` for every chain (D-40).
- `parseChainId` accepts a number that is a safe integer, or a string of ASCII digits with no sign, whitespace or leading zero; it returns the ID only when `CHAINS` has it, otherwise `undefined`. It is the single parser for the URL segment (§1.3, A19), meta-evidence `arbitratorChainID`/`arbitrableChainID` (B5, B6) and any other untrusted chain ID. `"1</script>"`, `"1.0"`, `"01"`, `" 1"`, `10` (Optimism, unconfigured) all yield `undefined`.
- `chainCapabilities`: `hasArbitrator` iff `klerosLiquid` is set; `canCreate` iff `arbitrableProxy` is set (§4.2, §7).
- `resolveReadRpcUrl`: `env[readRpcEnv]` trimmed and non-empty wins; else `defaultRpcUrl`; else `unconfigured` (D-56: no wallet fallback, no public default). It never throws, for any chain (D-18).
- `resolvePublicRpcUrl`: `env[publicRpcEnv]` trimmed and non-empty, else the read RPC resolution (D-35). This is the only URL given to third-party frames and scripts.
- `currencySymbol` returns `chain.currency` (D-10: used for every amount, including withdraw and escrow appeal labels).
- `explorerAddressUrl` / `explorerTxUrl` return `${explorerBaseUrl}/address/${address}` and `/tx/${hash}`, or `null` without an explorer.
- `ongoingScanStart` returns `max(arbitratorDeployedAtBlock ?? 0, head − maxLookback, 0)` (§6.3, the Ongoing list window).

Tests: `chains/table.test.ts` (D-23 membership, D-10 currencies, lookbacks, deploy blocks, lowercase addresses), `chains/parseChainId.test.ts` (B5, B6, §1.3 vectors), `chains/rpc.test.ts` (D-56 unset variable, zkSync literals, D-35 default and override, D-18 never throws), `chains/explorer.test.ts` (D-40 per chain).

## `abi` (layer 1)

Minimal `as const` ABIs and the probe selectors. Data only, no functions. Implements 06 §1 (selector list) and the ABI half of §6.1/§6.2/§6.3.

```ts
export const klerosLiquidAbi; // disputes, getDispute, currentRuling, appealPeriod, appealCost, arbitrationCost, courts, getSubcourt;
// events DisputeCreation, NewPeriod, AppealDecision
export const policyRegistryAbi; // policies(uint256)
export const arbitrableProxyAbi; // createDispute(bytes,string,uint256), submitEvidence(uint256,string)
export const idrV2Abi; // externalIDtoLocalID, getMultipliers, fundAppeal(uint256,uint256), getTotalWithdrawableAmount(uint256,address,uint256),
// withdrawFeesAndRewardsForAllRounds(uint256,address,uint256), events Contribution, RulingFunded
export const idrV1Abi; // getTotalWithdrawableAmount(uint256,address,uint256[]), withdrawFeesAndRewardsForAllRounds(uint256,address,uint256[])
export const idrLegacyFundAppealAbi; // fundAppeal(uint256,uint256) and fundAppeal(uint256,uint8)
export const escrowV1Abi; // disputeIDtoTransactionID(uint256), appeal(uint256), submitEvidence(uint256,string)
export const governorAbi; // submitEvidence(string), fundAppeal(uint256), withdrawFeesAndRewards(address,uint256,uint256,uint256),
// getContributions(uint256,uint256,address), getRoundInfo(uint256,uint256), getCurrentSessionNumber(),
// winnerMultiplier(), loserMultiplier(), MULTIPLIER_DIVISOR() (D-47), sharedMultiplier() (P-05)
export const multiplierGetterAbi; // the single-getter fallbacks of §10.9
export const realityAbi; // templates(uint256); events LogNewQuestion, LogNewTemplate (v2 and v3 share them)
export const realityProxyAbi; // arbitrationCreatedBlock(uint256); events DisputeIDToQuestionID, ArbitrationCreated
export const erc792Abi; // IArbitrator: arbitrationCost, appealCost; events DisputeCreation, AppealDecision
export const erc1497Abi; // events MetaEvidence, Evidence, Dispute
export const SELECTORS: Readonly<Record<ProbeSignature, Hex>>;
export const EIP1967_IMPLEMENTATION_SLOT: Hex; // 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

Each constant is declared `as const satisfies Abi` so viem infers argument and return types. Only the entries listed are included. The governor's exact signatures come from the verified source of the deployed governors (poh.eth, ubi-voting.eth, fork-dao.eth, kleros.eth).

Tests: `abi/artifacts.test.ts` checks every embedded entry against the published artifacts (`@kleros/kleros`, `@kleros/arbitrable-proxy-contracts`, `IDRv1`, `IDRv2`, `@kleros/kleros-interaction`), entry by entry (name, inputs, outputs, indexed flags, mutability); `abi/selectors.test.ts` recomputes every `SELECTORS` value with `toFunctionSelector` from the artifacts (06 §1: "computed rather than hardcoded") and asserts the 06 §1 values (`0x2fbe3b03`, `0xc21ae061`, `0xbac91e2e`, `0xa6a7f0eb`, `0xa446ff57`, `0x6c0b7e71`, `0x56858619`, `0x68c76ffd`, `0x8a9bb02a`, `0xec85635b`, `0xc25516e9`, `0x4b2f0ea0`), and P-05's `sharedMultiplier()` as `0xce1d8ab2`, carried by every recorded governor.

## `uri` (layer 1)

The one canonical IPFS path normalizer and every rule that turns an untrusted URI into something fetched or linked. Implements A3, A9, A10, B2, B18, B19, D-24, D-26, D-28, D-32 and the URI half of B7, B16, §9.4 (display source).

```ts
export function normalizeIpfsPath(input: unknown): CanonicalIpfsPath | null;
export function isContentAddressed(input: unknown): boolean;
export function toCidPath(path: CanonicalIpfsPath): CidPath;
export function resolveGateway(env: Env): GatewayOrigin;
export function gatewayUrl(path: CanonicalIpfsPath, gateway: GatewayOrigin): string;
export function reserveThroughGateway(url: string, gateway: GatewayOrigin): string | null;
export function resolveDisplayUrl(uri: unknown, gateway: GatewayOrigin): string | null;
export function isSafeNavigationUrl(url: unknown): boolean;
export function toAttachmentLink(uri: unknown, gateway: GatewayOrigin): AttachmentLink | null;
export function isSelfLink(url: string, hosts: SelfHosts): boolean;
export function resolveArbitrableAppLink(uri: unknown, hosts: SelfHosts): string | null;
export function attachmentKind(pathOrUrl: string): AttachmentKind;
export function lastPathSegment(uri: string): string;
export function policyFetchUrl(uri: string, gateway: GatewayOrigin): string | null;
```

- `normalizeIpfsPath` is the only content-addressing rule in the codebase (B18). Steps: reject non-strings; trim, then reject C0 control characters, DEL, lone surrogates and any backslash, raw or percent-encoded (B2; C1 controls are kept and stored percent-encoded, spec 5.14), as today's `isContentAddressed`; strip today's prefixes (spec 9.1 step 2): an `ipfs:` or `fs:` scheme with any number of slashes, then an optional `/` and an optional `ipfs/`, so `/<CID>`, `ipfs:<CID>`, `ipfs://<CID>`, `ipfs://ipfs/<CID>`, `fs:/ipfs/<CID>`, `/ipfs/<CID>` and `ipfs/<CID>` are accepted, and a bare CID too; anything else (`/ipns/`, `http(s)://`, another host) is rejected (meta-evidence URIs keep today's rule, D-26). Drop the query and fragment. Split into segments, percent-decode each once (reject on malformed escapes or a decoded `/`, backslash, C0 control character or DEL), resolve `.` and `..` (RFC 3986 §5.2.4); reject when `..` climbs above the first segment. The first segment must then be a CIDv0 (`Qm` + 44 base58) or base32 CIDv1 (`b` + at least 50 of `[a-z2-7]`). Empty segments and the trailing slash are removed, and every other segment is stored percent-encoded once, so the result is a fixed point. The result is `/ipfs/<CID>[/<seg>…]`. `/ipfs/<CID>/../../ipns/x`, its `%2e%2e` and backslash variants return `null` (B2, D-24).
- `isContentAddressed(x)` is `normalizeIpfsPath(x) !== null` (A3).
- `toCidPath` drops the `/ipfs/` prefix: the allowlist form (06 §3 invariant 4).
- `resolveGateway` returns `env.REACT_APP_IPFS_GATEWAY` when it parses as an `https:` origin (trailing slash removed), else `https://cdn.kleros.link` (§6.4).
- `gatewayUrl` concatenates gateway and path without re-encoding: `normalizeIpfsPath` already stores each segment percent-encoded once, so Gnosis 416's `%20` stays `%20` (never `%2520`).
- `reserveThroughGateway` (D-26): for an absolute `https:` URL whose path, after dot-segment resolution, begins `/ipfs/<CID>`, returns the gateway URL of the normalized path; for any other input returns `null`. Never applied to meta-evidence, evidence or script URIs, which must already be canonical.
- `resolveDisplayUrl` (§9.4 source, D-26, A8's `https:` rule): a canonical IPFS path goes through the gateway; an absolute URL is first offered to `reserveThroughGateway`, else used as is; the result must parse as `https:`, else `null`. Any https host is allowed for displays (B19 accepted).
- `isSafeNavigationUrl` (A9): true only for an absolute URL that parses with protocol `https:`; protocol-relative `//host`, `http:`, `javascript:`, `data:` are false.
- `toAttachmentLink` (A10, B19, D-32): empty → `null`; a canonical IPFS path or a bare path the old `getFormattedPath` would map to `/ipfs/…` that passes `normalizeIpfsPath` → gateway `link`; an `https:` URL → `reserveThroughGateway` or the URL itself as `link`; anything else (including `http://`) → `text`. `label` is `lastPathSegment`, `attachmentKind` from the extension.
- `isSelfLink` (D-28): true when the URL's host name equals the host name of `hosts.appHost` or of one of `hosts.canonicalHosts`, compared lowercase, exact match (no substring), with one final `.` removed from both sides so the fully qualified spelling `resolve.kleros.io.` is the same host; ports are ignored, so a dev server's `localhost:5173` matches its own links.
- `resolveArbitrableAppLink` (§5.6, D-28): the URL when `isSafeNavigationUrl` and not `isSelfLink`, else `null`.
- `attachmentKind`: image, video, text or other from the last segment's extension (today's icon table in `evidenceTimeline.js`).
- `policyFetchUrl` (§6.4 court policies, P-17): an `https:` URL as is; a path through `normalizeIpfsPath` and the gateway; else `null`. Today's "contains `http`" test becomes "is https or a canonical IPFS path"; the old `%20`-encoded path of Gnosis 416 must still resolve.

Tests: `uri/normalize.test.ts` (A3, B2, B18, D-24: `ipfs://`, `fs:`, `/ipfs/`, bare CID, trailing slash, dot segments, `%2e%2e`, backslash, `/ipns/`, CIDv0/CIDv1 shapes), `uri/gateway.test.ts` (D-26 with the T2CR URL `https://ipfs.kleros.io/ipfs/QmYs17m…/index.html` and the dot-segment variant), `uri/links.test.ts` (A9, A10, B19, D-28, D-32), `uri/display.test.ts` (§9.4 source rule).

## `rulings` (layer 1)

Ruling options, ruling text and answer encoding. Depends on `@reality.eth/reality-eth-lib` (`getAnswerString`, `answerToBytes32`). Implements §5.9 (formatting), §5.12 (card titles and codes), §5.13 (option codes), D-15, D-16, D-17.

```ts
export const REFUSED_RULING_TEXT: string; // "invalid / refused to arbitrate / tied"
export function asQuestionType(type: string): QuestionType | null;
export function isVariableType(type: string): type is VariableQuestionType;
export function formatRuling(ruling: bigint, options: RulingOptions | null, fallback: FallbackOutcomes): string;
export function encodeAnswer(input: AnswerInput, options: RulingOptions): AnswerEncoding;
export function decodeRulingCode(code: bigint, options: RulingOptions, fallback: FallbackOutcomes): string;
export function combinationTitle(combination: bigint, titles: readonly string[]): string;
export function combinationCode(selectedIndexes: readonly number[]): bigint;
export function reservedCode(hexKey: string): bigint | null;
export function parsePrecision(value: unknown): number | undefined;
export function toText(value: unknown): string;
```

- `formatRuling` (§5.9): ruling 0 → `REFUSED_RULING_TEXT`; type `hash` → `0x` + 64 hex digits; with `options` → `getAnswerString({decimals: precision, outcomes: titles, type}, padToBytes32(ruling − 1))`; only when `options` is `null` (§5.9 "without `rulingOptions`") → `fallback[ruling − 1]` or the decimal value, so uint, int and datetime rulings, which have no titles, are still formatted (1658); any formatter error → the decimal value. Never throws.
- `encodeAnswer` (§5.12 code table with D-15, D-16, D-17): `uint` → `answerToBytes32(value, {decimals: precision ?? 18}) + 1` (precision 0 respected); `int` → reality-eth-lib's two's-complement encoding of the full range, plus 1, modulo 2²⁵⁶; `string` → UTF-8 bytes as an unsigned integer, no +1 (parity); `datetime` → `timestamp + 1` with the chosen time kept; `hash` → `BigInt(value) + 1`. Bad input returns an error code, never throws (D-14).
- `decodeRulingCode`: title of a contributed variable-type key (§5.12 item 6): UTF-8 decode for `string`, 64-digit hex for `hash`, else `formatRuling`.
- `combinationTitle` (§5.12 item 4): `0n` → "None", else the titles of the set bits joined by a space. `combinationCode` → bitmask + 1.
- `reservedCode`: a reserved key (`0x…`) as a bigint, `null` when not hex.
- `parsePrecision` (A7): the one reading of an untrusted `precision` (meta-evidence) or `decimals` (Reality.eth question), so the precision shown and the precision encoded are one value: absent when `Number(value)` is not finite (today's sanitizer) or for a falsy value other than the number 0 (`null`, `false`, `""`: today's `precision || 18` encodes them with the default); otherwise reality-eth-lib's `parseInt(String(value))` with its radix inference (base 16 after a `0x` prefix), 0 when not positive (`true` → 0, `"1e2"` → 1, `"6"` → 6, `"0x12"` → 18). Used by `reality` and `metaEvidence`; not in the public surface.
- `toText` (A5, A7): today's `String(value)` coercion of untrusted option titles and descriptions, made total: a value `String` cannot convert (`{"toString": 1}`) is named by its class (`"[object Object]"`). Both producers of ruling options (`metaEvidence`'s schema and `reality`'s derivation, including its unsafe rendering used only for the divergence flag) title untrusted values with it. Not in the public surface.

Tests: `rulings/format.test.ts` (§5.9 incl. Gnosis 0's bitmask ruling 5, mainnet 1657's max-uint ruling, 1658's uint), `rulings/encode.test.ts` (D-15 `decimals: 0`, D-16 negative ints, D-17 datetime keeps time, string and hash parity), `rulings/combinations.test.ts`, `rulings/questionTypes.test.ts` (§5.13, D-04), `rulings/precision.test.ts` (A7: the library's reading, the dropped values, one precision for display and encoding).

## `registry` (layer 2)

The registry data of 06 §2 and its lookups. Invariants live in tests. Implements ADR 0003, 06 §2–§4, A1, B6 (mitigation), B21, C12, D-12, D-27, D-28 (canonical hosts), D-34.

```ts
export const REGISTRY: Registry;
export function toRegistryAddress(input: unknown): Address; // implemented (moved from src/index.ts)
export function registryKey(chainId: ChainId, address: Address): RegistryKey;
export function getRealityProxy(registry: Registry, chainId: ChainId, arbitrable: Address): RealityProxyEntry | undefined;
export function getOverride(registry: Registry, chainId: ChainId, arbitrable: Address): BehaviorOverride | undefined;
export function isScriptAllowed(registry: Registry, arbitratorChainId: ChainId, scriptUri: unknown): boolean;
export function displayAllowlistKey(metaEvidenceArbitrableChainId: unknown, arbitratorChainId: ChainId): ChainId;
export function isDisplayAllowlisted(registry: Registry, key: ChainId, arbitrable: Address): boolean;
```

- `REGISTRY` transcribes, lowercased: today's `REALITY_PROXIES` (29 entries, fields unchanged, plus a `justification`), `overrides` with the single Unslashed entry `1:0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38` (`roundIndexOffset: 1`, `refuseToArbitrateFundable: false`, D-30), `dynamicScriptAllowlist` from `dynamicScriptWhitelist.js` in `CidPath` form minus `Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf` (D-25), `displayAllowlist` equal to today's `arbitrableWhitelist` (Reality addresses included), `defaultScriptCid`, `canonicalHosts: ["resolve.kleros.io"]`. `0xb9f9b5ee…` appears nowhere (D-27).
- `toRegistryAddress` parses an untrusted string with `isAddress` and lowercases it; throws otherwise.
- `getRealityProxy` / `getOverride` look up `registryKey(chainId, arbitrable)`; the address is already lowercase by type.
- `isScriptAllowed` (A1): `normalizeIpfsPath(scriptUri)` then exact match of `toCidPath` against `dynamicScriptAllowlist[arbitratorChainId]`; any chain without a list rejects every script.
- `displayAllowlistKey` (B6, D-34): `parseChainId(metaEvidenceArbitrableChainId)` when it yields a configured chain, else `arbitratorChainId`.
- `isDisplayAllowlisted`: membership in `displayAllowlist[key]`. Display flags only; no role in sandboxing scripts or detecting families.

Tests: `registry/address.test.ts` (exists), `registry/invariants.test.ts` (06 §3 invariants 1, 2, 3, 4, 7; C12; invariant 3 reads `CHAINS`), `registry/snapshot.test.ts` (06 §3 invariant 5 and A1's list snapshot, against `registry/__fixtures__/today-allowlists.json` transcribed once from the old app and reviewed), `registry/lookups.test.ts` (A1 three cases plus dot-segment and percent-encoded variants; D-34 non-integer and unconfigured keys fall back; B21 lowercase).

## `rpc` (layer 2)

Read clients per chain from `ChainConfig` and `Env` over viem `http` transports, a shared request budget, the forward chunked `getLogs` used by every event scan, and the one classifier of failed reads. Implements A13, D-02 (scan helper), D-36 and D-53 (contract versus transport failure), D-56, §6.3 range handling.

```ts
export class LookupLimitError extends Error {}
export function createReadClient(chain: ChainConfig, env: Env, options?: BudgetedReadClientOptions): ReadClientResolution;
export function createReadClients(env: Env, options?: ReadClientOptions): GetReadClient;
export function createRequestBudget(limits: { readonly maxRequests: number; readonly deadlineMs: number }): RequestBudget;
export function isRangeLimitError(error: unknown): boolean;
export function isLookupLimitError(error: unknown): error is LookupLimitError;
export function getLogsChunked<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: { readonly address: Address; readonly event: TEvent; readonly args?: GetLogsParameters<TEvent>["args"]; readonly fromBlock: bigint; readonly toBlock: bigint },
  options?: { readonly limits?: Partial<LogScanLimits>; readonly budget?: RequestBudget; readonly signal?: AbortSignal },
): Promise<GetLogsReturnType<TEvent>>;
export function isContractFailure(error: unknown): boolean;
export function describeError(error: unknown): string;
export function readFailure(what: string, error: unknown): Unavailable;
```

- `createReadClient` uses `resolveReadRpcUrl`; `unconfigured` when there is no URL. The client never wraps a wallet (A13): `createPublicClient` over a viem `custom` transport wrapping `http(url, { timeout, batch: false, retryCount: 0 })` that applies spec 9.1's policy itself: two retries, after 500 ms and 2 s; an `eth_getLogs` range-limit refusal is returned at once, never retried; batching off by default. With `options.budget`, every attempt of every request, retries included, spends that `RequestBudget` first (a `LookupLimitError` is never retried).
- `createReadClients` memoizes one client per chain and returns `undefined` for unknown or unconfigured chains (D-18, D-56).
- `createRequestBudget`: see `RequestBudget`. Used by the Reality lookup (1,500 requests, 90 s) and the meta-evidence load.
- `isRangeLimitError` is moved verbatim from the Reality port (rate-limit wording excluded first; codes −32005, −32602, −32600, −32614, 413; the range wording regex; a `LookupLimitError` is never a range error).
- `getLogsChunked`: tries `[fromBlock, toBlock]` in one request; on a range-limit error splits into windows of `windowSize` (default 10,000) fetched `concurrency` (default 8) at a time, oldest first, shrinking a refused window by `windowShrinkFactor` down to `minWindowSize`, then rethrowing. Returns every log, deduplicated by `(transactionHash, logIndex)`, removed logs dropped, sorted by block and log index. Other errors are rethrown, never split. With `options.budget`, each window spends it once, unless the client was built with that same budget (`createReadClient`), which already spends it on every attempt. This is the D-02 scan: callers pass the round's start block and the head.
- `isContractFailure` (D-53, D-36, §10.9): whether a failed `readContract` was a failure of the contract (a revert with data, `ContractFunctionZeroDataError`, or a node message for an EVM failure: execution reverted, invalid opcode, `InvalidFEOpcode`, invalid jump, out of gas, stack under/overflow) rather than of the transport; viem's mapping of `-32603 "Internal error"` or an empty `0x` revert to a revert does not count. Only a contract failure means "does not exist" or "this getter is absent".
- `describeError`: a reason safe to show: a viem error's `shortMessage` (its full message can carry the RPC URL and key), a `LookupLimitError`'s message, "The request was aborted.", else "The request failed.".
- `readFailure`: the `Unavailable` of a contract read that threw: `reverted` for a contract failure, else `rpc-error`, message `Could not read <what>: <describeError>`. `disputes`, `appeals`, `create` and `evidence` use these three; none keeps a local copy.

Tests: `rpc/client.test.ts` (A13: built from the read RPC only; D-56: unset variable → `unconfigured`), `rpc/rangeLimit.test.ts` (the ported `isRangeLimitError` table from `reality-question.test.js`), `rpc/getLogsChunked.test.ts` (whole range, refusal → windows, shrink, dedup, non-range error rethrown, budget exhaustion), `rpc/budget.test.ts`, `rpc/failures.test.ts` (D-53 node messages, D-36 transport failures, A13 safe reasons).

## `families` (layer 3)

Family detection from bytecode and the capabilities each family has. Implements ADR 0003 layer one, 06 §1, 06 §3 invariants 6 and 8, C11, D-12, D-46, D-47 (capabilities), D-49, D-50.

```ts
export function scanSelectors(code: Hex): ReadonlySet<Hex>;
export function isEip1167Clone(code: Hex): boolean;
export function readEip1967Implementation(client: ReadClient, address: Address): Promise<Address | null>;
export function classifySelectors(selectors: ReadonlySet<Hex>): { readonly family: ProbedFamily; readonly capabilities: Capabilities };
export function detectFamily(request: {
  readonly client: ReadClient;
  readonly chainId: ChainId;
  readonly arbitrable: Address;
  readonly registry?: Registry; // defaults to REGISTRY
  readonly cache?: FamilyCache;
}): Promise<FamilyDetection>;
export function createFamilyCache(): FamilyCache;
```

- `scanSelectors` walks the bytecode opcode by opcode, skipping the immediate data of `PUSH1`…`PUSH32`, and collects every `PUSH4` operand.
- `isEip1167Clone` recognizes the EIP-1167 runtime pattern (`0x363d3d373d3d3d363d73…5af43d82803e903d91602b57fd5bf3`). Clones are not followed: their own code has no selectors, so they classify `view-only` (06 §1).
- `readEip1967Implementation` reads `EIP1967_IMPLEMENTATION_SLOT`; returns the address in the low 20 bytes, or `null` for a zero word.
- `classifySelectors` applies rows 2–7 of 06 §1 in order: `escrow-v1`, `governor` (either rule), `idr-v2`, `idr-v1`, `idr-legacy`, `view-only`; capabilities per the 06 §1 behavior column: evidence `local-id` for escrow and idr families, `uri-only` for a governor with `submitEvidence(string)`, `none` for kleros.eth and view-only; appeal `escrow-pay-cost`, `governor`, `idr` with `fundAppeal(uint256,uint256)` for v1/v2 and whichever `fundAppeal` selector the code carries for `idr-legacy` (`none` if neither); withdraw per `WithdrawCapability`; `localId` `disputeIDtoTransactionID` for escrow, `externalIDtoLocalID` for idr families, `none` otherwise.
- `detectFamily`: a registered Reality proxy (`getRealityProxy`) is `family: "reality-proxy"`, with `writeFamily` from rows 4–6 only (`view-only` if none match). Otherwise `family === writeFamily`. Code is read with `getCode`; when the code is an EIP-1967 proxy (non-zero implementation slot) the implementation's code is scanned. Empty code → `view-only`. Any RPC error rejects; a revert or error is never read as "selector absent" (C11). Detection uses no `eth_call` on the arbitrable.
- `createFamilyCache` is in-memory, per session, keyed `registryKey(chainId, address)`, holding the promise so concurrent callers share one detection; a rejected promise is evicted. Never persisted (C11).

Tests: `families/scanSelectors.test.ts` (PUSH data skipping, PUSH4 at the end of code), `families/classify.test.ts` (each row of 06 §1, including both governor rules and both legacy `fundAppeal` selectors), `families/detect.test.ts` (06 §3 invariants 6 and 8 against `families/__fixtures__/bytecode-<chain>.json` (one file per chain, each contract with its address, expected family and selectors) recorded with `eth_getCode` at a pinned block, loaded through `families/__fixtures__/recorded.ts`, implementation code for proxies, owed by 06 §5.5; C11: RPC failure rejects; EIP-1967 followed; EIP-1167 not followed; D-12 the lowercase escrow `0x0d674409…` is `escrow-v1`; D-49 `0x4b89e798…` and `0x1128ed55…` are `idr-v1`; D-50 an unlisted escrow fixture), `families/cache.test.ts` (shared promise, rejection evicted), `families/proxies.test.ts` (C11: EIP-1167 clones recognized, EIP-1967 implementation slot).

## `reality` (layer 3)

The ported Reality.eth pipeline with its 75 tests, reading through injected `ReadClient`s instead of web3. Implements A4 (guard source), A5, A6, §9.1 "Reality question lookup" and "Derived Reality options", §10.4. Behavior is unchanged from `src/ethereum/reality-*.js` except where injection requires it.

```ts
export const LOOKUP_LIMITS: RealityLookupLimits;
export const QUESTION_PARAMS_DELIMITER: string; // "␟"
export const REGISTRY_SNAPSHOT_BLOCKS: Readonly<Record<ChainId, number>>; // generated
export const KNOWN_DISPUTE_QUESTIONS: Readonly<Record<string, KnownDisputeQuestion>>; // generated, key "<chain>:<proxy>:<disputeId>"
export const JSON_DUPLICATE_KEY_GUARD: string; // runner bootstrap source, unchanged text
export function isRealityScript(scriptText: string): boolean;
export function realityQuestionCacheKey(arbitratorChainId: ChainId, entry: RealityProxyEntry, disputeId: bigint): string;
export function isValidCachedQuestion(value: unknown, entry: RealityProxyEntry, known: KnownDisputeQuestion | undefined): value is RealityQuestion;
export function findLatestLogs<const TEvent extends AbiEvent>(
  client: ReadClient,
  request: { readonly address: Address; readonly event: TEvent; readonly args?: GetLogsParameters<TEvent>["args"]; readonly fromBlock: bigint; readonly toBlock: bigint },
  budget: RequestBudget,
): Promise<GetLogsReturnType<TEvent>>;
export function fetchRealityQuestion(request: {
  readonly entry: RealityProxyEntry;
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  readonly clients: LookupReadClients; // (budget, options?) => GetReadClient, built per lookup
  readonly cache?: RealityQuestionCache;
  readonly deadlineMs?: number; // clipped to LOOKUP_LIMITS.deadlineMs
  readonly signal?: AbortSignal;
}): Promise<RealityQuestion>;
export function safePopulatedJSONForTemplate(templateText: string, questionText: string): SafePopulateResult;
export function rulingOptionsFromRealityQuestion(
  question: PopulatedQuestion,
  options?: { readonly answeredTooSoon?: boolean; readonly localizedLang?: "es" | null },
): RulingOptions | null;
export function rulingOptionsFromTemplate(templateText: string, options?: { readonly answeredTooSoon?: boolean; readonly localizedLang?: "es" | null }): RulingOptions | null;
export function deriveRealityRulingOptions(
  question: RealityQuestion,
  entry: Pick<RealityProxyEntry, "answeredTooSoon" | "localizedLang" | "questionOverride">,
): DerivedRealityOptions;
// The known-questions generator; its types (`GeneratorMode`, `GeneratorRequest`, `KnownQuestionsData`) are exported from `reality/generator.ts`, not `reality/types.ts`.
export function generateKnownQuestions(request: GeneratorRequest): Promise<KnownQuestionsData>;
export function renderKnownQuestionsModule(data: KnownQuestionsData): string;
```

- `fetchRealityQuestion` is today's lookup: known disputes (3 requests), otherwise `DisputeIDToQuestionID` / `ArbitrationCreated` (trying `arbitrationCreatedBlock` first where the entry allows) after `max(proxyDeployBlock, snapshot + 1)`, the cross-chain interpolation bound, `LogNewQuestion`, `templates(id)` and `LogNewTemplate`; exactly one log each ("Expected exactly one … log, found N."); one `RequestBudget` per lookup (1,500 requests, `min(deadlineMs, 90 s)`); the arbitrator and home-chain clients come from `clients(budget, options)`, built around that budget so every attempt, retries included, spends it (`metaEvidence` passes `lookupClientsOf(env)`, over `rpc.createReadClient`); per-request timeout and retries come from those clients. A missing client rejects with "no RPC configured for chain N" (D-18). Results are validated on read from `cache` and written after success; failures are never cached. Concurrent lookups of the same key share one in-flight promise (module-level map). Rejects on any failure; `metaEvidence` maps that to `reality-lookup-failed`.
- `findLatestLogs` is today's `findLogs` (whole range first, then newest-first windows that stop at the newest window with logs, shrinking on refusal) over viem typed logs.
- `isRealityScript` is today's substring test for `populatedJSONForTemplate` (B17 accepted).
- The other functions are the ported ones, signatures unchanged apart from types. `sanitizeRulingOptions` leaves this module: its rules become `metaEvidence.parseRulingOptions`.
- The generated known-questions file (`reality/knownQuestions.generated.ts`) keeps its generator (`generateKnownQuestions` computes the map in `incremental`, `full` or `check` mode, rejecting on any inconsistency; `renderKnownQuestionsModule` prints the module source that `check` compares with the committed file). Its command is `packages/core/scripts/generate-known-questions.ts`, run through `tsx` by the core package scripts `reality:known-questions` (`--full` to rescan) and `reality:known-questions:check` (A6, REALITY_OPS.md). It imports `../src/reality`, `../src/registry` and `../src/rpc` (each module's `index.ts`), reads the proxies from `REGISTRY.realityProxies` and its RPC list from `CHAINS` through `createReadClients(process.env)` (06 §3 invariant 3), loads the repository's `.env` when present (the environment wins), and never evaluates the old app's files. Exit code 0 when written or up to date, 1 when `--check` finds a difference, on an unknown argument or on any failure. `scripts/tsconfig.json` type-checks it with Node's types (`typecheck` runs both projects). `reality/knownQuestions.test.ts` is the offline stand-in for `--check`.

Tests (ported, 75 in total with the moved ones): `reality/question.test.ts` (today's 39 lookup cases minus the `isRangeLimitError` table, which moves to `rpc/rangeLimit.test.ts`; the RPC is a custom transport), `reality/safeQuestion.test.ts` (23), `reality/rulingOptions.test.ts` (the 7 derivation cases; the 2 `sanitizeRulingOptions` cases move to `metaEvidence/schema.test.ts`), `reality/cache.test.ts` (validation on read, invalid entry removed, failures not cached). The 4 duplicate-key guard tests move to the runner's test suite in `web` (`JSON_DUPLICATE_KEY_GUARD` is only evaluated in the runner, A4's home), so core never evaluates code. Also: `reality/constants.test.ts` (A5 limits and delimiter), `reality/guard.test.ts` (A4: the guard text byte for byte, `isRealityScript`), `reality/generator.test.ts` and `reality/knownQuestions.test.ts` (A6).

## `metaEvidence` (layer 4)

The meta-evidence pipeline: locator, gating, script, Reality derivation, merge, validation, placeholder, cache policy. Implements §9.1, §9.2, A1 (call site), A2, A4 (status mapping), A7, A23, B5 (parameter validation), B11 (accepted), B12, B13 (D-35 parameters), B15 (validation on read), C13, D-13, D-18, D-25, D-36, D-37, D-38.

```ts
export const CASE_PAGE_BUDGET_MS: number; // 120_000
export const ONGOING_BUDGET_MS: number; // 40_000
export const INVALID_META_EVIDENCE: MetaEvidence;
export function metaEvidenceLocatorUrl(env: Env, chainId: ChainId, disputeId: bigint): string | null;
export function loadMetaEvidence(context: MetaEvidenceContext): Promise<MetaEvidenceResult>;
export function parseRulingOptions(value: unknown): RulingOptions;
export function parseMetaEvidence(merged: unknown): Outcome<MetaEvidence>;
export function buildScriptParameters(input: {
  readonly metaEvidence: MetaEvidence;
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  readonly arbitrable: Address;
  readonly env: Env;
}): Outcome<ScriptParameters>;
export function realityFromScript(jsonDuplicateKeys: boolean): { readonly realityQuestion: RealityQuestionInfo; readonly rulingOptions?: RulingOptions };
export function realityNotice(info: RealityQuestionInfo | null): RealityNotice;
export function metaEvidenceCachePolicy(result: MetaEvidenceResult): MetaEvidenceCachePolicy;
export function parseCachedMetaEvidenceResult(value: unknown): MetaEvidenceResult | null;
```

- `loadMetaEvidence` never rejects. One attempt, in this order (A2, §9.1): (1) `GET metaEvidenceLocatorUrl` (`${REACT_APP_METAEVIDENCE_URL}?chainId=…&disputeId=…`); no `metaEvidenceUri` → `missing`. (2) `normalizeIpfsPath(uri)` null → `invalid` / `uri-not-content-addressed`. (3) Fetch the gateway URL; parse JSON (`not-json` on failure). (4) Rename `evidenceDisplayInterfaceURL` → `…URI` (and the hash key), default `rulingOptions.type` to single-select. (5) Registered Reality proxy (`getRealityProxy`) → script skipped (`registered-reality-proxy`). Otherwise, when `dynamicScriptURI` is set: not content-addressed → `invalid` / `script-uri-not-content-addressed`; `!isScriptAllowed` → `invalid` / `script-not-allowlisted`; fetch the script text (not ok → no merge, `script-fetch-failed`); `buildScriptParameters` (`unknown-chain` on failure); run with `kind = isRealityScript ? "reality" : "standard"` and `timeoutMs` = the remaining budget; shallow-merge `value` over the JSON when it is a plain object (A23); for a Reality script apply `realityFromScript` (A4). (6) For a registered proxy whose JSON is an object with `title` or `rulingOptions`, `fetchRealityQuestion` (deadline = remaining budget) and `deriveRealityRulingOptions` set `rulingOptions`, `realityQuestion` and the `question` override. (7) `parseMetaEvidence` on the merged result (C13). The dispute-1621 override is gone (D-25).
- Budget (D-38): `context.budgetMs` covers locator, fetch, script and Reality lookup together. Transient failures (`locator-error`, `fetch-error`, `script-failed`, `reality-lookup-failed`) retry after 5 s while budget remains; deterministic ones (`not-json`, `schema-invalid`, `unknown-chain`, every `invalid`) do not. When the budget runs out → `failed` / `budget-exhausted`.
- `INVALID_META_EVIDENCE` is the §9.1 placeholder (title, description, `rulingOptions: {type: "single-select", titles: []}`).
- `parseRulingOptions` is A7 / today's `sanitizeRulingOptions` as a Zod schema: non-object → `{type: "single-select", titles: []}`; non-string `type` → "single-select"; `titles` → strings or `[]`; `reserved` → string values or removed; `precision` through `rulings.parsePrecision` (removed when its `Number()` is not finite or it is `null`, `false` or `""`; else reality-eth-lib's `parseInt` reading, hexadecimal after a `0x` prefix, 0 when not positive); `descriptions` → a positional array of strings when every position is defined, else a record of its defined entries as strings keyed by position (decimal string) or by reserved code as written (§5.13, §9.2, review finding ME-2), removed when neither an array nor an object.
- `parseMetaEvidence`: the merged value must be a plain object, else `schema-invalid`. An object with neither `title` nor `rulingOptions` is still `ok` and renders what it has, as today: §9.1's validity rule ("an object with `title` or `rulingOptions`") only gates the Reality derivation of step 8 and `sanitizeRulingOptions` of step 9, so for such an object `rulingOptions` stays absent and downstream code treats an absent `rulingOptions` exactly as today's code does (§5.12 item 5, §5.13, §9.2); the Ongoing card shows its title fallback (§9.2). Strings are kept; a non-string `title`, `description` or `question` is coerced with `String()` only for numbers and booleans and otherwise dropped (B12: an object title no longer crashes); `aliases` keeps entries whose key is an address and value a string, keys left as written (display only, never used for lookups); chain IDs become `ChainIdField` via `parseChainId`; `fallbackOutcomes` is extracted from the four legacy paths of §5.9.
- `buildScriptParameters` (§9.5, B5, D-35): chain IDs default to the arbitrator chain when absent; an `invalid` field fails with `unknown-chain`; RPC URLs are `resolvePublicRpcUrl`, `null` when unconfigured.
- `realityFromScript` (A4, §9.1 step 7.6): duplicate keys → `{status: "unresolvable"}` with `rulingOptions: {type: "single-select", titles: []}`; else `{status: "unverified"}`.
- `realityNotice` (§5.10): first of `unresolvable`, `unverified`, `divergent === true`, `malformed`, else `none`; `title` carried.
- `metaEvidenceCachePolicy`: `ok` → `persist`; `failed` and `missing` → `memory-brief` (D-38); `invalid` → `never` (A2).
- `parseCachedMetaEvidenceResult` re-validates a persisted `ok` entry with the same schema (B15, D-13); anything else → `null`.

Tests: `metaEvidence/gating.test.ts` (A2 order incl. a registered proxy with an `/ipns/` URI → placeholder; A1 rejection; mainnet 1684's script refused; Gnosis 863 absolute gateway URL → invalid), `metaEvidence/merge.test.ts` (A23: a script replacing `title`, `rulingOptions`, `evidenceDisplayInterfaceURI` is validated after the merge; A4 mapping), `metaEvidence/schema.test.ts` (A7 incl. the two ported `sanitizeRulingOptions` cases, C13 hostile shapes, B12 object title), `metaEvidence/scriptParams.test.ts` (B5 `</script>` and non-integer chain IDs, D-35, D-18), `metaEvidence/budget.test.ts` (D-38 with fake timers, script timeout inside the budget), `metaEvidence/cache.test.ts` (rejections never cached, B15 validation on read), `metaEvidence/realityNotice.test.ts` (§5.10 priority), `metaEvidence/lookupClients.test.ts` (A5, A13: the Reality lookup's clients spend its budget on every attempt).

## `evidence` (layer 4)

Replacements for archon's `getDispute` and `getEvidence`, with content addressing. Implements §9.3, A17 (validation), B7, D-03 (data), D-22, D-36.

```ts
export function evidenceScanStart(chain: ChainConfig): bigint;
export function readDisputeEvent(request: {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly disputeId: bigint;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}): Promise<Outcome<DisputeEventResult>>;
export function readEvidenceLogs(request: {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly evidenceGroupId: bigint;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}): Promise<Outcome<readonly EvidenceLog[]>>;
export function loadEvidence(context: EvidenceContext): Promise<Outcome<EvidenceList>>;
export function parseEvidenceDocument(value: unknown, gateway: GatewayOrigin): Outcome<Pick<EvidenceItem, "title" | "description" | "attachment">>;
export function buildEvidenceDocument(input: { readonly name: string; readonly description: string; readonly fileUri: CanonicalIpfsPath | null }): EvidenceDocument;
```

- `readDisputeEvent` scans `Dispute(_arbitrator, _disputeID)` on the arbitrable with both indexed arguments filtered, `[fromBlock, head]` through `getLogsChunked`; `fromBlock` is `evidenceScanStart(chain)`, the chain's `arbitratorDeployedAtBlock ?? 0` (choice 3, P-01). Zero or several logs are reported, not thrown; the block timestamp is `createdAt`.
- `readEvidenceLogs` scans `Evidence(_arbitrator, _evidenceGroupID)` the same way (evidence can precede the dispute, so the scan starts at the arbitrator deployment, not the dispute). The submitter (`_party`) passes through `toRegistryAddress` (rule 12, B21).
- `loadEvidence`: a log whose `_evidence` or `_party` does not decode → hidden `undecodable`; for each other log, `normalizeIpfsPath` (fail → hidden `not-content-addressed`, no fetch, D-22), fetch through the gateway with bounded concurrency (fail → `fetch-failed`), parse JSON (`not-json`), `parseEvidenceDocument` (`schema-invalid`); timestamps from `getBlock`, one call per distinct block. Items newest first; `hiddenEvidenceCount` is the sum of hidden reasons. http(s) evidence URIs are not content-addressed and are hidden (archon's multihash path is gone, D-22).
- `parseEvidenceDocument` (§9.3): title is `title`, or `name` when `title` is empty; `description` a string; attachment from `fileURI`, else the legacy `evidence` key, through `toAttachmentLink`. Never fetched (B7 accepted for attachments).
- `buildEvidenceDocument` (§5.14 step 1): `{name, description, fileURI: fileUri ?? "", evidenceSide: 0}`.

Tests: `evidence/disputeEvent.test.ts` (one, zero, several logs), `evidence/load.test.ts` (D-22 hidden counts by reason, undecodable logs included, order newest first, A17 malformed entries, a custom-transport client), `evidence/schema.test.ts` (§9.3 title/name, legacy `evidence` key, D-32 http attachment as text).

## `disputes` (layer 5)

Arbitrator reads for one dispute, existence, local IDs, courts, timeline, decision, the assembled `DisputeView`, and the Ongoing list. Implements §3, §5.3 (minus Q11's dead reads and the dead `DisputeCreation` re-resolution), §5.4, §5.7, §5.8, §5.9, §6.1 (arbitrator rows), §6.3 (open list, appeals), A19, A22 (binding), D-09, D-11, D-19, D-36, D-37, D-39, D-53.

```ts
export function parseDisputeId(input: unknown): bigint | null;
export function lookupDispute(context: DisputeReadContext, disputeId: bigint): Promise<DisputeLookup>;
export function resolveLocalId(client: ReadClient, binding: ArbitratedBinding, family: FamilyDetection): Promise<LocalIdResolution>;
export function readAppealDecisions(context: DisputeReadContext, binding: ArbitratedBinding, fromBlock: bigint): Promise<Outcome<readonly AppealDecisionEvent[]>>;
export function readDisputeDetails(
  context: DisputeReadContext,
  found: { readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding },
  family: FamilyDetection | undefined,
  disputeEventBlock: bigint | null,
): Promise<DisputeReads>;
export function listCourts(context: CourtsContext): Promise<Outcome<readonly Court[]>>;
export function deriveTimeline(input: { readonly period: Period; readonly lastPeriodChange: UnixSeconds; readonly court: Court }): Timeline;
export function deriveCompatibility(family: FamilyDetection | undefined, localId: LocalIdResolution): Compatibility;
export function deriveDecision(input: {
  readonly period: Period;
  readonly currentRuling: bigint;
  readonly fundedRulings: readonly bigint[]; // current round, from appeals.readRoundFunding
  readonly rulingOptions: RulingOptions | null;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly compatibility: Compatibility;
}): Decision;
export function buildDisputeView(input: {
  readonly lookup: DisputeLookup;
  readonly reads: DisputeReads | null;
  readonly family: Outcome<FamilyDetection>;
  readonly courts: Outcome<readonly Court[]>;
  readonly metaEvidence: MetaEvidenceResult | null;
  readonly fundedRulings: Outcome<readonly bigint[]> | null;
}): DisputeView;
export function listOngoingDisputes(context: DisputeReadContext, courts: readonly Court[] | null): Promise<OngoingList>;
```

- `parseDisputeId` (A19, D-09): ASCII digits only, no sign, at most uint256; else `null`. `/:chainId/cases` without an ID is handled in `web` (D-09) and never reaches dispute 0.
- `lookupDispute` (§5.3 step 1, §5.4, D-53): `no-arbitrator` when the chain has no `klerosLiquid`; `unavailable` (`no-rpc`) without a client; `disputes(id)` → `found` with an `ArbitratedBinding` (the only constructor of that type, A22); a contract revert (index out of range) → `not-found`; a transport error → `unavailable`. Every search starts from a fresh lookup, so the previous dispute never leaks (D-53).
- `resolveLocalId` (§5.3 step 2): by `family.capabilities.localId`: `externalIDtoLocalID` or `disputeIDtoTransactionID` via `readContract`; revert → `unresolved`/`reverted`; `none` → `not-applicable`. Today's `DisputeCreation` re-resolution is not carried over: KlerosLiquid sets `dispute.arbitrated` and emits `DisputeCreation` with the same `msg.sender` (`node_modules/@kleros/kleros/contracts/kleros/KlerosLiquid.sol` lines 703 and 717), so the fallback can never name a different arbitrable (D-11).
- `readAppealDecisions` (§6.3): `AppealDecision(id)` from `fromBlock` (the Dispute event block, else the arbitrator deployment block) to head, chunked; timestamps from `getBlock`.
- `readDisputeDetails` (§5.3 step 3 without `ruling` and the second `getDispute`, Q11/D-11): in parallel `getDispute(id)` (votesLengths), `currentRuling(id)`, `readAppealDecisions`, `resolveLocalId` (when the family is known), and `appealCost(id, 0x)` + `appealPeriod(id)` when the period is 3 or 4. Each degrades to its own `Outcome`.
- `listCourts` (§6.1, D-19): reads `courts(i)` and `getSubcourt(i)` for `i = 0, 1, …` until the first revert (today's estimate-gas loop); fetches each `policies(i)` JSON independently through `policyFetchUrl` and the fetcher, `name` = its `.name` string or `null`. One failing policy never fails the list; an RPC failure of the court reads does.
- `deriveTimeline` (§5.7, D-39): columns Evidence, Commit (when `court.hiddenVotes`, or when the dispute is in period 1 whatever its court says now: every period the dispute passes through), Vote, Appeal, Execution. Earlier periods `concluded`; the current one `current` with `deadline = lastPeriodChange + timesPerPeriod[period]` (null in execution); later ones `upcoming` with their duration (null for execution).
- `deriveCompatibility` (§5.5, 04 §1 `compatibility`): `view-only` when the family is unknown, has evidence capability `none`, or needs a local ID that is `unresolved`; else `full`. kleros.eth is `view-only` (evidence) while still getting governor appeal cards (D-47); `idr-legacy` is `full` (D-46).
- `deriveDecision` (§5.9): periods 0–2 → `none`; period 3 → `jury-decision` with `appealHint = compatibility === "view-only"`; period 4 → `winner`: the single funded ruling when exactly one exists (`wonBy: "default"`), else the current ruling (`wonBy: "jury"`). Text from `formatRuling`.
- `buildDisputeView` maps `not-found` and `no-arbitrator` lookups to `{exists: false, reason}` and an `unavailable` lookup to `{exists: false, reason: "unavailable", error}`; for `found` it assembles 04 §1's top-level fields: `exists`, `arbitrable`, `family`, `compatibility`, `period`, `lastPeriodChange`, `timeline`, `decision`, `numberOfVotes` (`votesLengths[0]`), `court`, `realityNotice` (from the `ok` meta-evidence, else `none`). Missing inputs degrade the field, never the view (D-36).
- `listOngoingDisputes` (§3, D-37): `no-arbitrator` without `klerosLiquid`; `DisputeCreation` and `NewPeriod` over `[ongoingScanStart, head]` chunked; open IDs = created IDs minus IDs with a `NewPeriod` to period 4; sorted descending; `disputes(id)` per ID, failures collected in `failedIds` instead of dropping silently; `countdownTarget` from the court's `timesPerPeriod` when `courts` has the court. Titles are joined in `web` from `loadMetaEvidence` with `ONGOING_BUDGET_MS`.

Tests: `disputes/lookup.test.ts` (D-53, revert vs transport error, no arbitrator, A22 binding source), `disputes/localId.test.ts`, `disputes/details.test.ts` (D-11: no `ruling` read, single `getDispute`; per-read degradation, D-36), `disputes/courts.test.ts` (D-19 one failing policy), `disputes/timeline.test.ts` (D-39 hidden-vote court and execution), `disputes/decision.test.ts` (§5.9 default vs jury, hash rulings, ruling 0), `disputes/view.test.ts` (04 §1 field mapping, bad-dispute shapes of D-36: 150, 560, 1665), `disputes/ongoing.test.ts` (§3 open set, order, D-37 failed IDs kept).

## `appeals` (layer 6)

Everything about appeal money: multipliers, required amounts, deadlines, funding scans, cards, withdrawable amounts, and the panel per family and period. Implements §5.11, §5.12, §5.15 (amount), §10.1, §10.2, §10.8, §10.9, §6.3 (contributions, `RulingFunded`), D-02, D-04, D-10 (amounts only), D-30, D-33, D-43, D-46, D-47, D-49, D-51.

```ts
export function readMultipliers(client: ReadClient, family: FamilyDetection): Promise<Outcome<Multipliers>>;
export function fundingRound(appealCount: number, override: BehaviorOverride | undefined): bigint;
export function roundsToScan(period: Period, appealCount: number, override: BehaviorOverride | undefined): readonly bigint[];
export function roundStartBlock(round: bigint, appealDecisions: readonly AppealDecisionEvent[], override: BehaviorOverride | undefined, disputeStartBlock: bigint): bigint;
export function readRoundFunding(context: AppealContext, round: bigint, fromBlock: bigint): Promise<Outcome<RoundFunding>>;
export function computeAppealAmounts(appealInfo: AppealInfo, multipliers: Multipliers): AppealAmounts;
export function isWinningCode(code: bigint, currentRuling: bigint, override: BehaviorOverride | undefined): boolean;
export function fundedPercent(contributed: bigint, required: bigint): number;
export function buildCrowdfundingCards(input: {
  readonly rulingOptions: RulingOptions;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly funding: RoundFunding;
  readonly override: BehaviorOverride | undefined;
}): CrowdfundingSet;
export function readWithdrawable(
  context: AppealContext,
  input: { readonly beneficiary: Address | undefined; readonly rounds: readonly bigint[]; readonly roundStartBlocks: readonly bigint[] },
): Promise<WithdrawState>;
export function buildAppealPanel(input: AppealPanelInput): AppealPanel;
```

- `readMultipliers` (§10.9): `getMultipliers()`; on revert, each field through the first getter that answers (`winnerStakeMultiplier`/`winnerMultiplier`, `loserStakeMultiplier`/`loserMultiplier`, `denominator`/`MULTIPLIER_DIVISOR`/`MULTIPLIER_DENOMINATOR`, `loserAppealPeriodMultiplier`); a missing stake multiplier → `unsupported`; missing denominator → 10000; missing loser period → `denominator / 2`. A revert means "try the next getter"; a transport error is `rpc-error`, never "absent". Governors take the second path (D-47) and also read `sharedMultiplier()` into `Multipliers.sharedMultiplier` (P-05); a governor whose contract fails it has no shared multiplier, a transport error is `rpc-error`.
- `fundingRound` (D-30): `appealCount + (override?.roundIndexOffset ?? 0)`, in every period, for both event types.
- `roundsToScan`: period 3 → `[fundingRound]`; period 4 → every round from `offset` to `appealCount + offset` inclusive (D-30: Unslashed scans rounds 1 to `appealCount + 1`; standard scans 0 to `appealCount`).
- `roundStartBlock` (D-02): round `offset + k` starts at the block of the k-th `AppealDecision` (k ≥ 1), round `offset` at `disputeStartBlock` (the Dispute event block).
- `readRoundFunding` (D-02): for the idr families, `Contribution(localId, round)` amounts summed per ruling and `RulingFunded(localId, round)` rulings, scanned `[fromBlock, head]` with `getLogsChunked` (no 10,000-block window, the same range on every reload); for the governor, the governor dialect's round reads (D-47). Needs a resolved local ID for the idr families.
- `computeAppealAmounts` (§5.12): winner total `cost + cost × winnerStake / denominator`, deadline `appealPeriodEnd`; loser total `cost + cost × loserStake / denominator`, deadline `start + (end − start) × loserAppealPeriod / denominator`; with a `sharedMultiplier` (governors, P-05), `shared` total `cost + cost × sharedMultiplier / denominator`, deadline `appealPeriodEnd`.
- `isWinningCode`: `code === currentRuling`, or `currentRuling === 0n` with `override.refuseToArbitrateFundable === false` (§10.1).
- `fundedPercent`: `Number(contributed × 10000n / required) / 100`, 0 when `required` is 0.
- `buildCrowdfundingCards` (§5.12 card set with D-04 and D-33): the refuse card (code 0) unless `refuseToArbitrateFundable === false`; reserved cards; single-select titles 1..n; multiple-select combinations 0..2ⁿ−1 for n ≤ 4, and for n > 4 only the current ruling's and contributed combinations plus a `composer` (D-33); variable types: contributed values other than the current ruling, the current-ruling card at the winner amount and deadline (D-04), and a `freeInput` at the loser amount; every other case (unknown type, select without titles): one card per fallback outcome or "Yes"/"No" (§5.12 item 5). `remaining = max(required − contributed, 0)`.
- `readWithdrawable` (§5.15, D-46, D-49, D-51): `no-account` without a beneficiary; idr-v2 `getTotalWithdrawableAmount(localId, beneficiary, ruling)` and idr-v1 `getTotalWithdrawableAmount(localId, beneficiary, [ruling])` for every ruling the beneficiary contributed to across `rounds` (its own `Contribution` logs), one `WithdrawItem` per non-zero ruling; governor: `sessions(session)` must name this dispute and nothing is withdrawable until it is resolved; then `getContributions`/`getRoundInfo` per round, one item per `(round, listIndex)` with a non-zero reward computed under the session's settled ruling from `sessions(session)`, never the arbitrator's `currentRuling`, which a one-sided final round overrides (review finding F1); the mapping to rulings taken from the governor's verified source (D-47); `total` is the sum (D-51); `idr-legacy`, escrow and view-only never call this.
- `buildAppealPanel` (06 §1 table, §5.11, D-43, D-46, D-47) keys off `family.writeFamily` and its capabilities, never `family.family`, so a registered Reality proxy whose `writeFamily` is `idr-v2` gets cards and one that matches no row gets the note. Periods 0–2 → `hidden`. Period 3: `escrow-v1` → `escrow-appeal`; `view-only` (including a Reality proxy whose `writeFamily` is view-only) → `handled-by-arbitrable`; idr families and governor → `crowdfunding` when appeal info, multipliers, funding and the current ruling are all ok, else `fees-unavailable` with the first error. A governor panel drops the cards whose ruling names no list (ruling 0, P-04), and when the current ruling is 0 costs every list with `amounts.shared` until the end of the appeal period, as `KlerosGovernor.fundAppeal` charges a tie (P-05). Period 4: `escrow-v1` → `escrow-ended`; `idr-legacy` → `withdraw-unsupported`; idr-v1/v2/governor → `withdraw`; `view-only` → `hidden`.

Tests: `appeals/multipliers.test.ts` (§10.9 each fallback, revert vs transport error), `appeals/rounds.test.ts` (D-30 with the recorded events of dispute 1170 in `appeals/__fixtures__/dispute-1170-dispute-event.json` and `dispute-1170-unslashed.json`, owed by 06 §5.1; mainnet 1678 round 1; 1226), `appeals/funding.test.ts` (D-02: a contribution more than 10,000 blocks after the anchor is counted; same totals on reload), `appeals/amounts.test.ts` (§5.12 formulas, escrow total, P-05 shared side with the reviewer's numbers), `appeals/cards.test.ts` (§5.12 sets; D-04; D-33 with n = 3, 4, 5, 9; Unslashed hides option 0), `appeals/withdraw.test.ts` (D-46, D-49 v1 signature, D-51 sum and items), `appeals/panel.test.ts` (every cell of the 06 §1 table, D-43, D-47, P-04, P-05 governor tie), `appeals/governor.test.ts` (D-47 the `sessions(uint256)` getter of every deployed governor).

## `create` (layer 6)

The Create page's data: courts (from `disputes`), cost, extraData, validation, meta-evidence, the created dispute ID. Implements §4.3, §4.5, §4.6 (receipt parsing), D-08, B16 (document path), B20.

```ts
export const CREATE_LIMITS: CreateLimits; // optionRange [2, 32], minVotes 1, requiredFields: court, votes, title, question type, option count, question, option titles (§4.3)
export function encodeExtraData(courtId: bigint, votes: bigint): Hex;
export function readArbitrationCost(client: ReadClient, chain: ChainConfig, extraData: Hex): Promise<Outcome<bigint>>;
export function validateCreateInput(draft: CreateDisputeDraft): CreateValidation;
export function numberOfRulingOptions(input: Pick<CreateDisputeInput, "questionType" | "options">): bigint;
export function buildCreatedMetaEvidence(input: CreateDisputeInput, registry?: Registry): CreatedMetaEvidence;
export function disputeIdFromReceipt(logs: readonly { readonly address: string; readonly topics: readonly Hex[] }[], arbitrator: Address): bigint | null;
```

- `encodeExtraData` (§4.5): `0x` + court ID as 64 hex digits + vote count as 64 hex digits.
- `readArbitrationCost` (§4.3): `arbitrationCost(extraData)` on `klerosLiquid`; `unsupported` when the chain has none.
- `validateCreateInput` (§4.3, D-08, B20): court and votes integers (votes ≥ 1), title and question required; select types need 2–32 options with non-empty titles (options beyond the count are already trimmed by the form); each party row with either field filled needs both, the address must pass `isAddress` and be unique (case-insensitive); aliases stay paired with their own address; the primary document must be canonical (B16).
- `numberOfRulingOptions` (§4.5 step 2): `2ⁿ` for multiple-select, `n` for single-select, `0` for uint and datetime.
- `buildCreatedMetaEvidence` (§4.5 step 4): `{title, category, description, aliases, question, rulingOptions: {type, titles, descriptions}, fileURI, dynamicScriptURI: "/ipfs/" + defaultScriptCid}`. `descriptions` holds each option's description at its option's index, `""` where none was typed, with the trailing `""` entries dropped (P-09).
- `disputeIdFromReceipt` (§4.5 step 8, D-07): the first log from `arbitrator` whose `topics[0]` is `DisputeCreation(uint256,address)`, its `topics[1]` as a bigint; `null` when absent (the UI reports it, D-07).

Tests: `create/extraData.test.ts`, `create/validate.test.ts` (D-08: duplicates, invalid addresses, pairing, B20; option range; required fields), `create/metaEvidence.test.ts` (§4.5 shape per question type, default script CID, P-09 description indexes), `create/receipt.test.ts`, `create/cost.test.ts` (§4.2, §4.3).

## `writes` (layer 7)

Pure transaction descriptions and the chain-match guard. Core never signs. Implements §6.2, A22, B3, B10 (mitigations), B16 (on-chain URI check), D-07 (refusals are values), D-46, D-47, D-48, D-49, D-51.

```ts
export function checkChainMatch(walletChainId: number | undefined, pageChainId: ChainId): ChainMatch;
export function buildCreateDisputeCall(input: {
  readonly chain: ChainConfig;
  readonly extraData: Hex;
  readonly metaEvidenceUri: string;
  readonly numberOfRulingOptions: bigint;
  readonly cost: bigint;
}): WriteBuild;
export function buildSubmitEvidenceCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly evidenceUri: string;
}): WriteBuild;
export function buildFundAppealCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly ruling: bigint;
  readonly value: bigint;
}): WriteBuild;
export function buildEscrowAppealCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly appealCost: bigint;
}): WriteBuild;
export function buildWithdrawCalls(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly beneficiary: Address;
  readonly items: readonly WithdrawItem[];
}): readonly WriteBuild[];
```

- `checkChainMatch` (B3, D-48): `no-wallet` when the wallet chain is unknown; `wrong-chain` when it differs from the page chain; `web` calls it before every signature and offers the switch.
- Every builder takes the `ArbitratedBinding` from `disputes.lookupDispute` as the target, never an address from meta-evidence (A22), and `binding.chainId` as `WriteCall.chainId`.
- `buildCreateDisputeCall` (§6.2): `ArbitrableProxy.createDispute(extraData, metaEvidenceUri, numberOfRulingOptions)` with `value = cost` on `chain.arbitrableProxy`; `no-arbitrable-proxy` without one; `metaEvidenceUri` must pass `normalizeIpfsPath` and is written in canonical form (B16).
- `buildSubmitEvidenceCall` (§6.2, §5.14): `uri-only` → `submitEvidence(string)` with value 0; `local-id` → `submitEvidence(localId, uri)` with value 0 (transaction ID for escrow); `none` → `evidence-unsupported`; unresolved local ID → `local-id-unresolved`; the URI must be canonical (B16).
- `buildFundAppealCall` (§5.12, D-46, D-47): `idr` → `fundAppeal(localId, ruling)` with the selector the family carries (`uint8` variant for older legacy contracts, ruling range-checked); `governor` → `fundAppeal(listIndex)` with the ruling-to-list-index mapping of the governor's verified source (D-47; a builder obligation, tested against golden 1621); others → `appeal-unsupported`.
- `buildEscrowAppealCall` (§10.2): `appeal(transactionId)` with `value = appealCost`; only for `escrow-pay-cost`.
- `buildWithdrawCalls` (D-51): one call per item, in order: idr-v2 `withdrawFeesAndRewardsForAllRounds(localId, beneficiary, ruling)`, idr-v1 the same with `[ruling]` (D-49), governor `withdrawFeesAndRewards(beneficiary, session, round, listIndex)`; `withdraw-unsupported` for `idr-legacy`, escrow and view-only.

Tests: `writes/chainGuard.test.ts` (B3, D-48), `writes/binding.test.ts` (A22: meta-evidence cannot change the target; the builders accept only an `ArbitratedBinding`), `writes/evidence.test.ts`, `writes/fundAppeal.test.ts` (D-46 legacy selector, D-47 governor), `writes/withdraw.test.ts` (D-49, D-51 sequence), `writes/create.test.ts` (B16 non-canonical URI refused).

---

## Public surface (`src/index.ts`)

`web` imports core only from `@dispute-resolver/core`. `index.ts` re-exports every public type (`export type * from "./types"`) and, by the end of phase 2, these values:

- `chains`: `CHAINS`, `DEFAULT_CHAIN_ID`, `getChain`, `parseChainId`, `chainCapabilities`, `resolveReadRpcUrl`, `resolvePublicRpcUrl`, `currencySymbol`, `explorerAddressUrl`, `explorerTxUrl`.
- `uri`: `normalizeIpfsPath`, `isContentAddressed`, `resolveGateway`, `gatewayUrl`, `resolveDisplayUrl`, `isSafeNavigationUrl`, `toAttachmentLink`, `isSelfLink`, `resolveArbitrableAppLink`, `attachmentKind`, `lastPathSegment`.
- `rulings`: `REFUSED_RULING_TEXT`, `asQuestionType`, `isVariableType`, `formatRuling`, `encodeAnswer`, `combinationTitle`, `combinationCode`.
- `registry`: `REGISTRY`, `toRegistryAddress`, `getOverride`, `displayAllowlistKey`, `isDisplayAllowlisted`.
- `rpc`: `createReadClients`.
- `families`: `detectFamily`, `createFamilyCache`.
- `reality`: `JSON_DUPLICATE_KEY_GUARD` (runner bootstrap), `realityQuestionCacheKey`.
- `metaEvidence`: `CASE_PAGE_BUDGET_MS`, `ONGOING_BUDGET_MS`, `loadMetaEvidence`, `realityNotice`, `metaEvidenceCachePolicy`, `parseCachedMetaEvidenceResult`, `buildScriptParameters`.
- `evidence`: `evidenceScanStart`, `readDisputeEvent`, `loadEvidence`, `buildEvidenceDocument`.
- `disputes`: `parseDisputeId`, `lookupDispute`, `readDisputeDetails`, `listCourts`, `deriveTimeline`, `deriveCompatibility`, `deriveDecision`, `buildDisputeView`, `listOngoingDisputes`.
- `appeals`: `readMultipliers`, `fundingRound`, `roundsToScan`, `roundStartBlock`, `readRoundFunding`, `computeAppealAmounts`, `fundedPercent`, `buildCrowdfundingCards`, `readWithdrawable`, `buildAppealPanel`.
- `create`: `CREATE_LIMITS`, `encodeExtraData`, `readArbitrationCost`, `validateCreateInput`, `numberOfRulingOptions`, `buildCreatedMetaEvidence`, `disputeIdFromReceipt`.
- `writes`: `checkChainMatch`, `buildCreateDisputeCall`, `buildSubmitEvidenceCall`, `buildFundAppealCall`, `buildEscrowAppealCall`, `buildWithdrawCalls`.

Not exported (internal to core): the ABIs and `SELECTORS`, `scanSelectors`/`classifySelectors`/`readEip1967Implementation`, `getLogsChunked`, the Reality lookup internals, `parseMetaEvidence`/`parseRulingOptions`, `isScriptAllowed`, `getRealityProxy`. `web` gets ABIs only inside `WriteCall`s. `index.ts` holds one export line per module with exactly the values above. Everything else a module's own `index.ts` exports (for example `ongoingScanStart`, `policyFetchUrl`, `createReadClient`, `isContractFailure`, `fetchRealityQuestion`, `parsePrecision`, `toText`, `resolveLocalId`, `isWinningCode`, the generator) is for other core modules or core tooling only; the tooling (`packages/core/scripts/`) imports a module's `index.ts` directly.

## Parity snapshot coverage (04 §1)

| Snapshot field                                                                                                                        | Produced by                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exists`, `arbitrable`, `family`, `compatibility`, `period`, `lastPeriodChange`, `timeline`, `numberOfVotes`, `courtName`, `decision` | `disputes.buildDisputeView`                                                                                                                                                                                                                                                                       |
| `title`, `question`, `descriptionText`, `rulingOptions`                                                                               | `MetaEvidenceResult.metaEvidence` (`ok` or the `invalid` placeholder)                                                                                                                                                                                                                             |
| `realityNotice`                                                                                                                       | `metaEvidence.realityNotice`, carried in `DisputeView`                                                                                                                                                                                                                                            |
| `appealPanel` (`kind`, `cards[]`, `withdrawableWei`)                                                                                  | `appeals.buildAppealPanel` (`CrowdfundingCard.fundedPercent/remaining/deadline`, `WithdrawState.total`)                                                                                                                                                                                           |
| `evidence[]`, `hiddenEvidenceCount`                                                                                                   | `evidence.loadEvidence`                                                                                                                                                                                                                                                                           |
| `links.court`                                                                                                                         | `web` (A18)                                                                                                                                                                                                                                                                                       |
| `links.arbitrableApp`, `links.metaEvidenceFile`                                                                                       | `uri.resolveArbitrableAppLink`; `links.metaEvidenceFile` is the summary's attachment link built from meta-evidence `fileURI` (spec §5.6) through `uri`'s attachment normalization, not the gateway URL of the meta-evidence JSON (production renders no link to that JSON; orchestrator decision) |
| `evidenceDisplay`                                                                                                                     | `uri.resolveDisplayUrl`, `registry.displayAllowlistKey`/`isDisplayAllowlisted`, `chains.resolvePublicRpcUrl`; flags and encoding in `web` (A8, C5)                                                                                                                                                |
| Ongoing `disputes[]` (`id`, `period`, `courtName`, `countdownPresent`), `state`                                                       | `disputes.listOngoingDisputes` + `listCourts`; titles from `loadMetaEvidence`                                                                                                                                                                                                                     |
| Create `available`, `courts[]`, `defaultCost`, `questionTypes[]`, `optionRange`, `requiredFields`                                     | `chains.chainCapabilities`, `disputes.listCourts`, `create.readArbitrationCost`, `CreateQuestionType`, `CREATE_LIMITS`                                                                                                                                                                            |

## Choices where the parity documents were ambiguous

1. **Meta-evidence budget** (D-37, D-38 vs the Reality lookup's 90 s, §9.1). The caller passes `budgetMs`: `CASE_PAGE_BUDGET_MS = 120_000` (today's retry budget, now including the script) and `ONGOING_BUDGET_MS = 40_000` ("well under a minute"). The script timeout and the Reality deadline are the remaining budget, the latter capped at `LOOKUP_LIMITS.deadlineMs`. Deterministic failures are not retried.
2. **Existence** (D-53, D-36, §5.4). A revert of `disputes(id)` is "does not exist"; a transport error is an "unavailable" state, not "does not exist" (today both show not-found).
3. **Evidence and Dispute-event scan start** (§6.3). Every chain scans from `arbitratorDeployedAtBlock` (chunked), not `head − lookback` on testnets, because evidence older than the lookback would otherwise vanish once scans are chunked. On mainnet and Gnosis this is equivalent to today's scan from block 0. On testnets it shows evidence and creation times that today's app misses for disputes older than the lookback; this is a latent-bug fix awaiting the maintainer's review as proposal P-01 in `docs/ledger-proposals.md`.
4. **D-51 on idr-v1.** One transaction per ruling (`[ruling]` arrays), like v2, rather than one array call, so the ledger's "one transaction per ruling" holds uniformly.
5. **D-33 composer placement.** Inside the `crowdfunding` panel (`composer`), not a separate kind; 04 §1 knows six kinds, `handled-by-arbitrable` and `withdraw-unsupported` are ledger-driven expected differences.
6. **Script parameters with an invalid chain ID** (B5 vs D-34). The display-allowlist key falls back to the arbitrator chain (D-34); a script is not run and the result is `failed` / `unknown-chain` (today the same input threw and ended in "Failed to load" after the retry budget).
7. **Unknown `rulingOptions.type` strings** are kept verbatim (today's sanitize keeps them), so `RulingOptions.type` is `string` and `asQuestionType` narrows it.
8. **Meta-evidence without `title` or `rulingOptions`** stays `ok` and renders what it has, as today (orchestrator decision: failing it would hide a description that renders today, a deviation the ledger does not record). It is still schema-validated field by field (C13): strings stay strings, hostile shapes are dropped per field.
9. **The `DisputeCreation` re-resolution of §5.3 step 2** is dropped as dead (D-11), with the KlerosLiquid source as evidence.
10. **Duplicate-key guard tests** move to `web`'s runner suite, so core never evaluates code (`new Function`), keeping the 75-test count across both packages.
11. **Governor dialect** (D-47): `WithdrawItem` and the fund builder carry `session`, `round`, `listIndex`; the ruling-to-list-index mapping and session lookup are taken from the verified governor source by the `appeals`/`writes` builders and pinned by golden 1621, 1676, 1672, 535.
