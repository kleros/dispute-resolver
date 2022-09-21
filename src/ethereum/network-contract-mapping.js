import DisputeResolver from "../contracts/DisputeResolver.json";

const arbitrators = {
  1: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
  3: "0xab942e7d2bff0bc5614c968ccc91198fd223c57e",
  4: "0x6e376E049BD375b53d31AFDc21415AeD360C1E70",
  5: "0x1128eD55ab2d796fa92D2F8E1f336d745354a77A",
  42: "0x60b2abfdfad9c0873242f59f2a8c32a3cc682f80",
  77: "0xb701ff19fBD9702DD7Ca099Ee7D0D42a2612baB5",
  100: "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002",
  421611: "0x815d709EFCF5E69e2e9E2F8d3815d762496a2f0F",
  421613: "0x87142b7E9C7D026776499120D902AF8896C07894",
}

const map = {
  1: {
    NAME: "Ethereum Mainnet",
    KLEROS_CORE: arbitrators["1"],
    DISPUTE_RESOLVER: DisputeResolver.networks[1]?.address,
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },
  3: {
    NAME: "Ethereum Testnet Ropsten",
    KLEROS_CORE: arbitrators["3"],
    DISPUTE_RESOLVER: DisputeResolver.networks[3].address,
    POLICY_REGISTRY: "0xe4ee06e5c9921d7e4d4ab62199c8c4b5267a7547",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ROPSTEN_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"

  },
  4: {
    NAME: "Ethereum Testnet Rinkeby",
    KLEROS_CORE: arbitrators["4"],
    DISPUTE_RESOLVER: "0xe83BCc07C57d2260102C189f780AF6a7bc34a83d",
    POLICY_REGISTRY: "0xCd444af85127392cB84b8583a82e6aE6230Ec0b9",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_RINKEBY_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  5: {
    NAME: "Ethereum Testnet Görli",
    KLEROS_CORE: arbitrators["5"],
    DISPUTE_RESOLVER: "0x78ac5F189FC6DAB261437a7B95D11cAcf0234FFe",
    POLICY_REGISTRY: "0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_GOERLI_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  42: {
    NAME: "Ethereum Testnet Kovan",
    KLEROS_CORE: arbitrators["42"],
    DISPUTE_RESOLVER: DisputeResolver.networks[42].address,
    POLICY_REGISTRY: "0xFC53D1d6dDc2C6Cdd403cb7DBf0f26140D82e12d",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_KOVAN_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  77: {
    NAME: "POA Network Sokol",
    KLEROS_CORE: arbitrators["77"],
    DISPUTE_RESOLVER: DisputeResolver.networks[77].address,
    POLICY_REGISTRY: "0x0Bee63bC7220d0Bacd8A3c9d6B6511126CDfe58f",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_SOKOL_PROVIDER_URL,
    CURRENCY_SHORT: "SPOA"

  },

  100: {
    NAME: "xDAI Chain",
    KLEROS_CORE: arbitrators["100"],
    DISPUTE_RESOLVER: DisputeResolver.networks[100].address,
    POLICY_REGISTRY: "0x9d494768936b6bDaabc46733b8D53A937A6c6D7e",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL,
    CURRENCY_SHORT: "xDai"
  },

  42161: {
    NAME: "Arbitrum One",
    KLEROS_CORE: arbitrators["42161"],
    DISPUTE_RESOLVER: "",
    POLICY_REGISTRY: "",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ARBITRUM_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  421611: {
    NAME: "Arbitrum Rinkeby",
    KLEROS_CORE: arbitrators["421611"],
    DISPUTE_RESOLVER: DisputeResolver.networks[421611].address,
    POLICY_REGISTRY: "0x76262035D1b280cC0b08024177b837893bcAd3DA",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ARBITRUM_RINKEBY_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  421613: {
    NAME: "Arbitrum Goerli",
    KLEROS_CORE: arbitrators["421613"],
    DISPUTE_RESOLVER: DisputeResolver.networks[421613].address,
    POLICY_REGISTRY: "0xf637A0a4415CCFB97407846486b6be663d3C33ef",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ARBITRUM_GOERLI_PROVIDER_URL,
    CURRENCY_SHORT: "ETH"
  },

  137: {
    NAME: "Polygon Mainnet",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_POLYGON_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_CORE: arbitrators["1"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "1"

  },

  80001: {
    NAME: "Polygon Testnet Mumbai",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_MUMBAI_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_CORE: arbitrators["5"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "5"
  },

};

export default map;

export function getReadOnlyRpcUrl({ chainId }) {
  const url = map[parseInt(chainId)].WEB3_PROVIDER;
  return url;
}
