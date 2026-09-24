[![Netlify Status](https://api.netlify.com/api/v1/badges/e6238990-c148-433c-8007-46680779c8b3/deploy-status)](https://app.netlify.com/sites/dispute-resolver/deploys)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)

[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)

[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=bugs)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=kleros_dispute-resolver&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=kleros_dispute-resolver)



# Dispute Resolver
A general purpose arbitrable application. 

- Create disputes just by filling a form.
- List open disputes.
- See dispute details.
- Submit evidence.
- Fund appeals.

This user interface implements [IDisputeResolver](https://github.com/kleros/dispute-resolver-interface-contract). Any arbitrable smart contract will be fully compatible (for submitting evidence and funding appeals) with this user interface if it implements `IDisputeResolver` . Otherwise interface will work except evidence submissions and appeal funding.

See deployed contracts [here](https://github.com/kleros/binary-arbitrable-proxy/blob/master/src/ethereum/network-contract-mapping.js).

To allow viewing app data without a web3 browser, set the REACT_APP_WEB3_PROVIDER_URL environment variable to a web3 provider endpoint. Sending transactions will not be possible without a wallet.

## Fixture mode

Renders the Ongoing Disputes page and the case page from the JSON files in `src/fixtures/` instead of the network. It is off unless `REACT_APP_USE_FIXTURES=true`; with it off the app behaves as before. The Create page still uses the network.

| Variable | Effect |
| --- | --- |
| `REACT_APP_USE_FIXTURES=true` | Enables fixture mode. The wallet is not used and the chain in the URL is replaced by the fixture chain. |
| `REACT_APP_FIXTURE_CHAIN_ID` | Chain whose fixture is used: `100` (Gnosis, 8 disputes) or `1` (Mainnet, no disputes). Defaults to `1`. |
| `REACT_APP_FIXTURE_SIGNED_IN=true` | Shows the connected and signed-in UI (a fixed placeholder account). There is still no wallet. |
| `REACT_APP_FIXTURE_WRITES` | `success` (default) or `failure`. Write actions never reach a wallet; they report the outcome the way the real handlers do: appeal and withdrawal resolve `null` on failure, evidence submission, uploads and sign-in reject. Nothing in the fixture changes. |
| `REACT_APP_FIXTURE_DELAY_MS` | Milliseconds to wait before every fixture read, to see the loading states. |
| `REACT_APP_FIXTURE_FAIL=true` | Makes every fixture read fail: the Ongoing page shows its error state and a case page shows the failed-load error (distinct from "dispute not found"). |
| `REACT_APP_FIXTURE_FAIL_READS` | Comma-separated reads that should fail, to see a case page degrade per section, e.g. `evidences,multipliers`. Names: `openDisputes`, `arbitratorDispute`, `metaEvidence`, `subcourts`, `arbitrableDisputeID`, `disputeDetails`, `currentRuling`, `appealCost`, `appealPeriod`, `disputeEvent`, `evidences`, `ruling`, `multipliers`, `appealDecisions`, `contributions`, `rulingFunded`, `totalWithdrawable`. |
| `REACT_APP_FIXTURE_VARIANT=malformed` | Also lists the malformed dispute on the Ongoing page. |

```
REACT_APP_USE_FIXTURES=true REACT_APP_FIXTURE_CHAIN_ID=100 yarn start
```

### Fixture files

Both Gnosis fixtures were captured at block 48403425 (2026-09-23T20:00:40Z) from an archive RPC, and both Mainnet fixtures at block 26042422, by replaying the reads of `src/app.js` with every call pinned to that block. The block timestamp is the fixed "now" of fixture mode, so periods and countdowns are the same on every load (the evidence display iframe still loads from IPFS and is not covered).

| File | Contents |
| --- | --- |
| `ongoing/<chain>.json` | Open dispute IDs, the KlerosLiquid dispute structs, the meta-evidence and the subcourts, as the Ongoing page reads them. |
| `cases/<chain>.json` | The case page reads of those disputes: local dispute ID, `getDispute` details, current ruling, appeal cost and period, the Dispute event, evidence, multipliers, appeal decisions, contributions and funded rulings. |
| `cases/100.handmade.json` | Hand-made Gnosis cases, never listed on the Ongoing page but opened by ID: `900001` (four-outcome multi-select in appeal with partial crowdfunding), `900002` (free-value question in appeal), `900003` (missing meta-evidence). |
| `ongoing/100.malformed.json` | A deliberately malformed dispute, `999999`, that opens by ID on the case page; its case reads live in `cases/100.handmade.json`. |

Numeric contract values are stored as decimal strings; the loader in `src/fixtures/index.js` restores the BigInt values ethers returns in production. Any ID without a record, such as `123456789`, is a non-existent dispute.

## Reporting an Issue

Please open up a Github issue describing your problem and if it's urgent reach out to [me](https://github.com/0xferit) via email or [Telegram](https://t.me/ftunc).
