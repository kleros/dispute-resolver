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

Renders the Ongoing Disputes page from the JSON files in `src/fixtures/ongoing/` instead of the network. It is off unless `REACT_APP_USE_FIXTURES=true`; with it off the app behaves as before. Only the Ongoing Disputes page is fixture-backed, other pages still use the network.

| Variable | Effect |
| --- | --- |
| `REACT_APP_USE_FIXTURES=true` | Enables fixture mode. The wallet is not used and the chain in the URL is replaced by the fixture chain. |
| `REACT_APP_FIXTURE_CHAIN_ID` | Chain whose fixture is used: `100` (Gnosis, 8 disputes) or `1` (Mainnet, no disputes). Defaults to `1`. A deliberately malformed dispute is kept in `src/fixtures/ongoing/100.malformed.json` and is not loaded. |
| `REACT_APP_FIXTURE_DELAY_MS` | Milliseconds to wait before every fixture read, to see the loading state. |
| `REACT_APP_FIXTURE_FAIL=true` | Makes the open disputes read fail, to see the error state. |

```
REACT_APP_USE_FIXTURES=true REACT_APP_FIXTURE_CHAIN_ID=100 yarn start
```

## Reporting an Issue

Please open up a Github issue describing your problem and if it's urgent reach out to [me](https://github.com/0xferit) via email or [Telegram](https://t.me/ftunc).
