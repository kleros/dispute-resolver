import type { RealityProxyEntry } from "./types";
import type { RegistryKey } from "../types";

/**
 * Maintenance follows REALITY_OPS.md. Each entry's comment names the arbitrable and the dynamic script its MetaEvidence points at.
 */
export const REALITY_PROXIES: Readonly<Record<RegistryKey, RealityProxyEntry>> = {
  // Realitio_v2_1_ArbitratorWithAppeals (Gnosis, B script) (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "100:0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001": {
    proxy: "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001",
    kind: "single-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 20364161,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Realitio_v2_1_ArbitratorWithAppeals (Gnosis, B script): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Realitio_v2_1_ArbitratorWithAppeals (Gnosis, B script) (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "100:0x2e39b8f43d0870ba896f516f78f57cde773cf805": {
    proxy: "0x2e39b8f43d0870ba896f516f78f57cde773cf805",
    kind: "single-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 26177432,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Realitio_v2_1_ArbitratorWithAppeals (Gnosis, B script): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Realitio_v2_1_ArbitratorWithAppeals (Gnosis, Moderate script) (dynamic script QmRnwMuc7kGipQkjzPY9jhcttRhebPRYwEvBVGTjmkMwe9)
  "100:0x54068a67441a950ff33afa5a3247acc7188d0789": {
    proxy: "0x54068a67441a950ff33afa5a3247acc7188d0789",
    kind: "single-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 29118470,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: "es",
    questionOverride: null,
    justification:
      "Realitio_v2_1_ArbitratorWithAppeals (Gnosis, Moderate script): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Moderate / Susie (Gnosis) (dynamic script QmRnwMuc7kGipQkjzPY9jhcttRhebPRYwEvBVGTjmkMwe9)
  "100:0xe04f5791d671d5c4e08ab49b39807087b591ea3e": {
    proxy: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    kind: "single-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 29118460,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: "es",
    questionOverride: null,
    justification:
      "Moderate / Susie (Gnosis): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // RealitioArbitratorProxy (RealitioERC20, hardcoded) (dynamic script Qmd4urnZbkk4X9eDk4yYZyqx6ZJJAAkE4TRjiCorVEqq8z)
  "1:0x126697b552b83f08c7ebebae8d13eae2871e4e1e": {
    proxy: "0x126697b552b83f08c7ebebae8d13eae2871e4e1e",
    kind: "single-chain",
    reality: "0x3d3b51b1091d1f6491aeb1916c94bafe57f6cc9d",
    realityChainId: 1,
    proxyDeployBlock: 9339114,
    realityDeployBlock: 8050824,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "RealitioArbitratorProxy (RealitioERC20, hardcoded): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Lockler (dynamic script QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn)
  "1:0x1c2811550551d84030cd1b608e6fe3fd6fd5fc0d": {
    proxy: "0x1c2811550551d84030cd1b608e6fe3fd6fd5fc0d",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 23769517,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification: "Lockler: single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Ethereum Seer (dynamic script QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn)
  "1:0x2018038203aee8e7a29dabd73771b0355d4f85ad": {
    proxy: "0x2018038203aee8e7a29dabd73771b0355d4f85ad",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 20892368,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification: "Ethereum Seer: single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Gnosis-Ethereum main Foreign Proxy (deprecated) (dynamic script QmeiJ8pJofPcdTUCP1xaty9gtKpFisn8pDhUXcx9hqLV5u)
  "1:0x2f0895732bfacdcf2fdb19962fe609d0da695f21": {
    proxy: "0x2f0895732bfacdcf2fdb19962fe609d0da695f21",
    kind: "cross-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 14066928,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum main Foreign Proxy (deprecated): cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Gnosis-Ethereum RealitioForeignArbitrationProxyWithAppeals (no identification) (dynamic script QmV7rEebupW9vE4YYmsu2zcdrd6waa5f22mNaYxBkdrNtc)
  "1:0x32bcdc9776692679cfbbf8350bad67da13faaa3f": {
    proxy: "0x32bcdc9776692679cfbbf8350bad67da13faaa3f",
    kind: "cross-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 21358927,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum RealitioForeignArbitrationProxyWithAppeals (no identification): cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Unichain-Ethereum RealitioForeignProxyUnichain (dynamic script QmcRGGmzzxSvXaajMCFYErZb5knuexoaDCZhJ5rSHRbcvw)
  "1:0x3fb8314c628e9afe7677946d3e23443ce748ac17": {
    proxy: "0x3fb8314c628e9afe7677946d3e23443ce748ac17",
    kind: "cross-chain",
    reality: "0xb920dbede88b42aa77ee55ebce3671132ee856fc",
    realityChainId: 130,
    proxyDeployBlock: 21889616,
    realityDeployBlock: 8561871,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Unichain-Ethereum RealitioForeignProxyUnichain: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 130, the home chain.",
  },
  // Polygon-Ethereum RealitioForeignProxyPolygon (NOT in whitelist; homeProxy() reverts, home via fxChildTunnel()) (dynamic script QmaZ3KtWQD7k7BSSabp94YVWLNz8NVJfABhNYFuSjMjsAQ)
  "1:0x412c0617f357e640406ff0b4ee55f547c3692ba7": {
    proxy: "0x412c0617f357e640406ff0b4ee55f547c3692ba7",
    kind: "cross-chain",
    reality: "0x3155836d28c0845c37791808287fafc811742c5a",
    realityChainId: 137,
    proxyDeployBlock: 23338418,
    realityDeployBlock: 73217319,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title-description",
    justification:
      "Polygon-Ethereum RealitioForeignProxyPolygon (NOT in whitelist; homeProxy() reverts, home via fxChildTunnel()): cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 137, the home chain.",
  },
  // Gnosis-Ethereum foreign proxy (NOT in whitelist; D2 script) (dynamic script QmSsM1ks9Q9xAd26uWxR3Sm1ZowpsEA49Vpvs6sWTBWjeg)
  "1:0x4a7e264b67852ea8b737e505739cb557c7c43c00": {
    proxy: "0x4a7e264b67852ea8b737e505739cb557c7c43c00",
    kind: "cross-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 20892423,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum foreign proxy (NOT in whitelist; D2 script): cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // RealitioArbitratorProxy (Reality 2.0; MetaEvidence URI truncated/404, no script) (dynamic script none)
  "1:0x594ec762b59978c97c82bc36ab493ed8b1f1f368": {
    proxy: "0x594ec762b59978c97c82bc36ab493ed8b1f1f368",
    kind: "single-chain",
    reality: "0x325a2e0f3cca2ddbaebb4dfc38df8d19ca165b47",
    realityChainId: 1,
    proxyDeployBlock: 9208534,
    realityDeployBlock: 6531265,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "RealitioArbitratorProxy (Reality 2.0; MetaEvidence URI truncated/404, no script): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Gnosis-Ethereum foreign proxy whose MetaEvidence points at the single-chain B script (script cannot work) (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "1:0x6341ec8f3f23689bd6ea3cf82fe34c3a0481c30a": {
    proxy: "0x6341ec8f3f23689bd6ea3cf82fe34c3a0481c30a",
    kind: "cross-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 13815101,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Gnosis-Ethereum foreign proxy whose MetaEvidence points at the single-chain B script (script cannot work): cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Polygon-Ethereum Polkamarkets Foreign Proxy (dynamic script QmTtFgmyfNiWdde5pVa2h75rfesvSxp8i4wbSmuAieWx9o)
  "1:0x68c4cc21378301cfdd5702d66d58a036d7bafe28": {
    proxy: "0x68c4cc21378301cfdd5702d66d58a036d7bafe28",
    kind: "cross-chain",
    reality: "0x83d3f4769a19f1b43337888b0290f5473cf508b2",
    realityChainId: 137,
    proxyDeployBlock: 17620569,
    realityDeployBlock: 42899867,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Polygon-Ethereum Polkamarkets Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 137, the home chain.",
  },
  // RealitioArbitratorProxy (RealitioERC20, hardcoded) (dynamic script QmcvvhJcGdev6P4xZKUSzK4u2aUYtYbRKbZyWu3PnGFVju)
  "1:0x701cabaf65ed3974925fb94988842a29d2ce7aa3": {
    proxy: "0x701cabaf65ed3974925fb94988842a29d2ce7aa3",
    kind: "single-chain",
    reality: "0x3d3b51b1091d1f6491aeb1916c94bafe57f6cc9d",
    realityChainId: 1,
    proxyDeployBlock: 9120843,
    realityDeployBlock: 8050824,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "RealitioArbitratorProxy (RealitioERC20, hardcoded): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Ethereum main (deprecated) (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "1:0x728cba71a3723caab33ea416cb46e2cc9215a596": {
    proxy: "0x728cba71a3723caab33ea416cb46e2cc9215a596",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 13415767,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Ethereum main (deprecated): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Polygon-Ethereum Foreign Proxy (dynamic script QmTtFgmyfNiWdde5pVa2h75rfesvSxp8i4wbSmuAieWx9o)
  "1:0x776e5853e3d61b2dfb22bcf872a43bf9a1231e52": {
    proxy: "0x776e5853e3d61b2dfb22bcf872a43bf9a1231e52",
    kind: "cross-chain",
    reality: "0x60573b8dce539ae5bf9ad7932310668997ef0428",
    realityChainId: 137,
    proxyDeployBlock: 15867680,
    realityDeployBlock: 18901674,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification: "Polygon-Ethereum Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 137, the home chain.",
  },
  // Gnosis-Ethereum Polkamarkets Foreland Foreign Proxy (dynamic script QmSsM1ks9Q9xAd26uWxR3Sm1ZowpsEA49Vpvs6sWTBWjeg)
  "1:0x8453ba2c9ea5bae36fde6cbd61c12c05b6552425": {
    proxy: "0x8453ba2c9ea5bae36fde6cbd61c12c05b6552425",
    kind: "cross-chain",
    reality: "0x934326a86a99dab25bb8329089ce73ed9c7c0e4a",
    realityChainId: 100,
    proxyDeployBlock: 20142065,
    realityDeployBlock: 34578493,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum Polkamarkets Foreland Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Ethereum Seer new (idle) (dynamic script QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn)
  "1:0xc45d8d9b2b6843528a4dc2d8b5858e5c258d2992": {
    proxy: "0xc45d8d9b2b6843528a4dc2d8b5858e5c258d2992",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 21986673,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Ethereum Seer new (idle): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // WeTrust (RealitioERC20, hardcoded) (dynamic script QmbfQWBvWBT4X21g4ZjwkPPvWJpTh4NK3jS43Jv7z5Teb5)
  "1:0xce9b84c5612beaa234ad0d9fa7d283293479510e": {
    proxy: "0xce9b84c5612beaa234ad0d9fa7d283293479510e",
    kind: "single-chain",
    reality: "0x3d3b51b1091d1f6491aeb1916c94bafe57f6cc9d",
    realityChainId: 1,
    proxyDeployBlock: 8617370,
    realityDeployBlock: 8050824,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "WeTrust (RealitioERC20, hardcoded): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Ethereum main (old, Reality 2.0) (dynamic script QmNhs2mo7t8pydn7gg6ycrtT4mhfvhARLEoyMYgs9SDkH2)
  "1:0xd47f72a2d1d0e91b0ec5e5f5d02b2dc26d00a14d": {
    proxy: "0xd47f72a2d1d0e91b0ec5e5f5d02b2dc26d00a14d",
    kind: "single-chain",
    reality: "0x325a2e0f3cca2ddbaebb4dfc38df8d19ca165b47",
    realityChainId: 1,
    proxyDeployBlock: 7842811,
    realityDeployBlock: 6531265,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "Ethereum main (old, Reality 2.0): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Polygon-Ethereum SUKU Foreign Proxy (dynamic script QmaZ3KtWQD7k7BSSabp94YVWLNz8NVJfABhNYFuSjMjsAQ)
  "1:0xd6bf90e1daaa5cdec82235d2db1b93a9d50c6046": {
    proxy: "0xd6bf90e1daaa5cdec82235d2db1b93a9d50c6046",
    kind: "cross-chain",
    reality: "0x3155836d28c0845c37791808287fafc811742c5a",
    realityChainId: 137,
    proxyDeployBlock: 23446799,
    realityDeployBlock: 73217319,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title-description",
    justification:
      "Polygon-Ethereum SUKU Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 137, the home chain.",
  },
  // RealitioArbitratorProxy (Reality 2.0, hardcoded) (dynamic script QmdvYb3qDJzig6FS6ckEEq2LEGxD4mq8En2UwVF3v28YEh)
  "1:0xd7e143715a4244634d74201959372e81a3623a2a": {
    proxy: "0xd7e143715a4244634d74201959372e81a3623a2a",
    kind: "single-chain",
    reality: "0x325a2e0f3cca2ddbaebb4dfc38df8d19ca165b47",
    realityChainId: 1,
    proxyDeployBlock: 9208718,
    realityDeployBlock: 6531265,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: null,
    appealable: false,
    justification:
      "RealitioArbitratorProxy (Reality 2.0, hardcoded): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain. Its code has no appeal function (recorded bytecode, block 26189718) and KlerosLiquid takes an appeal only from the arbitrable, so its disputes cannot be appealed.",
  },
  // Gnosis-Ethereum Omen AI with appeals Foreign Proxy (dynamic script QmYSZCxJ7Pf1mcnZ8JgdrietQUmzhAXdiVQccCevsphPEx)
  "1:0xef2ae6961ec7f2105bc2693bc32fa7b7386b2f59": {
    proxy: "0xef2ae6961ec7f2105bc2693bc32fa7b7386b2f59",
    kind: "cross-chain",
    reality: "0x79e32ae03fb27b07c89c0c568f80287c01ca2e57",
    realityChainId: 100,
    proxyDeployBlock: 21127212,
    realityDeployBlock: 14005802,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: false,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum Omen AI with appeals Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Base-Ethereum Foreign Proxy (dynamic script QmaZ3KtWQD7k7BSSabp94YVWLNz8NVJfABhNYFuSjMjsAQ)
  "1:0xf0b37feda6cdf5f78b37e1fbccc24969059f2044": {
    proxy: "0xf0b37feda6cdf5f78b37e1fbccc24969059f2044",
    kind: "cross-chain",
    reality: "0x2f39f464d16402ca3d8527da89617b73de2f60e8",
    realityChainId: 8453,
    proxyDeployBlock: 23584683,
    realityDeployBlock: 26260675,
    hasArbitrationCreatedBlock: true,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title-description",
    justification: "Base-Ethereum Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 8453, the home chain.",
  },
  // Ethereum DAO Governance (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "1:0xf72cfd1b34a91a64f9a98537fe63fbab7530adca": {
    proxy: "0xf72cfd1b34a91a64f9a98537fe63fbab7530adca",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 13371175,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Ethereum DAO Governance: single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
  // Gnosis-Ethereum Seer Foreign Proxy (dynamic script QmUkK86cStWBMTrutUonZ8FXqtYbYNqVQuALmiqSZzWu2z)
  "1:0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68": {
    proxy: "0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68",
    kind: "cross-chain",
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
    proxyDeployBlock: 20922529,
    realityDeployBlock: 17997262,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: "title",
    justification:
      "Gnosis-Ethereum Seer Foreign Proxy: cross-chain Reality.eth foreign proxy. No bytecode probe identifies it, and its question lives on chain 100, the home chain.",
  },
  // Ethereum main (new) (dynamic script QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr)
  "1:0xff32eff53459485074b4db14633252c9dca3791a": {
    proxy: "0xff32eff53459485074b4db14633252c9dca3791a",
    kind: "single-chain",
    reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
    realityChainId: 1,
    proxyDeployBlock: 21986748,
    realityDeployBlock: 13194676,
    hasArbitrationCreatedBlock: false,
    answeredTooSoon: true,
    localizedLang: null,
    questionOverride: null,
    justification:
      "Ethereum main (new): single-chain Reality.eth proxy. No bytecode probe identifies it, and its question lives in the Reality.eth contract on the arbitrator chain.",
  },
};
