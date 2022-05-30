[![Netlify Status](https://api.netlify.com/api/v1/badges/e6238990-c148-433c-8007-46680779c8b3/deploy-status)](https://app.netlify.com/sites/dispute-resolver/deploys)
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
