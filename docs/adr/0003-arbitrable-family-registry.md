---
status: accepted
date: 2026-10-12
---

# Per-arbitrable behavior lives in one registry; a generic rule beats a data entry, and every data entry says why it exists

Today the app changes its behavior per arbitrable contract in at least seven places: an exception list for Unslashed (an insurance product) in `src/app.js` (round-index shift, hidden ruling-0 card, old withdraw ABI), Escrow V1 address lists (different dispute-ID lookup, pay-the-full-cost appeal), governor address lists (evidence submitted by URI only), the Reality.eth proxy registry, a per-dispute script override for mainnet case 1621, an evidence-display override for the Kleros Token Curated Registry (T2CR), and overlapping Reality address lists (`reality-addresses.js` feeding `arbitrableWhitelist.js`, versus the proxy registry) that disagree: twelve registered proxies appear in neither list. Components check addresses directly. We decided that UI code never inspects an address, that a declarative registry in `core` answers "which family, which overrides", and that each special case is first tested against the question "does a generic rule make it unnecessary?".

## Decision

Two layers, both in `core`, both validated by tests.

**Layer one, family detection**, evaluated top to bottom, first match wins. Every probe reads selector presence from the contract's function-dispatcher bytecode (4-byte selectors appear as PUSH4 operands), following the EIP-1967 implementation slot for proxies. A reverting `eth_call` is never read as "selector absent", because reverts depend on the arguments. The result is cached for the session only, never in the persisted query cache, so a redeployed contract is re-probed on the next visit.

| Family | Detected by |
|---|---|
| Reality.eth proxy | entry in the Reality proxy registry (today it has entries for mainnet and Gnosis only; testnet proxies are unregistered). A registered proxy's dynamic script is never run and its ruling options are derived on-chain from the question. An unregistered arbitrable whose allowlisted script is recognized as a Reality renderer still runs it in the sandbox of ADR 0004, with the duplicate-key guard; its case is marked unverified, or unresolvable with no ruling options when the guard finds duplicate keys. |
| Escrow V1 | `disputeIDtoTransactionID(uint256)` present and `externalIDtoLocalID(uint256)` absent |
| Governor with URI-only evidence | `submitEvidence(string)` (`0xbac91e2e`) present and `submitEvidence(uint256,string)` absent |
| IDisputeResolver v2 or v1 | v2 exposes `getTotalWithdrawableAmount(uint256,address,uint256)`, v1 exposes `getTotalWithdrawableAmount(uint256,address,uint256[])`; the Unslashed implementation carries the v1 selector only. The version also selects the withdraw ABI, which is why the Unslashed "old withdraw ABI" quirk needs no data entry. |
| View only | none of the above |

**Layer two, data overrides** keyed by chain and address, each with a mandatory `justification` string stating why no generic rule covers it:

- Unslashed `0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38` (mainnet): `roundIndexOffset: 1` and `refuseToArbitrateFundable: false`. The contract declares IDisputeResolver `VERSION()` `"1.0.0"` but violates the interface's semantics; nothing on-chain reveals that. Today's code applies the offset to contributions only before the execution period and to `RulingFunded` events always; the port picks one rule deliberately and records it. `refuseToArbitrateFundable: false` also means that when the current ruling is 0, every option is costed and timed as a winner, as today.
- The 29 Reality.eth proxies with their existing fields plus a justification (a proxy cannot be recognized from bytecode, and its question lives on another chain, the "home chain", for cross-chain proxies); maintenance follows `REALITY_OPS.md` at the repository root.

Beside the registry: the pinned dynamic-script allowlist keyed by arbitrator chain, the default script CID, and the arbitrable allowlist, which keeps its current membership (Reality proxy addresses included) solely as the input to evidence-display iframe flags until the A/B test described in ADR 0004; it plays no role in script sandboxing and none in family detection.

**Removed, because a generic rule or the evidence replaced them:**

- The T2CR evidence-display override. The T2CR meta-evidence names `https://ipfs.kleros.io/ipfs/QmYs17m…/index.html`: the pinned content ID was always there, behind a gateway host that has since died. The generic rule "after URL normalization with dot segments resolved, a display or attachment URL whose path begins with `/ipfs/<CID>` is re-served from the configured gateway, and the result must still pass the content-addressing check of ADR 0001" repairs it and every other URL that embedded the old Kleros gateway, without naming any contract. The dot-segment bypass URL is a test case for this rule, so the rewrite cannot reintroduce it.
- The dispute 1621 script override. The dispute's meta-evidence names the governor script `QmdpXX…`; the override `Qmf1k727…` was diffed against it: identical logic and contract calls, only the Infura key and the bundled web3 version differ. The sandbox's RPC redirect, which matches provider hosts by pattern (ADR 0004), already repairs the original. The override's CID is also removed from the dynamic-script allowlist.
- The second "Unslashed" address `0xb9f9B5eee2ad29098b9b3Ea0B401571F5dA4AD81`. It has no code on mainnet, Gnosis or Polygon (nonce 0, balance 0), and Sourcify, Etherscan, Blockscout and the Kleros agentkit do not know it.
- The `resolve.kleros.io` substring test on the arbitrable link. The default script emits a backlink to the resolver itself; the rule becomes "hide a link whose host is the app's own host or a configured canonical host".
- `reality-addresses.js` as a separate file; it only fed the arbitrable allowlist.
- The Escrow V1 and governor address lists, replaced by the probes above. Commit 119aac6 (September 2025) added a fallback from `externalIDtoLocalID` to `disputeIDtoTransactionID`; commit 7fd1b54 replaced it with an address list the same day, citing only simplification. No correctness problem with the probe is recorded.

**Invariants enforced by tests:** addresses lowercase and unique, every override has a justification, every Reality home chain referenced by the registry has an RPC configured, and the kleros.eth governor `0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4` stays unsupported for evidence (it has no evidence function), as a test expectation rather than a comment.

## Considered options

- **Keep address lists but centralize them.** Rejected: a list is a hidden decision. Probes make the family a fact about the contract, so a new Escrow or governor deployment works without a code change.
- **Probes for everything, no data layer.** Rejected: Unslashed cannot be detected; a contract that violates the interface it declares leaves no on-chain signal.
- **Derive the Unslashed round from its own `Contribution` events instead of a data entry.** Rejected: ambiguous when the current round has no contributions yet.

## Consequences

- Family detection costs a few RPC calls per arbitrable, cached per session.
- Adding a special case means adding a tested data entry with a written justification, or a probe, never a branch in a component.
- A probe can misclassify a contract that exposes a matching selector with different semantics. A wrong read-path classification (the Escrow dispute-ID lookup) degrades that section under its error boundary; a wrong write-path classification (evidence, appeal) fails at transaction time with an error. Neither blanks the page.
