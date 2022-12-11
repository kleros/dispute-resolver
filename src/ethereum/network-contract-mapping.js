import ArbitrableProxy from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";

const arbitrators = {
  1: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
  3: "0xab942e7d2bff0bc5614c968ccc91198fd223c57e",
  4: "0x6e376E049BD375b53d31AFDc21415AeD360C1E70",
  5: "0x1128eD55ab2d796fa92D2F8E1f336d745354a77A",
  42: "0x60b2abfdfad9c0873242f59f2a8c32a3cc682f80",
  77: "0xb701ff19fBD9702DD7Ca099Ee7D0D42a2612baB5",
  100: "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002",
  10200: "0xD8798DfaE8194D6B4CD6e2Da6187ae4209d06f27",
};

const map = {
  1: {
    NAME: "Ethereum Mainnet",
    KLEROS_LIQUID: arbitrators["1"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[1]?.address,
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
  },
  3: {
    NAME: "Ethereum Testnet Ropsten",
    KLEROS_LIQUID: arbitrators["3"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[3].address,
    POLICY_REGISTRY: "0xe4ee06e5c9921d7e4d4ab62199c8c4b5267a7547",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ROPSTEN_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
  },
  4: {
    NAME: "Ethereum Testnet Rinkeby",
    KLEROS_LIQUID: arbitrators["4"],
    ARBITRABLE_PROXY: "0xe83BCc07C57d2260102C189f780AF6a7bc34a83d",
    POLICY_REGISTRY: "0xCd444af85127392cB84b8583a82e6aE6230Ec0b9",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_RINKEBY_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
  },

  5: {
    NAME: "Ethereum Testnet Görli",
    KLEROS_LIQUID: arbitrators["5"],
    ARBITRABLE_PROXY: "0x78ac5F189FC6DAB261437a7B95D11cAcf0234FFe",
    POLICY_REGISTRY: "0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_GOERLI_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
  },

  42: {
    NAME: "Ethereum Testnet Kovan",
    KLEROS_LIQUID: arbitrators["42"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[42].address,
    POLICY_REGISTRY: "0xFC53D1d6dDc2C6Cdd403cb7DBf0f26140D82e12d",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_KOVAN_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
  },

  77: {
    NAME: "POA Network Sokol",
    KLEROS_LIQUID: arbitrators["77"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[77].address,
    POLICY_REGISTRY: "0x0Bee63bC7220d0Bacd8A3c9d6B6511126CDfe58f",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_SOKOL_PROVIDER_URL,
    CURRENCY_SHORT: "SPOA",
  },

  100: {
    NAME: "Gnosis Network",
    KLEROS_LIQUID: arbitrators["100"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[100].address,
    POLICY_REGISTRY: "0x9d494768936b6bDaabc46733b8D53A937A6c6D7e",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL,
    CURRENCY_SHORT: "xDai",
  },

  137: {
    NAME: "Polygon Mainnet",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_POLYGON_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_LIQUID: arbitrators["1"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "1",
  },

  80001: {
    NAME: "Polygon Testnet Mumbai",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_MUMBAI_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_LIQUID: arbitrators["5"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "5",
  },

  10200: {
    NAME: "Gnosis Testnet Chiado",
    KLEROS_LIQUID: arbitrators["10200"],
    ARBITRABLE_PROXY: "0x4BEf0321BD7fa943f85ae55e07f790c6beCbd177",
    POLICY_REGISTRY: "0x53FC70FE1EC3a60f8939A62aBCc61bf1A57938D7",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_CHIADO_PROVIDER_URL,
    CURRENCY_SHORT: "xDai",
  },
};

export default map;

export function getReadOnlyRpcUrl({ chainId }) {
  const url = map[parseInt(chainId)].WEB3_PROVIDER;
  return url;
}
