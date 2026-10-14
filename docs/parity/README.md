# Parity documents for the Dispute Resolver rewrite

**Status: draft.** These documents become the contract for the rewrite when the maintainer freezes them. After the freeze they change only through an entry in the deviations ledger. Until then, corrections are welcome in place.

**Confirm before freeze.** The following were decided while reconciling the documents and have not been approved by the maintainer. Each needs a verdict, and the ledger entry is adjusted if the verdict differs.

1. **Safe wallet not supported** (ADR 0002, D-06, C1): the app forbids being framed, and Safe's connector only works inside Safe's iframe. Alternative: allow `frame-ancestors https://app.safe.global` on app routes, at the cost of one permitted embedder.
2. **The URL is the page chain** (D-55): a wallet chain change no longer navigates or reloads; the header switcher changes the URL and asks the wallet to follow.
3. **No appeal panel for families that cannot fund** (D-47): governor and view-only disputes show a note in the appeal period and nothing in execution, where today they show unusable cards or an empty withdraw body.
4. **Withdrawals across several rulings in sequence** (D-51): one transaction per ruling, instead of today's first-non-zero ruling only.
5. **Display allowlist keeps today's lookup key** (B6 accepted with mitigation, D-34), rather than re-keying by arbitrator chain.
6. **Testnet Reality proxies stay unregistered** (06 §5.4).
7. **Combination picker above eight options** (D-33) instead of 2ⁿ cards.
8. **Uniform Unslashed round offset** (D-30), pending verification on mainnet 1678.


The rewrite (see `docs/adr/`) replaces the application without changing what it does for users, except where this set says so explicitly. Six files divide that promise into checkable parts:

| File | What it is | Who uses it |
|---|---|---|
| [02-behavioral-spec.md](02-behavioral-spec.md) | What the **current** app does, screen by screen, in normative voice with references to today's source. It never describes the new app. | builders implement to it; testers check against it |
| [03-security-checklist.md](03-security-checklist.md) | Every security control the current app has, every weakness found in it, and every hardening added by the rewrite, each with its new home and the test that proves it. Nothing merges to master until every row is green. | the merge gate |
| [04-golden-cases.md](04-golden-cases.md) | Real disputes the new app must render equivalently to production, the shape of the comparison, the live-tier selection procedure, the Sepolia disputes to create, and the dynamic-script output-equivalence gate. | the Playwright suite and manual verification |
| [05-deviations-ledger.md](05-deviations-ledger.md) | Every place where the new app deliberately behaves differently from the spec: the 13 known quirks that get fixed, the bugs found during research, and the design decisions that change behavior. Today / new / why / test for each. | reviewers deciding whether a difference is a regression or a recorded deviation |
| [06-registry-schema.md](06-registry-schema.md) | ADR 0003 made concrete: the family-detection order and probes, the override schema, invariants, the verdict for every special case in the current code, and the verifications still owed before porting. | whoever builds `core` |

Reading rule: the spec describes the old app, the ledger describes the change, the checklist gates the merge. A sentence in the spec that starts describing the new app belongs in the ledger.

## Terms

Words the other files lean on. Definitions describe the Kleros v1 arbitration model as this app uses it.

- **Arbitrator**: the court contract that draws jurors and rules. For this app, KlerosLiquid on Ethereum mainnet and Sepolia, xKlerosLiquid on Gnosis and Chiado. A dispute's ID is the arbitrator's ID.
- **Arbitrable**: the contract that created a dispute and receives the ruling. Every dispute has exactly one; the arbitrator records it as `arbitrated`. The app's own arbitrable is the **ArbitrableProxy**, used by the Create page.
- **IDisputeResolver**: the optional interface an arbitrable may implement so that this app can submit evidence and fund appeals on its disputes (local dispute IDs, `fundAppeal`, withdrawals). Two versions exist, v1 and v2, differing in the withdrawal signatures. An arbitrable that matches no family is **view only** here; escrows and governors have families of their own.
- **Family**: the behavioral class of an arbitrable as the registry sees it: Reality.eth proxy, Escrow V1, governor with URI-only evidence, IDisputeResolver v2 or v1, or view only. Detected by **probes** (selector presence in the contract's bytecode) or by a registry entry.
- **Override**: a registry data entry, keyed by chain and address, that changes behavior for one contract because no generic rule can. Every override carries a **justification** string.
- **Meta-evidence**: the JSON describing a dispute (title, description, question, ruling options, links, optional dynamic script and evidence display), referenced by a URI the arbitrable emitted. **Evidence** is the JSON describing one submission (name, description, attachment). Both are untrusted input authored by the dispute's parties.
- **Content-addressed URI**: an IPFS path whose first segment is a CID (`/ipfs/<CID>/…`, `ipfs://<CID>`), so the bytes cannot change under the pointer. An IPNS name or an HTTP host is not content-addressed.
- **Dynamic script**: JavaScript named by the meta-evidence `dynamicScriptURI` that the app executes to compute ruling options and links at view time. Runs only if its CID is on the **dynamic-script allowlist**. Executed in the **runner**, the sandboxed page of ADR 0004.
- **Evidence display**: a web page named by `evidenceDisplayInterfaceURI` that the app embeds in an iframe with the dispute's identifiers as query parameters. The **arbitrable allowlist** decides which displays get relaxed iframe flags.
- **Reality.eth proxy**: an arbitrable that bridges a Reality.eth question to the court. **Registered** proxies are in the proxy registry and have their ruling options derived on-chain from the question; **unregistered** ones run their dynamic script like any other arbitrable. A **cross-chain** proxy arbitrates on one chain while the question lives on its **home chain**.
- **Period**: a dispute's phase on the arbitrator: evidence (0), commit (1), vote (2), appeal (3), execution (4).
- **Round**: one appeal cycle. **Contribution**: a crowdfunding payment toward one ruling option in a round. An option is **funded** when its contributions reach its required amount; the required amount depends on whether the option is the current winner.
- **Atlas**: the Kleros backend that authenticates users with Sign-In with Ethereum (**SIWE**) and pins uploads to IPFS. Uploads name a product (`CourtV1`) and a role (`evidence`, `policy`).
- **Golden case**: a real dispute used as a regression target. **Stable tier**: executed disputes whose state no longer changes. **Live tier**: disputes selected at run time because they are currently in a given period.
- **Parity snapshot**: the structured extract of a rendered screen (defined in 04) that is compared between production and the new app. Styling is not part of it.
- **Deviation**: a deliberate difference between the new app and the spec, recorded in the ledger with a test. Any other difference is a regression.
- **Quirk (Q1–Q13)**: one of the 13 oddities of the current app enumerated in the spec; all are fixed and appear in the ledger as D-01 to D-13.
- **Integration branch**: `feat/rewrite`, the single long-lived branch the rewrite lands on. **Branch deploy**: Netlify's build of that branch, the parallel environment. **Cutover**: the merge of the integration branch to master, which makes the branch deploy the production site.
- **Gate script**: `scripts/golden-gate`, the tool that selects live-tier disputes, extracts contributor accounts, and runs the dynamic-script equivalence gate.
- **Product names that appear in the cases**: T2CR (the Kleros Token Curated Registry, 2019–2021), Curate / GTCR / LightGTCR (generalized curated lists), Proof of Humanity v1 and v2 (identity registry), Seer (prediction markets on Reality.eth), Moderate (Telegram moderation on Reality.eth), Linguo (translation marketplace), Unslashed (insurance; one arbitrable with non-standard behavior), the governors (poh.eth, ubi-voting.eth, fork-dao.eth, kleros.eth: on-chain governance contracts that open disputes on submitted lists).
- **EIPs referenced**: EIP-1967 (storage slot that names an upgradeable proxy's implementation), EIP-1167 (minimal proxy clones that delegate everything to a fixed implementation), EIP-7702 (accounts whose code is a delegation marker `0xef0100…`, treated as plain accounts by the smart-contract-wallet check), EIP-6963 (browser wallets announcing themselves to pages), EIP-4361 (Sign-In with Ethereum message format), EIP-1193 (the provider interface wallets expose).

## Process rules that have no other home

- **CI gates** (per pull request to the integration branch): typecheck, lint, unit and component tests, build. Netlify builds with `CI=true` so warnings fail the build. The Playwright golden-case suite runs on demand and nightly against the branch deploy, not as a per-pull-request gate because it depends on live chains; it is the cutover gate (ADR 0001).
- **Freeze**: the maintainer marks this README `Status: frozen` with the date. From then on, behavior changes are ledger entries first.
- **Reviews**: every security-checklist row is reviewed by someone other than its author before it is marked green.
- **Inputs**: the research these documents distill from (security controls, hardcoded cases, branch audit, behavioral inventory, special-case root causes, Atlas and golden-case research, sandbox study) is kept outside the repository by the maintainer; statements here cite today's source directly where it matters.
