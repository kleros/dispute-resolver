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
  11155111: "0x90992fb4E15ce0C59aEFfb376460Fda4Ee19C879",
};

const policyRegistries = {
  1: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
  5: "0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA",
}

const arbitratorDeployedAtBlock = {
  1: 7303699,
  5: 5893941,
  11155111: 3635742,

}

const map = {
  1: {
    NAME: "Ethereum Mainnet",
    KLEROS_LIQUID: arbitrators["1"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[1]?.address,
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["1"],
  },
  5: {
    NAME: "Ethereum Testnet Görli",
    KLEROS_LIQUID: arbitrators["5"],
    ARBITRABLE_PROXY: "0x78ac5F189FC6DAB261437a7B95D11cAcf0234FFe",
    POLICY_REGISTRY: "0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_GOERLI_PROVIDER_URL,
    CURRENCY_SHORT: "ETH",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["5"],
  },
  100: {
    NAME: "Gnosis Network",
    KLEROS_LIQUID: arbitrators["100"],
    ARBITRABLE_PROXY: ArbitrableProxy.networks[100].address,
    POLICY_REGISTRY: "0x9d494768936b6bDaabc46733b8D53A937A6c6D7e",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL,
    CURRENCY_SHORT: "xDai",
    QUERY_FROM_BLOCK: 16895601,
  },
  137: {
    NAME: "Polygon Mainnet",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_POLYGON_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_LIQUID: arbitrators["1"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "1",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["1"],
  },
  300: {
    NAME: "zkSync Era Testnet Sepolia",
    FOREIGN_KLEROS_LIQUID: arbitrators["11155111"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "11155111",
    ARBITRABLE_PROXY: null,
    POLICY_REGISTRY: policyRegistries["11155111"],
    WEB3_PROVIDER: "https://sepolia.era.zksync.dev/",
    CURRENCY_SHORT: "sETH",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["11155111"],
  },
  324:{
    NAME: "zkSync Era Mainnet",
    FOREIGN_KLEROS_LIQUID: arbitrators["1"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "1",
    ARBITRABLE_PROXY: null,
    POLICY_REGISTRY: policyRegistries["1"],
    WEB3_PROVIDER: "https://mainnet.era.zksync.io",
    CURRENCY_SHORT: "ETH",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["1"],
  },
  80001: {
    NAME: "Polygon Testnet Mumbai",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_MUMBAI_PROVIDER_URL,
    CURRENCY_SHORT: "MATIC",
    FOREIGN_KLEROS_LIQUID: arbitrators["5"],
    FOREIGN_ARBITRATOR_NETWORK_CODE: "5",
    QUERY_FROM_BLOCK: arbitratorDeployedAtBlock["5"],
  },
  10200: {
    NAME: "Gnosis Testnet Chiado",
    KLEROS_LIQUID: arbitrators["10200"],
    ARBITRABLE_PROXY: "0x4BEf0321BD7fa943f85ae55e07f790c6beCbd177",
    POLICY_REGISTRY: "0x53FC70FE1EC3a60f8939A62aBCc61bf1A57938D7",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_CHIADO_PROVIDER_URL,
    CURRENCY_SHORT: "xDai",
    QUERY_FROM_BLOCK: 1165867,
  },
  11155111: {
    NAME: "Ethereum Testnet Sepolia",
    KLEROS_LIQUID: arbitrators["11155111"],
    ARBITRABLE_PROXY: "0x009cA5A0B816156F91B29A93d7688c52480BaB24",
    POLICY_REGISTRY: "0x88Fb25D399310c07d35cB9091b8346d8b1893aa5",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_SEPOLIA_PROVIDER_URL,
    CURRENCY_SHORT: "sETH",
    QUERY_FROM_BLOCK: 3635742,
  },
};

export default map;

export function getReadOnlyRpcUrl({ chainId }) {
  const url = map[parseInt(chainId)].WEB3_PROVIDER;
  return url;
}
