import ArbitrableProxy from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";

const map = {
  1: {
    KLEROS_LIQUID: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[1].address,
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
  },
  3: {
    KLEROS_LIQUID: "0xab942e7d2bff0bc5614c968ccc91198fd223c57e",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[3].address,
    POLICY_REGISTRY: "0xe4ee06e5c9921d7e4d4ab62199c8c4b5267a7547",
  },
  42: {
    KLEROS_LIQUID: "0x60b2abfdfad9c0873242f59f2a8c32a3cc682f80",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[42].address,
    POLICY_REGISTRY: "0xFC53D1d6dDc2C6Cdd403cb7DBf0f26140D82e12d",
  },
};

export default map;
