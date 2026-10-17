# Golden cases

Real disputes the new app must render equivalently to production, plus the rules that make "equivalently" checkable. Production is `https://resolve.kleros.io`; the new app is the branch deploy. The Playwright suite drives both for every stable case and compares parity snapshots. Candidates were collected on 2026-10-12 by scanning dispute events on mainnet and Gnosis and fetching 1,035 distinct meta-evidence files; only executed disputes are in the stable tier because their state no longer changes.

## 1. What "renders equivalently" means

A **parity snapshot** is a structured extract of a rendered screen. The suite extracts the same snapshot from production and from the new app and compares them field by field. Styling, layout, copy wording and icons are outside the snapshot. Deviations recorded in the ledger are applied as expected differences before comparison, per field.

**Account context.** Withdrawable amounts, the withdraw action and the "you contributed" states depend on the connected account; without one, production passes an empty address and shows zero, so both apps would trivially agree. The suite therefore injects, from the test harness and never from the bundle (checklist C9), a read-only EIP-1193 provider that announces a chosen account and signs nothing. For each case that has contributions, the gate script `scripts/golden-gate` extracts the first contributor address from the dispute's `Contribution` events into `golden/accounts.json`, and the snapshot records which account was used. Cases without contributions run with no account.

### Case page snapshot

```
{
  exists: boolean,                      // "does not exist on this network" vs a dispute
  arbitrable: address,                  // from the arbitrator
  family: string,                       // new app only; production has no equivalent (not compared)
  compatibility: "full" | "view-only",  // production: the case-page "View mode only" banner (not the header's no-wallet banner)
  title: string, question: string | null,
  descriptionText: string,              // markdown rendered to plain text, whitespace-normalized
  rulingOptions: { type, titles[], reserved{}, precision? },
  period: 0..4, lastPeriodChange: number,
  timeline: { columns[]: { name, state: "concluded"|"current"|"upcoming" } },
  numberOfVotes: number, courtName: string,
  decision: { kind: "none"|"jury-decision"|"winner", rulingText: string, wonBy?: "default"|"jury" } ,
  realityNotice: "none"|"unresolvable"|"unverified"|"divergent"|"malformed",
  appealPanel: {
    kind: "hidden"|"escrow-appeal"|"escrow-ended"|"crowdfunding"|"fees-unavailable"|"withdraw",
    cards[]: { title, code, fundedPercent, remainingWei, deadline },   // crowdfunding only
    withdrawableWei?: string
  },
  evidence[]: { title, descriptionText, submitter, timestamp, attachmentHref },
  hiddenEvidenceCount: number,          // new app only; production hides silently (expected difference D-22)
  links: { court: url, arbitrableApp: url | null, metaEvidenceFile: url | null },
  evidenceDisplay: { present: boolean, srcOrigin: string, params: {...}, sandbox: string[] } | null
}
```

### Ongoing page snapshot

```
{ chain, state: "list"|"empty"|"no-arbitrator"|"failed",
  disputes[]: { id, title, courtName, period, countdownPresent: boolean } }
```

The list is compared as a set keyed by id. Disputes that change period between the two runs are compared on id and title only.

### Create page snapshot

```
{ chain, available: boolean, courts[]: string, defaultCost: string,
  questionTypes[]: string, optionRange: [min, max], validation: { requiredFields[] } }
```

### Comparison rules

- Both snapshots are taken within the same suite run, minutes apart. Fields that depend on wall-clock time (countdowns, deadlines) are compared on presence and sign only.
- Addresses compare case-insensitively. Amounts compare as integers in wei. Markdown compares as rendered plain text.
- Withdrawable amounts and withdraw actions are compared only under the account context above.
- A field listed in the ledger as a deviation is compared against the ledger's expected new value, not against production.
- Any other difference fails the case.

## 2. Stable tier

### Mainnet (chain 1)

| Dispute | Arbitrable | Exercises | Expected highlights |
|---|---|---|---|
| 1454 | `0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf` ArbitrableProxy (current) | plain resolver dispute, default script `QmZZHw…`, single-select | Yes/No options, 2 evidence, arbitrable-app link hidden (self-link rule, D-28), full compatibility |
| 505 | `0x135C573503f70dc290b1d60Fe2E7f7eB114FEBd6` older resolver proxy | resolver dispute with 5 evidence; this proxy has `externalIDtoLocalID` but no withdraw functions | evidence order newest first; full compatibility (family `idr-legacy`, D-46), withdraw panel text per D-46 |
| 328 | same | appealed resolver dispute, 9 evidence | round count > 1; this proxy emits no `Contribution` events, so the withdraw panel shows nothing withdrawable |
| 912, 913 | `0x4b89e798b10478a839ea0abcf86c4b94a3c782a4` | default script on another arbitrable, 0 evidence | "No evidence submitted yet." |
| 1650 | `0x2018038203aee8e7a29dabd73771b0355d4f85ad` Ethereum Seer (registered Reality proxy) | the charset-sensitive Reality renderer `QmQGMR…`; on-chain derivation | options "Harris", "Trump", reserved "Answered Too Soon"; no script run in production or new app; also the runner regression input (C7) |
| 1677 | `0xf72cfd1b34a91a64f9a98537fe63fbab7530adca` Ethereum DAO governance | Reality single-chain, template 139, 1 evidence | verified notice state "none" |
| 1673 | same | Reality single-chain, template 20, 5 evidence | attachments linked, never fetched |
| 1658 | `0x3fb8314c628e9afe7677946d3e23443ce748ac17` Unichain foreign proxy | Reality cross-chain, home Unichain, uint template, fully withdrawn | ruling text decoded as a number; withdraw shows zero |
| 1657 | `0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68` Seer foreign proxy | cross-chain, home Gnosis, 15 evidence, ruling = max uint | "Answered Too Soon"/invalid ruling text |
| 1661 | same | cross-chain, 11 evidence | |
| 1668 | `0xf0b37feda6cdf5f78b37e1fbccc24969059f2044` | cross-chain, home Base, 0 evidence | the only Base-home dispute |
| 1586 | `0x68c4cc21…` Polkamarkets foreign proxy | cross-chain, home Polygon | must load; its production load status was not verified during research |
| 1674 | `0xbE9834097A4E97689d9B667441acafb456D0480A` Proof of Humanity v2 | not IDisputeResolver; 3 evidence; executed | case-page view-only banner; executed, so no appeal cards; the D-47 note replaces production's empty withdraw body |
| 1667 | same | PoH v2 with round count 2 | |
| 1646 | `0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb` Proof of Humanity v1 | view-only, 3 evidence, court 23 | |
| 1255 | `0xEbcf3bcA271B26ae4B162Ba560e243055Af0E679` T2CR | evidence display named as `https://ipfs.kleros.io/ipfs/QmYs17m…/index.html`; meta-evidence event not decodable with a plain string decoder; 3 evidence | display iframe present with gateway origin (D-26); "Yes, Add It / No, Don't Add It"; loads as in production |
| 1659 | `0xda03509bb770061a61615ad8fc8e1858520ebd86` LightGTCR | Curate dispute | |
| 1649 | `0x4A9f8e73b3c4c9d7fA0210b9de457b1c493a3AdA` Seer Curate | Curate variant | |
| 1100 | `0x99a0f0e0d9ee776d791d2e55c215d05ccf7286fc` GTCR classic | Curate classic | loads in production today; must load in the new app |
| 1621 | `0x327a29fcE0a6490E4236240Be176dAA282EcCfdF` poh.eth governor | governor family; script `QmdpXX…` (production uses the `Qmf1k7…` override); 2 evidence | options "List 7", "List 8"; identical options from the original script (D-25); withdraw panel through the governor dialect under the account context (D-47); the evidence write path is exercised in the live tier |
| 1676 | same | recent governor dispute, 1 evidence | |
| 1672, 535 | `0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4` kleros.eth governor | governor without evidence function; script `QmX9qws…` runs same-origin in production today | "List N" options from the governor's submitted lists (observed "List 0", "List 1" on 535); case-page view-only banner for evidence, as today; withdraw panel through the governor dialect under the account context (D-47) |
| 878 | `0xC25a0b9681ABF6F090AEd71a8c08fB564b41dab6` Escrow V1 | Escrow family, 2 evidence | appeal panel kind `escrow-ended` in execution; "Tutorial UBI P2P" |
| 168, 92 | `0x0d67440946949fe293b45c52efd8a9b3d51e2522` Escrow V1 (the lowercase entry) | 168: appealed, round count 3, 7 evidence; 92: 3 evidence | production treats it as IDisputeResolver because the address never matched (Q12); new app: Escrow family (D-12). Expected difference recorded |
| 1678 | `0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38` Unslashed | IDisputeResolver v1, round-index offset, 8 evidence, 0.273 ETH contributed and 0.823 withdrawn on local dispute 116 | withdraw panel amounts; decides the round-offset rule (D-30) |
| 1226 | same | Unslashed appealed, executed | Unslashed withdraw rules (D-30); the hidden option-0 card is a component test, not observable on an executed case |
| 1665, 1666 | `0x412c0617…`, `0xd6bf90e1…` Polygon foreign proxies | fail to load in production and locally (home-proxy call reverts) | new app: dispute info and timeline render, meta-evidence section degrades with a message; no blank page (D-36) |
| 150 | `0x594ec762b59978c97c82bc36ab493ed8b1f1f368` | unpinned meta-evidence, 2¹²⁸−1 choices | "Failed to load meta-evidence" state; dispute info and timeline still render (D-36; production renders no details) |
| 560 | `0xc5e9ddeb…` PoH v1 | meta-evidence is a PDF, not JSON | invalid/failed meta-evidence state; rest of page renders (D-36) |

### Gnosis (chain 100)

| Dispute | Arbitrable | Exercises | Expected highlights |
|---|---|---|---|
| 431 | `0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c` ArbitrableProxy | resolver dispute "DAI Token Compliance Review", 2 evidence | xDai currency labels (D-10) |
| 460 | same | latest resolver dispute, 0 evidence; its evidence group breaks the agentkit subgraph query | must load |
| 454 | same | 1 evidence | |
| 0 | `0x1128eD55ab2d796fa92D2F8E1f336d745354a77A` (also the address of the Görli arbitrator, a deployer-nonce collision) | multiple-select resolver dispute, titles A/B/C, 8 choices, ruling 5 (bitmask); IDisputeResolver v1 | decision text decodes the bitmask; executed, so no cards (combination cards: Sepolia S1 and a component test); withdraw via v1 signature (D-49) |
| 229 | `0xe04f5791d671d5c4e08ab49b39807087b591ea3e` Moderate | Reality multiple-select (template 3), ruling 12 | options Red/Blue/1234/Yellow derived on-chain |
| 416 | same | Reality single-chain, template 76, `%20`-encoded policy path | |
| 121, 120, 118 | same | appealed, round count 2, 44.8 xDAI never withdrawn each | withdraw panel amounts under the account context (D-02 test) |
| 220 | same | unfunded appeal refund, 1.0 xDAI contributed, 8 evidence | refund visible as withdrawable |
| 58 | `0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001` | Reality bool template | options No/Yes |
| 132 | `0x54068a67441a950ff33afa5a3247acc7188d0789` Moderate ES | Spanish localization (`localizedLang: "es"`); 152.32 xDAI unclaimed | labels "Sí", "Respondió demasiado pronto"; withdraw amounts under the account context (D-02 test) |
| 1022 | `0x957a53a994860be4750810131d9c876b2f52d6e1` Curate | removal-request wording | |
| 115 | `0xf7dE5537eCD69a94695fcF4BCdBDeE6329b63322` fork-dao governor | meta-evidence event not decodable; fails to load in production | new app: degrades per section, no blank page (D-36) |
| 863 | `0x25fA9432832EFdD48DEec6D4Cf1cD3f139678a5b` | meta-evidence re-emitted with an absolute gateway URL | "invalid or tampered" placeholder in both apps (meta-evidence URIs must be content-addressed; the gateway rule D-26 applies to displays and attachments only) |
| 44, 41, 42 | `0x01f292c270f1d477019e9b16465a7c411a160ca9` | meta-evidence URIs on the dead `https://ipfs.kleros.io` host | "invalid or tampered" placeholder in both apps |
| 140 | `0x62B286a93D6F720A654745A3451f71cF71481b81` | unparseable meta-evidence JSON | failed meta-evidence state; rest renders (D-36) |

### Pending execution (promote when executed)

| Dispute | Arbitrable | Exercises | Expected once stable |
|---|---|---|---|
| mainnet 1680 | `0xf72cfd1b…` | Reality question `0x7eea…` crafted to mislead reality-eth-lib; 0.4862 ETH contributed to ruling 1 in round 0; in the appeal period on 2026-10-14 | `divergent` notice; withdraw panel with the unclaimed amount under the account context |
| mainnet 1684 | `0x799CB978dEa5d6cA00cCB1794D3c3D4c89e40cD1` | dynamic script not allowlisted (wallet-hijack attempt); in the vote period on 2026-10-14 | "Invalid or tampered case data" placeholder, option 0 only, nothing cached; the placeholder is period-independent, so the live tier can check it meanwhile |

### Promotion rule

A live-tier dispute joins the stable tier once it executes, if it adds a combination not yet covered (for instance 1036 and 1026, Gnosis PoH v2 disputes that were in vote and appeal on 2026-10-12).

## 3. Live tier

Period-dependent behavior (evidence submission control, commit and vote states, appeal crowdfunding with live amounts) cannot be pinned to IDs because disputes move on within days. A script, `scripts/golden-live`, selects them at run time:

1. For each chain with an arbitrator (1, 100, 11155111, 10200), read `DisputeCreation` and `NewPeriod` logs over the same look-back window the Ongoing page uses, then `disputes(id)` for each open dispute.
2. Pick, per chain and per period 0 to 3, the newest dispute in that period; for the appeal period prefer one with at least one `Contribution` event.
3. Write the selection as JSON with the block number it was taken at; the Playwright run consumes it.

Expected checks per period: period label and timeline state; the submit-evidence control is shown in periods 0 to 3 for compatible arbitrables and disabled for view-only ones; the appeal panel exists only in periods 3 and 4; in period 3 each crowdfunding card shows funded percentage, remaining amount and deadline, with the winner's deadline not earlier than the loser's.

## 4. Sepolia disputes to create

No dispute on mainnet or Gnosis exercises these paths. They are created once through the new app's Create page on Sepolia (chain 11155111) and become stable-tier targets. The app contains no code for this; only the IDs are recorded here afterwards.

| ID | Create with | Then | Exercises |
|---|---|---|---|
| S1 | multiple-select, 3 options, a primary document attached | submit one evidence with an attachment, then let it reach the appeal period | 2³ combination cards in the appeal period; Atlas uploads with both roles; attachment links |
| S2 | uint ("Non-negative number") | let it reach appeal | variable-type appeal cards: free input, encoding `answer + 1` (precision rules are unit-tested under D-15, since the create form writes no precision) |
| S3 | datetime ("Date") | let it reach appeal | date picker card; encoding with full timestamp (D-17) |
| S4 | single-select, 2 options | fund both sides in the appeal period, let it execute | withdraw panel with a positive withdrawable amount; "won by default" vs "jury decision" text |

Court and juror count are the maintainer's choice; a court with short periods keeps the cycle tractable.

## 5. Dynamic-script output-equivalence gate (checklist C6)

Before cutover, `scripts/golden-gate` executes every allowlisted script referenced by at least one existing dispute on a supported chain in the old runner (today's `fetchDataFromScript`, with its production flags) and in the new runner, with the same parameters, and the outputs compared.

| Script | Disputes | Expected |
|---|---|---|
| `QmZZHw…` default | mainnet 1454, 505, 912; Gnosis 431, 0 | identical `arbitrableInterfaceURI` |
| `QmdpXX…` PoH and fork-dao governors | mainnet 1621, 1676; Gnosis 115 | identical "List N" options; Gnosis 115 fails before the script runs in both |
| `Qmf1k727…` 1621 override (being deleted) | mainnet 1621 | identical to `QmdpXX…` on the same dispute, which justifies the deletion |
| `QmX9qws…` kleros.eth governor | mainnet 1672, 535 | identical options; this script runs same-origin in production and strictly in the new runner |
| Reality renderers for unregistered proxies (`QmSsM1…`, `QmUkK8…`, `QmQGMR…`, `QmWWsDmv…`, the Sepolia and Chiado bundles) | every Sepolia and Chiado dispute of an allowlisted Reality proxy, enumerated by the gate script | identical options. In production the same-origin frame decodes UTF-8; the new runner must match, which is the charset regression this gate exists for |
| `QmchWC…` Linguo mainnet | its disputes, enumerated | production fails (dead Infura key). The new runner's host-pattern redirect may succeed; a success is reviewed by hand and recorded in the ledger as an improvement |
| `QmPAHCRt…` Linguo Gnosis | its disputes, enumerated | by the rule below; the static scan found no hardcoded host |
| `QmZ8gH…`, `QmVmXu…` TheBadge and Curate (Sepolia) | their disputes, enumerated | both fail on the dead `ipfs.kleros.io` host; same failure class |
| remaining allowlisted CIDs | enumerated by the gate script from meta-evidence files; a CID with no referencing dispute is reported as unexercised | identical |

Rule: where production succeeds, outputs must be identical. An empty `{}` result or charset-garbled output from production counts as a production failure, so a Reality renderer that returns its options in the new runner is an allowed improvement (D-29). Where production fails, the new runner may succeed; each such case is reviewed and recorded. Where both fail, the failure class must match. The run log is attached to the cutover pull request.
