import ArbitrableProxy from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";

const map = {
  1: {
    NAME: "Ethereum Mainnet",
    KLEROS_LIQUID: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[1]?.address,
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_PROVIDER_URL,
  },
  3: {
    NAME: "Ethereum Testnet Ropsten",
    KLEROS_LIQUID: "0xab942e7d2bff0bc5614c968ccc91198fd223c57e",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[3].address,
    POLICY_REGISTRY: "0xe4ee06e5c9921d7e4d4ab62199c8c4b5267a7547",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_ROPSTEN_PROVIDER_URL,
  },
  4: {
    NAME: "Ethereum Testnet Rinkeby",
    KLEROS_LIQUID: "0x6e376E049BD375b53d31AFDc21415AeD360C1E70",
    ARBITRABLE_PROXY: "0xe83BCc07C57d2260102C189f780AF6a7bc34a83d",
    POLICY_REGISTRY: "0xCd444af85127392cB84b8583a82e6aE6230Ec0b9",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_RINKEBY_PROVIDER_URL,
  },

  5: {
    NAME: "Ethereum Testnet Görli",
    KLEROS_LIQUID: "0x1128eD55ab2d796fa92D2F8E1f336d745354a77A",
    ARBITRABLE_PROXY: "0x78ac5F189FC6DAB261437a7B95D11cAcf0234FFe",
    POLICY_REGISTRY: "0x28c8A3A2E3c8Cd3F795DB83764316a1129a069bA",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_GOERLI_PROVIDER_URL,
  },

  42: {
    NAME: "Ethereum Testnet Kovan",
    KLEROS_LIQUID: "0x60b2abfdfad9c0873242f59f2a8c32a3cc682f80",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[42].address,
    POLICY_REGISTRY: "0xFC53D1d6dDc2C6Cdd403cb7DBf0f26140D82e12d",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_KOVAN_PROVIDER_URL,
  },

  77: {
    NAME: "POA Network Sokol",
    KLEROS_LIQUID: "0xb701ff19fBD9702DD7Ca099Ee7D0D42a2612baB5",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[77].address,
    POLICY_REGISTRY: "0x0Bee63bC7220d0Bacd8A3c9d6B6511126CDfe58f",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_SOKOL_PROVIDER_URL,
  },

  100: {
    NAME: "xDAI Chain",
    KLEROS_LIQUID: "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[100].address,
    POLICY_REGISTRY: "0x9d494768936b6bDaabc46733b8D53A937A6c6D7e",
    WEB3_PROVIDER: process.env.REACT_APP_WEB3_XDAI_PROVIDER_URL,
  },

  80001: {
    NAME: "Mumbai",
    WEB3_PROVIDER: "https://rpc-mumbai.matic.today/",
  },

};

export default map;

export function getReadOnlyRpcUrl({ chainId }) {
  const url = map[parseInt(chainId)].WEB3_PROVIDER;
  return url;
}
