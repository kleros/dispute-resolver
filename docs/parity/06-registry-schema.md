# Arbitrable registry schema

ADR 0003 made concrete. The registry lives in the `core` package. UI code asks it two questions, "which family is this arbitrable" and "which overrides apply", and never inspects an address itself.

## 1. Families and detection order

Detection runs top to bottom; the first match wins. Every probe reads selector presence from the contract's function-dispatcher bytecode (4-byte selectors appear as `PUSH4` operands), following the EIP-1967 implementation slot when the code is an upgradeable proxy. EIP-1167 minimal-proxy clones are not followed; their own bytecode has no selectors, so they detect as `view-only`, which is today's behavior for them (the Gnosis Curate arbitrables and Gnosis 863's arbitrable are clones). A reverting `eth_call` is never read as "selector absent". Results are cached in memory for the session, never in the persisted cache.

| Order | Family | Rule | Behavior |
|---|---|---|---|
| 1 | `reality-proxy` | `(arbitratorChainId, address)` is a key of `realityProxies` | script never run; ruling options derived on-chain; Reality notices. For the write paths the proxy is additionally classified by rows 4–6; a registered proxy that matches none of them (for instance `0x594ec762…`, golden mainnet 150) is view-only for writes |
| 2 | `escrow-v1` | `disputeIDtoTransactionID(uint256)` (`0x2fbe3b03`) present and `externalIDtoLocalID(uint256)` (`0xc21ae061`) absent | local ID via `disputeIDtoTransactionID`; appeal via `appeal(uint256)` paying the arbitrator's appeal cost; no crowdfunding; evidence via `submitEvidence(uint256,string)` (`0xa6a7f0eb`) |
| 3 | `governor-uri-evidence` | `submitEvidence(string)` (`0xbac91e2e`) present and `submitEvidence(uint256,string)` absent | evidence via `submitEvidence(string)`; no local dispute ID; appeals view-only |
| 4 | `idr-v2` | `getTotalWithdrawableAmount(uint256,address,uint256)` (`0xec85635b`) present | full IDisputeResolver support, v2 withdraw signatures |
| 5 | `idr-v1` | `getTotalWithdrawableAmount(uint256,address,uint256[])` (`0xc25516e9`) present | full support with v1 withdraw signatures |
| 6 | `idr-legacy` | `externalIDtoLocalID(uint256)` present and neither withdraw selector | local IDs and evidence via `submitEvidence(uint256,string)`; appeal funding through whichever `fundAppeal` selector the bytecode carries (`(uint256,uint256)` `0x4b2f0ea0` or the older `(uint256,uint8)`); withdrawals not supported through the resolver (ledger D-46). Covers the older resolver proxy `0x135c573503f70dc290b1d60fe2e7f7eb114febd6` with 70 mainnet disputes |
| 7 | `view-only` | none of the above | read everything; no evidence submission, no appeal funding; the case-page "view mode only" banner |

### Appeal panel by family and period (ledger D-47)

| Family | Period 3 (appeal) | Period 4 (execution) |
|---|---|---|
| `idr-v2`, `idr-v1`, `reality-proxy` that also matches one of them | crowdfunding cards when multipliers are readable, otherwise the "appeal fees could not be calculated" notice | withdraw panel: total withdrawable for the connected account, withdraw action |
| `idr-legacy` | crowdfunding cards when multipliers are readable, otherwise the notice | "withdrawals are not supported through the resolver for this contract" |
| `escrow-v1` | single "Appeal" action paying the arbitrator's appeal cost | "appeal period ended" |
| `governor-uri-evidence`, `view-only` | "appeals for this dispute are handled in the arbitrable application"; no cards (today shows cards or the notice; a fund attempt cannot succeed and crashes on the error path, D-14) | no panel (today shows the withdraw body with nothing withdrawable) |

Selectors are computed in the test suite from the ABIs (`@kleros/dispute-resolver-interface-contract` 1.0.2 and 8.0.0, `@kleros/kleros-interaction` escrow contracts, the governor `submitEvidence(string)` signature) rather than hardcoded, so a typo cannot survive.

## 2. Types

```ts
type ChainId = number;
type Address = `0x${Lowercase<string>}`;            // always lowercase in the registry
type RegistryKey = `${ChainId}:${Address}`;         // arbitrator chain + arbitrable

interface Justified { justification: string }      // non-empty; why no generic rule covers this entry

interface RealityProxyEntry extends Justified {
  proxy: Address;
  kind: "single-chain" | "cross-chain";
  reality: Address;                                 // Reality.eth contract holding the question
  realityChainId: ChainId;                          // home chain; must have an RPC configured
  proxyDeployBlock: number;
  realityDeployBlock: number;
  hasArbitrationCreatedBlock: boolean;              // cross-chain only
  answeredTooSoon: boolean;                         // Reality v3 reserved answer
  localizedLang: "es" | null;                       // label language the arbitrable's script used
  questionOverride: "title" | "title-description" | null;
}

interface BehaviorOverride extends Justified {
  roundIndexOffset?: 1;                             // Unslashed: contract increments rounds without appeals
  refuseToArbitrateFundable?: false;                // Unslashed: option 0 not fundable; ruling 0 => all options costed as winners
}

interface Registry {
  realityProxies: Record<RegistryKey, RealityProxyEntry>;     // 29 entries today, chains 1 and 100
  overrides: Record<RegistryKey, BehaviorOverride>;           // 1 entry today
  dynamicScriptAllowlist: Record<ChainId, string[]>;          // arbitrator chain -> CID paths, exact match after normalization
  displayAllowlist: Record<ChainId, Address[]>;               // keyed and populated exactly as today's arbitrableWhitelist (lookup key = validated
                                                              // meta-evidence arbitrableChainID, else arbitrator chain); display flags only (D-34)
  defaultScriptCid: string;                                   // "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj"
  canonicalHosts: string[];                                   // ["resolve.kleros.io"]; self-link suppression
}

interface ChainConfig {
  id: ChainId; name: string; currency: string; isTestnet: boolean;
  klerosLiquid?: Address; arbitrableProxy?: Address; policyRegistry?: Address;
  arbitratorDeployedAtBlock?: number; maxLookback: number;
  readRpcEnv?: string;           // e.g. "REACT_APP_WEB3_PROVIDER_URL"
  defaultRpcUrl?: string;        // used when readRpcEnv is unset or absent; today only zkSync Era (324) and zkSync Sepolia (300) have literal URLs
  publicRpcEnv?: string;         // e.g. "REACT_APP_PUBLIC_RPC_1"; defaults to the read RPC (D-35)
  explorerBaseUrl?: string;
}
```

Known-questions data (`REGISTRY_SNAPSHOT_BLOCKS`, `KNOWN_DISPUTE_QUESTIONS`) keeps its generated file and generator; it is indexed by the same `RegistryKey`.

## 3. Invariants (test suite)

1. Every address in every table is lowercase and 40 hex characters; no duplicates within a table.
2. Every `RealityProxyEntry` and `BehaviorOverride` has a non-empty `justification`.
3. Every `realityChainId` and every key chain has a `ChainConfig` with a `readRpcEnv` or a `defaultRpcUrl`; the known-questions generator reads its RPC list from the same `ChainConfig` table, not from a separate map.
4. `dynamicScriptAllowlist` entries are canonical CID paths (no scheme, no leading slash, no trailing slash); the dispute-1621 override CID `Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf` is absent; mainnet dispute 1684's script `QmVkffjdrtLVsRxybdB2xSidamnUrvck3FVxmKxJz6eD7f` is absent.
5. `displayAllowlist` equals today's `arbitrableWhitelist` map (including the Reality addresses it pulled from `reality-addresses.js`), same keys, same members after lowercase normalization; a snapshot test guards it until the A/B test (ADR 0004 scope) changes it deliberately.
6. The kleros.eth governor `0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4` detects as `view-only` on mainnet (recorded bytecode fixture), never as `governor-uri-evidence`.
7. `0xb9f9b5eee2ad29098b9b3ea0b401571f5da4ad81` appears nowhere.
8. Family detection on recorded bytecode fixtures: the current ArbitrableProxy on each chain → `idr-v2`; `0x4b89e798b10478a839ea0abcf86c4b94a3c782a4` (mainnet) and `0x1128ed55ab2d796fa92d2f8e1f336d745354a77a` (Gnosis) → `idr-v1`; the older resolver proxy `0x135c573503f70dc290b1d60fe2e7f7eb114febd6` → `idr-legacy`; Unslashed proxy `0xe0e1bc8c…` (implementation `0xa5eb6fec…`) → `idr-v1`; `0xc25a0b96…` and the other Escrow V1 addresses → `escrow-v1`; poh.eth, ubi-voting and fork-dao governors → `governor-uri-evidence`; PoH v2, T2CR, the EIP-1167 clones `0x957a53a9…` (Gnosis Curate) and `0x25fa9432…` (Gnosis 863) → `view-only`; every registered proxy → `reality-proxy`.

## 4. Verdict for every special case in the current code

| Current mechanism | Verdict | Where it went |
|---|---|---|
| `EXCEPTIONAL_CONTRACT_ADDRESSES` (Unslashed) round shift, hidden option 0, ruling-0 winners | data | `overrides["1:0xe0e1bc8c…"]` with `roundIndexOffset: 1`, `refuseToArbitrateFundable: false`; offset rule per D-30 |
| Unslashed v1 withdraw ABI | generic | `idr-v1` family selects the v1 signatures; the same probe fixes the silent withdraw failure of the other v1 contracts (D-49) |
| IDisputeResolver contracts without withdraw functions (older resolver proxy) | generic, new family | `idr-legacy` (D-46) |
| `ESCROW_V1_*` address lists | generic | `escrow-v1` probe |
| `GOVERNOR_*` address lists | generic | `governor-uri-evidence` probe; kleros.eth excluded by the probe and pinned by invariant 6 |
| `REALITY_PROXIES` | data | `realityProxies`, fields unchanged plus `justification` |
| `reality-addresses.js` | removed | its only use was feeding the arbitrable allowlist; the display allowlist carries the set |
| `arbitrableWhitelist.js` | data, narrowed | `displayAllowlist`, keyed by arbitrator chain; no role in script sandboxing or family detection |
| `dynamicScriptWhitelist.js` | data | `dynamicScriptAllowlist` minus the 1621 override CID |
| Dispute 1621 script override | removed | generic host-pattern RPC redirect in the runner (D-25) |
| T2CR evidence-display override | removed | generic gateway rule for `/ipfs/<CID>` paths (D-26) |
| `resolve.kleros.io` substring | generic | `canonicalHosts` host comparison (D-28) |
| `category === "Non-Standard Contract"` banner | removed | dead code (D-11) |
| IDisputeResolver v2-then-v1 fallback in `getTotalWithdrawableAmount` | generic | family probe decides once |
| `isGovernorWithEvidenceSupport` | generic | `governor-uri-evidence` family |
| `testnetChainIds`, `MAX_LOOKBACK`, `CURRENCY_SHORT`, `QUERY_FROM_BLOCK` | data | `ChainConfig` |
| `FOREIGN_KLEROS_LIQUID`, `FOREIGN_ARBITRATOR_NETWORK_CODE`, chains 5 and 80001, arbitrator rows 3/4/42/77 | removed | D-23 |

## 5. Verifications owed before the port is final

1. **Unslashed offset rule** (D-30): compute contribution and `RulingFunded` totals for mainnet 1678 and 1226 under the uniform offset and compare with production's displayed totals and the on-chain events.
2. **T2CR pinned display**: it renders through the gateway with dispute 300's parameters (sandbox study); confirm with mainnet 1255's parameters. 1255's meta-evidence names `https://ipfs.kleros.io/ipfs/QmYs17m…/index.html`, so D-26 resolves it without an override.
3. **Display allowlist A/B** (ADR 0004 scope): PoH v2 (mainnet 1674; its display is an IPFS path, so under `allow-same-origin` it shares the gateway origin with every other IPFS-hosted display) and a Curate display (mainnet 1659) with and without `allow-same-origin`.
4. **Testnet Reality proxies**: enumerate Sepolia and Chiado disputes of allowlisted Reality proxies for the equivalence gate (04 §5). They stay unregistered (no behavior change); registering them later follows `REALITY_OPS.md` and gets its own ledger entry.
5. **Bytecode fixtures**: record `eth_getCode` for every contract in invariant 8 (implementation code for proxies) into the test fixtures, with the block number.
