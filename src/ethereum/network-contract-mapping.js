import ArbitrableProxy from "../../node_modules/@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";

const map = {
  1: {
    KLEROS_LIQUID: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
    ARBITRABLE_PROXY: "0x135C573503f70dc290b1d60Fe2E7f7eB114FEBd6",
    POLICY_REGISTRY: "0xCf1f07713d5193FaE5c1653C9f61953D048BECe4",
  },
  3: {
    KLEROS_LIQUID: "0x9643e91D3734b795e914A64169147b70876272ba",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[3].address,
    POLICY_REGISTRY: "0x0Ec92A49968eA919dd103117986E9B6076ecAA4A",
  },
  42: {
    KLEROS_LIQUID: "0x60b2abfdfad9c0873242f59f2a8c32a3cc682f80",
    ARBITRABLE_PROXY: ArbitrableProxy.networks[42].address,
    POLICY_REGISTRY: "0xFC53D1d6dDc2C6Cdd403cb7DBf0f26140D82e12d",
  },
};

export default map;
