import { describe, expect, it } from "vitest";
import { chainCapabilities, CHAINS, DEFAULT_CHAIN_ID, getChain, ongoingScanStart } from "./index";
import { ascending, chainOf } from "../test/chains/testHelpers";

// Written out by hand so a typo in the table fails here.
const MAINNET_LIQUID = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const MAINNET_POLICY = "0xcf1f07713d5193fae5c1653c9f61953d048bece4";
const SEPOLIA_POLICY = "0x88fb25d399310c07d35cb9091b8346d8b1893aa5";

interface Expected {
  readonly id: number;
  readonly name: string;
  readonly currency: string;
  readonly isTestnet: boolean;
  readonly klerosLiquid?: string;
  readonly arbitrableProxy?: string;
  readonly policyRegistry?: string;
  readonly arbitratorDeployedAtBlock?: number;
  readonly maxLookback: number;
  readonly readRpcEnv?: string;
  readonly defaultRpcUrl?: string;
}

const EXPECTED: readonly Expected[] = [
  {
    id: 1,
    name: "Ethereum Mainnet",
    currency: "ETH",
    isTestnet: false,
    klerosLiquid: MAINNET_LIQUID,
    arbitrableProxy: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
    policyRegistry: MAINNET_POLICY,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_WEB3_PROVIDER_URL",
  },
  {
    id: 100,
    name: "Gnosis Network",
    currency: "xDai",
    isTestnet: false,
    klerosLiquid: "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002",
    arbitrableProxy: "0xc7add3c961f7935cb4914e37da991d2f1cd7986c",
    policyRegistry: "0x9d494768936b6bdaabc46733b8d53a937a6c6d7e",
    arbitratorDeployedAtBlock: 16895601,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_WEB3_XDAI_PROVIDER_URL",
  },
  {
    id: 10200,
    name: "Gnosis Testnet Chiado",
    currency: "xDai",
    isTestnet: true,
    klerosLiquid: "0xd8798dfae8194d6b4cd6e2da6187ae4209d06f27",
    arbitrableProxy: "0x4bef0321bd7fa943f85ae55e07f790c6becbd177",
    policyRegistry: "0x53fc70fe1ec3a60f8939a62abcc61bf1a57938d7",
    arbitratorDeployedAtBlock: 1165867,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_WEB3_CHIADO_PROVIDER_URL",
  },
  {
    id: 11155111,
    name: "Ethereum Testnet Sepolia",
    currency: "sETH",
    isTestnet: true,
    klerosLiquid: "0x90992fb4e15ce0c59aeffb376460fda4ee19c879",
    arbitrableProxy: "0x009ca5a0b816156f91b29a93d7688c52480bab24",
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_WEB3_SEPOLIA_PROVIDER_URL",
  },
  {
    id: 130,
    name: "Unichain Mainnet",
    currency: "ETH",
    isTestnet: false,
    policyRegistry: MAINNET_POLICY,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_UNICHAIN",
  },
  {
    id: 1301,
    name: "Unichain Testnet",
    currency: "ETH",
    isTestnet: true,
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_UNICHAIN_SEPOLIA",
  },
  {
    id: 137,
    name: "Polygon Mainnet",
    currency: "MATIC",
    isTestnet: false,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_WEB3_POLYGON_PROVIDER_URL",
  },
  {
    id: 300,
    name: "zkSync Era Testnet Sepolia",
    currency: "sETH",
    isTestnet: true,
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    defaultRpcUrl: "https://sepolia.era.zksync.dev/",
  },
  {
    id: 324,
    name: "zkSync Era Mainnet",
    currency: "ETH",
    isTestnet: false,
    policyRegistry: MAINNET_POLICY,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    defaultRpcUrl: "https://mainnet.era.zksync.io",
  },
  {
    id: 42161,
    name: "Arbitrum One",
    currency: "ETH",
    isTestnet: false,
    policyRegistry: MAINNET_POLICY,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_ARBITRUM_ONE",
  },
  {
    id: 421614,
    name: "Arbitrum Testnet Sepolia",
    currency: "ETH",
    isTestnet: true,
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_ARBITRUM_SEPOLIA",
  },
  {
    id: 11155420,
    name: "Optimism Testnet Sepolia",
    currency: "ETH",
    isTestnet: true,
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_OPTIMISM_SEPOLIA",
  },
  {
    id: 8453,
    name: "Base Mainnet",
    currency: "ETH",
    isTestnet: false,
    policyRegistry: MAINNET_POLICY,
    arbitratorDeployedAtBlock: 7303699,
    maxLookback: 1_000_000,
    readRpcEnv: "REACT_APP_BASE",
  },
  {
    id: 84532,
    name: "Base Sepolia",
    currency: "ETH",
    isTestnet: true,
    policyRegistry: SEPOLIA_POLICY,
    arbitratorDeployedAtBlock: 3635742,
    maxLookback: 50_000,
    readRpcEnv: "REACT_APP_BASE_SEPOLIA",
  },
];

const WITH_ARBITRATOR = [1, 100, 10200, 11155111];
const WITHOUT_ARBITRATOR = [130, 1301, 137, 300, 324, 42161, 421614, 11155420, 8453, 84532];

function everyAddress(): { chainId: number; field: string; value: string }[] {
  return Object.values(CHAINS).flatMap((chain) =>
    (["klerosLiquid", "arbitrableProxy", "policyRegistry"] as const).flatMap((field) => {
      const value = chain[field];
      return value === undefined ? [] : [{ chainId: chain.id, field, value }];
    }),
  );
}

describe("chains table", () => {
  it("holds exactly the 14 supported chains and none of the unsupported ones", () => {
    const ids = Object.keys(CHAINS).map(Number);
    expect(ascending(ids)).toEqual(ascending(EXPECTED.map((chain) => chain.id)));
    expect(ids).toHaveLength(14);
    for (const dropped of [3, 4, 5, 10, 42, 77, 80001, 690]) {
      expect(CHAINS[dropped]).toBeUndefined();
      expect(getChain(dropped)).toBeUndefined();
    }
  });

  it("keys every config by its own id", () => {
    for (const [key, chain] of Object.entries(CHAINS)) {
      expect(chain.id).toBe(Number(key));
    }
  });

  it.each(EXPECTED)("chain $id has the expected config field by field", (expected) => {
    const chain = getChain(expected.id);
    expect(chain).toMatchObject({
      id: expected.id,
      name: expected.name,
      isTestnet: expected.isTestnet,
      maxLookback: expected.maxLookback,
      arbitratorDeployedAtBlock: expected.arbitratorDeployedAtBlock,
    });
    expect(chain?.klerosLiquid).toBe(expected.klerosLiquid);
    expect(chain?.arbitrableProxy).toBe(expected.arbitrableProxy);
    expect(chain?.policyRegistry).toBe(expected.policyRegistry);
    expect(chain?.readRpcEnv).toBe(expected.readRpcEnv);
    expect(chain?.defaultRpcUrl).toBe(expected.defaultRpcUrl);
  });

  it("only chains 1, 100, 10200 and 11155111 have an arbitrator, and they are the ones that can create", () => {
    const withArbitrator = Object.values(CHAINS)
      .filter((chain) => chain.klerosLiquid !== undefined)
      .map((chain) => chain.id);
    expect(ascending(withArbitrator)).toEqual(ascending(WITH_ARBITRATOR));
    for (const id of WITH_ARBITRATOR) {
      expect(getChain(id)?.arbitrableProxy).toBeDefined();
      expect(getChain(id)?.policyRegistry).toBeDefined();
    }
    for (const id of WITHOUT_ARBITRATOR) {
      expect(getChain(id)?.klerosLiquid).toBeUndefined();
      expect(getChain(id)?.arbitrableProxy).toBeUndefined();
    }
  });

  it("chain 84532 takes Sepolia's deploy block", () => {
    expect(getChain(84532)?.arbitratorDeployedAtBlock).toBe(3635742);
    expect(getChain(84532)?.arbitratorDeployedAtBlock).toBe(getChain(11155111)?.arbitratorDeployedAtBlock);
  });

  it("every Reality home chain (1, 100, 130, 137, 8453) has a read RPC source", () => {
    for (const id of [1, 100, 130, 137, 8453]) {
      const chain = getChain(id);
      expect(chain?.readRpcEnv ?? chain?.defaultRpcUrl).toBeTruthy();
    }
  });

  it("every chain has a read RPC source, and only 300 and 324 have a literal URL", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.readRpcEnv ?? chain.defaultRpcUrl, `chain ${String(chain.id)}`).toBeTruthy();
    }
    const withLiteral = Object.values(CHAINS)
      .filter((chain) => chain.defaultRpcUrl !== undefined)
      .map((chain) => chain.id);
    expect(ascending(withLiteral)).toEqual([300, 324]);
  });

  it("every address in the table is lowercase, 40 hex characters", () => {
    const addresses = everyAddress();
    expect(addresses.length).toBeGreaterThan(0);
    for (const { chainId, field, value } of addresses) {
      expect(value, `${String(chainId)}.${field}`).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("flags exactly the testnets", () => {
    const testnets = Object.values(CHAINS)
      .filter((chain) => chain.isTestnet)
      .map((chain) => chain.id);
    expect(ascending(testnets)).toEqual([300, 1301, 10200, 84532, 421614, 11155111, 11155420]);
  });

  it("currency symbols are ETH, with xDai on 100 and 10200, sETH on 11155111 and 300, MATIC on 137", () => {
    const symbols = Object.fromEntries(Object.values(CHAINS).map((chain) => [chain.id, chain.currency]));
    expect(symbols).toEqual({
      1: "ETH",
      100: "xDai",
      10200: "xDai",
      11155111: "sETH",
      130: "ETH",
      1301: "ETH",
      137: "MATIC",
      300: "sETH",
      324: "ETH",
      42161: "ETH",
      421614: "ETH",
      11155420: "ETH",
      8453: "ETH",
      84532: "ETH",
    });
  });

  it("never labels Gnosis amounts ETH", () => {
    expect(chainOf(100).currency).not.toBe("ETH");
    expect(chainOf(10200).currency).not.toBe("ETH");
  });

  it("the lookback is 50,000 blocks on the testnets and 1,000,000 elsewhere", () => {
    const fifty = Object.values(CHAINS)
      .filter((chain) => chain.maxLookback === 50_000)
      .map((chain) => chain.id);
    expect(ascending(fifty)).toEqual([300, 1301, 10200, 84532, 421614, 11155111, 11155420]);
    for (const chain of Object.values(CHAINS)) {
      expect([50_000, 1_000_000]).toContain(chain.maxLookback);
    }
  });

  it("chains without an arbitrator copy chain 1's or Sepolia's deploy block", () => {
    for (const id of [130, 137, 324, 42161, 8453]) expect(getChain(id)?.arbitratorDeployedAtBlock).toBe(7303699);
    for (const id of [1301, 300, 421614, 11155420, 84532]) expect(getChain(id)?.arbitratorDeployedAtBlock).toBe(3635742);
  });

  it("every chain names the REACT_APP_PUBLIC_RPC_<chainId> setting", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.publicRpcEnv).toBe(`REACT_APP_PUBLIC_RPC_${String(chain.id)}`);
    }
  });

  it("the default chain is mainnet", () => {
    expect(DEFAULT_CHAIN_ID).toBe(1);
    expect(getChain(DEFAULT_CHAIN_ID)).toBeDefined();
  });

  it("getChain returns undefined for ids that are not configured, never throws", () => {
    for (const id of [0, -1, 10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(getChain(id)).toBeUndefined();
    }
  });

  it("getChain does not resolve object prototype keys", () => {
    expect(getChain("constructor" as unknown as number)).toBeUndefined();
    expect(getChain("__proto__" as unknown as number)).toBeUndefined();
  });

  it("the table is frozen, so no caller can reconfigure a chain", () => {
    expect(Object.isFrozen(CHAINS)).toBe(true);
    expect(Object.isFrozen(CHAINS[1])).toBe(true);
  });
});

describe("chainCapabilities", () => {
  it("hasArbitrator iff klerosLiquid is set, canCreate iff arbitrableProxy is set", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chainCapabilities(chain)).toEqual({
        hasArbitrator: chain.klerosLiquid !== undefined,
        canCreate: chain.arbitrableProxy !== undefined,
      });
    }
  });

  it("the chains without an arbitrator can do neither, the 4 with one can do both", () => {
    for (const id of WITHOUT_ARBITRATOR) expect(chainCapabilities(chainOf(id))).toEqual({ hasArbitrator: false, canCreate: false });
    for (const id of WITH_ARBITRATOR) expect(chainCapabilities(chainOf(id))).toEqual({ hasArbitrator: true, canCreate: true });
  });
});

describe("ongoingScanStart", () => {
  const mainnet = chainOf(1);
  const sepolia = chainOf(11155111);

  it("starts at head minus the lookback once the chain is old enough", () => {
    expect(ongoingScanStart(mainnet, 20_000_000n)).toBe(19_000_000n);
    expect(ongoingScanStart(sepolia, 9_000_000n)).toBe(8_950_000n);
  });

  it("never starts before the arbitrator was deployed", () => {
    expect(ongoingScanStart(mainnet, 7_500_000n)).toBe(7_303_699n);
    expect(ongoingScanStart(sepolia, 3_700_000n)).toBe(3_650_000n);
    expect(ongoingScanStart(sepolia, 3_660_000n)).toBe(3_635_742n);
  });

  it("never starts below zero when the head is younger than the lookback", () => {
    expect(ongoingScanStart({ ...mainnet, arbitratorDeployedAtBlock: undefined }, 10n)).toBe(0n);
    expect(ongoingScanStart({ ...mainnet, arbitratorDeployedAtBlock: undefined }, -5n)).toBe(0n);
  });

  it("a chain without a deploy block starts at head minus the lookback", () => {
    const chain = { ...mainnet, arbitratorDeployedAtBlock: undefined };
    expect(ongoingScanStart(chain, 5_000_000n)).toBe(4_000_000n);
  });
});
