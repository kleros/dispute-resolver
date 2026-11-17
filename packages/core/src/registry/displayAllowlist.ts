import type { Address } from "../types";

/**
 * Keyed by the meta-evidence's `displayChainId` of `arbitrableChainID`; every key is a configured chain. It feeds the
 * evidence-display iframe flags and marks the arbitrables whose own failure text `describeError` may show; it plays no
 * role in sandboxing scripts or detecting families.
 */
export const DISPLAY_ALLOWLIST: Readonly<Record<number, readonly Address[]>> = {
  1: [
    "0x126697b552b83f08c7ebebae8d13eae2871e4e1e",
    "0x250aa88c8f54f5e70b94214380342f0d53e42f6c",
    "0x2e3b10abf091cdc53cc892a50dabdb432e220398",
    "0x594ec762b59978c97c82bc36ab493ed8b1f1f368",
    "0x6341ec8f3f23689bd6ea3cf82fe34c3a0481c30a",
    "0x701cabaf65ed3974925fb94988842a29d2ce7aa3",
    "0x7ecffaa0247227a29d613adb3b1b47e44f0f53cb",
    "0x916deab80dfbc7030277047cd18b233b3ce5b4ab",
    "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb",
    "0xcb4aae35333193232421e86cd2e9b6c91f3b125f",
    "0xd7e143715a4244634d74201959372e81a3623a2a",
    "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38",
    "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4",
    "0xebcf3bca271b26ae4b162ba560e243055af0e679",
    "0xf339047c85d0dd2645f2bd802a1e8a5e7af61053",
    "0xbe9834097a4e97689d9b667441acafb456d0480a", // PoH V2
    "0xce9b84c5612beaa234ad0d9fa7d283293479510e", // WeTrust
    "0xd47f72a2d1d0e91b0ec5e5f5d02b2dc26d00a14d", // Ethereum main (old)
    "0x728cba71a3723caab33ea416cb46e2cc9215a596", // Ethereum main (deprecated)
    "0xff32eff53459485074b4db14633252c9dca3791a", // Ethereum main (new)
    "0xf72cfd1b34a91a64f9a98537fe63fbab7530adca", // Ethereum DAO Governance
    "0x2018038203aee8e7a29dabd73771b0355d4f85ad", // Ethereum Seer
    "0xc45d8d9b2b6843528a4dc2d8b5858e5c258d2992", // Ethereum Seer new (idle)
    "0x1c2811550551d84030cd1b608e6fe3fd6fd5fc0d", // Lockler
  ],
  100: [
    "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001",
    "0x2b6869e4f1d6104989f15da7454dbf7a01310bb8",
    "0x2e39b8f43d0870ba896f516f78f57cde773cf805",
    "0x2f19f817bbf800b487b7f2e51f24ad5ea0222463",
    "0x54068a67441a950ff33afa5a3247acc7188d0789",
    "0x54a92c21c6553a8085066311f2c8d9db1b5e6610",
    "0x66260c69d03837016d88c9877e61e08ef74c59f2",
    "0x70533554fe5c17caf77fe530f77eab933b92af60",
    "0x76944a2678a0954a610096ee78e8ceb8d46d5922",
    "0x86e72802d9abbf7505a889721fd4d6947b02320e",
    "0x957a53a994860be4750810131d9c876b2f52d6e1",
    "0x9fe4d9e4989ad031fdc424d8c34d77e70aa0b269",
    "0xa78ec5742a5d360f92f6d6d7e775fb35ab559a51",
    "0xaeecfa44639b61d2e0a9534d918789d94a24a9de",
    "0xd5994f15be9987104d9821aa99d1c97227c7c08c",
    "0xf7de5537ecd69a94695fcf4bcdbdee6329b63322",
    "0xa4ac94c4fa65bb352efa30e3408e64f72ac857bc", // PoH V2
    "0x5aaf9e23a11440f8c1ad6d2e2e5109c7e52cc672", // Seer Market registry on Curate
    "0xee1502e29795ef6c2d60f8d7120596abe3bad990", // Kleros Tokens registry on Curate
    "0x2f0895732bfacdcf2fdb19962fe609d0da695f21", // Gnosis-Ethereum main Foreign Proxy (deprecated)
    "0x5afa42b30955f137e10f89dfb5ef1542a186f90e", // Gnosis-Ethereum Polkamarkets Foreland Home Proxy
    "0x8453ba2c9ea5bae36fde6cbd61c12c05b6552425", // Gnosis-Ethereum Polkamarkets Foreland Foreign Proxy
    "0x68154ea682f95bf582b80dd6453fa401737491dc", // Gnosis-Ethereum Seer Home Proxy
    "0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68", // Gnosis-Ethereum Seer Foreign Proxy
    "0xe04f5791d671d5c4e08ab49b39807087b591ea3e", // Moderate / Susie
    "0x5562ac605764dc4039fb6ab56a74f7321396cdf2", // Gnosis-Ethereum Omen AI with appeals Home Proxy
    "0xef2ae6961ec7f2105bc2693bc32fa7b7386b2f59", // Gnosis-Ethereum Omen AI with appeals Foreign Proxy
    "0x88fb25d399310c07d35cb9091b8346d8b1893aa5", // Gnosis-Ethereum RealitioHomeArbitrationProxy (no identification)
    "0x32bcdc9776692679cfbbf8350bad67da13faaa3f", // Gnosis-Ethereum RealitioForeignArbitrationProxyWithAppeals (no identification)
  ],
  130: [
    "0x8feab350a304140b1593a38a13607d122bec44b6", // Unichain-Ethereum RealitioHomeProxyUnichain (no identification)
    "0x3fb8314c628e9afe7677946d3e23443ce748ac17", // Unichain-Ethereum RealitioForeignProxyUnichain (no identification)
  ],
  137: [
    "0x5afa42b30955f137e10f89dfb5ef1542a186f90e", // Polygon-Ethereum Home Proxy
    "0x776e5853e3d61b2dfb22bcf872a43bf9a1231e52", // Polygon-Ethereum Foreign Proxy
    "0x68154ea682f95bf582b80dd6453fa401737491dc", // Polygon-Ethereum Polkamarkets Home Proxy
    "0x68c4cc21378301cfdd5702d66d58a036d7bafe28", // Polygon-Ethereum Polkamarkets Foreign Proxy
    "0xb4fc64c6ffe0b04ea1ec9bf27fb2e8696c82b2ef", // Polygon-Ethereum SUKU Home Proxy
    "0xd6bf90e1daaa5cdec82235d2db1b93a9d50c6046", // Polygon-Ethereum SUKU Foreign Proxy
  ],
  300: [
    "0x473dc4158bea5eb9a72b6e51fa5668ce6a41530d", // zkSepolia-Sepolia Home Proxy
    "0x54c68fa979883d317c10f3cfddc33522889d5612", // zkSepolia-Sepolia Foreign Proxy
  ],
  1301: [
    "0x05295972f75cfee7fe66e6bddc0435c9fd083d18", // UnichainSepolia-Sepolia RealitioHomeProxyUnichainSepolia (no identification)
    "0xc10d916467addc02464ac98036e58644f0e50311", // UnichainSepolia-Sepolia RealitioForeignProxyUnichainSepolia (no identification)
  ],
  8453: [
    "0xd04f24364687dbd6db67d2101fae59e91a6e605b", // Base-Ethereum Home Proxy
    "0xf0b37feda6cdf5f78b37e1fbccc24969059f2044", // Base-Ethereum Foreign Proxy
  ],
  10200: [
    "0x7a547214a0ab7efd835670eda696dda1b6603805", // Chiado
    "0xe620947519e8102aa625bbb4669fe317c9fffed7", // GnosisChiado-Sepolia Home Proxy
    "0x5d7cb72b31c080cf2de5f57fd38dedbeaf969d42", // GnosisChiado-Sepolia Foreign Proxy
    "0x867c848b8cb3fc60c06820c44084a271f8197c89", // GnosisChiado-Sepolia RealitioHomeArbitrationProxy (no identification)
    "0x252e210b33083e9dfb9d94c526767b83be579d8b", // GnosisChiado-Sepolia RealitioForeignArbitrationProxyWithAppeals (no identification)
  ],
  84532: [
    "0xd919c6edfb458c15c12b921cbc9f6eef06f0e9c5", // BaseSepolia-Sepolia RealitioHomeProxyBaseSepolia (no identification)
    "0x7331a1512dbe2d77bc19e8d2b923fd76214c0f77", // BaseSepolia-Sepolia RealitioForeignProxyBaseSepoila (no identification)
  ],
  11155111: [
    "0x73e4f71e5ece8d1319807dc7cd2eaa9fda8f5182",
    "0x1ec9729366e4c3eb8b8ea776935508188051c0f4",
    "0xb994886066b17cfa0fe088c5933498b17fe66a50",
    "0x05b942faecfb3924970e3a28e0f230910cedff45", // Sepolia
  ],
  11155420: [
    "0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68", // OptimismSepolia-Sepolia Home Proxy
    "0x6a41af8fc7f68bdd13b2c7d50824ed49155dc3ba", // OptimismSepolia-Sepolia Foreign Proxy
  ],
};
