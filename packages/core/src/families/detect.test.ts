import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import { getRealityProxy, REGISTRY, registryKey, toRegistryAddress } from "../registry";
import type { Registry } from "../registry/types";
import type { ChainId, Hex } from "../types";
import { RECORDED_CONTRACTS, recorded } from "./__fixtures__/recorded";
import { classifySelectors, createFamilyCache, detectFamily, scanSelectors } from "./index";
import { codeReads, fakeNodeClient, recordedNode, rpcError, slotWord, type FakeNode } from "../test/families/testHelpers";
import type { FamilyDetection } from "./types";

const KLEROS_ETH = "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4";
const UNSLASHED = "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38";
const UNSLASHED_IMPLEMENTATION = "0xa5eb6fec99f0c5b052078451c7dbb927d4b7054f";
const OLDER_RESOLVER_PROXY = "0x135c573503f70dc290b1d60fe2e7f7eb114febd6";
const MAINNET_ARBITRABLE_PROXY = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const MAINNET_ESCROW = "0xc25a0b9681abf6f090aed71a8c08fb564b41dab6";
const POH_GOVERNOR = "0x327a29fce0a6490e4236240be176daa282eccfdf";
const GNOSIS_CURATE_CLONE = "0x957a53a994860be4750810131d9c876b2f52d6e1";
const GNOSIS_863_CLONE = "0x25fa9432832efdd48deec6d4cf1cd3f139678a5b";
const VIEW_ONLY_REALITY_PROXY = "0x594ec762b59978c97c82bc36ab493ed8b1f1f368";
const LOCKLER_REALITY_PROXY = "0x1c2811550551d84030cd1b608e6fe3fd6fd5fc0d";
/** An address in no list of the old app and no registry table. */
const UNLISTED = toRegistryAddress("0x1111111111111111111111111111111111111111");

function detectOn(chainId: ChainId, address: string, node: FakeNode = recordedNode(chainId), registry?: Registry) {
  const { client, calls } = fakeNodeClient(node);
  const detection = detectFamily({ client, chainId, arbitrable: toRegistryAddress(address), ...(registry === undefined ? {} : { registry }) });
  return { detection, calls };
}

function detectRecorded(chainId: ChainId, address: string): Promise<FamilyDetection> {
  return detectOn(chainId, address).detection;
}

/** The probe selectors carried by `code`'s dispatcher, in `SELECTORS` order. */
function probeSelectorsOf(code: Hex): Hex[] {
  const scanned = scanSelectors(code);
  return Object.values(SELECTORS).filter((selector) => scanned.has(selector));
}

/** The probe selectors of the dispatcher detection scans for a recorded contract: its implementation's, else its own. */
function recordedProbeSelectors(chainId: ChainId, address: string): Hex[] {
  const contract = recorded(chainId, address);
  return probeSelectorsOf(contract.implementation?.code ?? contract.code);
}

describe("06 §3 invariant 8: family detection on the recorded bytecode", () => {
  it.each(RECORDED_CONTRACTS.map((contract) => [`${contract.label} (${String(contract.chainId)}:${contract.address}, block ${String(contract.blockNumber)})`, contract] as const))(
    "06 §3 invariant 8: %s",
    async (_name, contract) => {
      const detection = await detectRecorded(contract.chainId, contract.address);
      expect(detection.family).toBe(contract.expectedFamily);
      expect(detection.chainId).toBe(contract.chainId);
      expect(detection.arbitrable).toBe(contract.address);
      expect(detection.implementation).toBe(contract.implementation?.address ?? null);
      expect(recordedProbeSelectors(contract.chainId, contract.address)).toEqual(contract.expectedSelectors);
      if (contract.expectedFamily === "reality-proxy") {
        expect(detection.realityProxy).toBe(getRealityProxy(REGISTRY, contract.chainId, contract.address));
      } else {
        expect(detection.writeFamily).toBe(contract.expectedFamily);
        expect(detection.realityProxy).toBeNull();
        expect(detection.capabilities).toEqual(classifySelectors(new Set(contract.expectedSelectors)).capabilities);
      }
    },
  );

  it("06 §3 invariant 8: every registered Reality proxy has recorded bytecode and detects as reality-proxy", async () => {
    const recordedKeys = RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily === "reality-proxy").map((contract) => registryKey(contract.chainId, contract.address));
    expect([...recordedKeys].sort((a, b) => a.localeCompare(b))).toEqual(Object.keys(REGISTRY.realityProxies).sort((a, b) => a.localeCompare(b)));
    for (const [key, entry] of Object.entries(REGISTRY.realityProxies)) {
      const chainId = Number(key.slice(0, key.indexOf(":")));
      const detection = await detectRecorded(chainId, entry.proxy);
      expect(detection.family).toBe("reality-proxy");
      expect(detection.realityProxy).toBe(entry);
    }
  });

  it("06 §3 invariant 8: the current ArbitrableProxy of every chain is idr-v2", async () => {
    const proxies = [
      [1, MAINNET_ARBITRABLE_PROXY],
      [100, "0xc7add3c961f7935cb4914e37da991d2f1cd7986c"],
      [10200, "0x4bef0321bd7fa943f85ae55e07f790c6becbd177"],
      [11155111, "0x009ca5a0b816156f91b29a93d7688c52480bab24"],
    ] as const;
    for (const [chainId, address] of proxies) {
      const detection = await detectRecorded(chainId, address);
      expect(detection.family).toBe("idr-v2");
      expect(detection.capabilities.withdraw).toEqual({ kind: "idr-v2" });
    }
  });
});

describe("F2 06 §1: probe selectors survive PUSH data skipping on real dispatchers", () => {
  it("F2 06 §1: ubi-voting.eth keeps getCurrentSessionNumber() among its probe selectors", async () => {
    const detection = await detectRecorded(1, "0x7510c77163683448b8dc8fe9e019d9482be1ed2b");
    expect(recordedProbeSelectors(1, "0x7510c77163683448b8dc8fe9e019d9482be1ed2b")).toContain(SELECTORS["getCurrentSessionNumber()"]);
    expect(detection.family).toBe("governor");
  });

  it("F2 06 §1: the Base-Ethereum foreign proxy keeps fundAppeal(uint256,uint256) among its probe selectors", async () => {
    const detection = await detectRecorded(1, "0xf0b37feda6cdf5f78b37e1fbccc24969059f2044");
    expect(recordedProbeSelectors(1, "0xf0b37feda6cdf5f78b37e1fbccc24969059f2044")).toContain(SELECTORS["fundAppeal(uint256,uint256)"]);
    expect(detection.capabilities.appeal).toEqual({ kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" });
  });
});

describe("06 §3 invariant 6: kleros.eth governor", () => {
  it("06 §3 invariant 6: kleros.eth detects as governor with appeal funding and without evidence submission", async () => {
    const detection = await detectRecorded(1, KLEROS_ETH);
    expect(detection.family).toBe("governor");
    expect(detection.capabilities).toEqual({ localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } });
  });

  it("06 §3 invariant 6: the other governors keep URI-only evidence", async () => {
    for (const [chainId, address] of [
      [1, POH_GOVERNOR],
      [1, "0x7510c77163683448b8dc8fe9e019d9482be1ed2b"],
      [100, "0xf7de5537ecd69a94695fcf4bcdbdee6329b63322"],
    ] as const) {
      const detection = await detectRecorded(chainId, address);
      expect(detection.family).toBe("governor");
      expect(detection.capabilities.evidence).toEqual({ kind: "uri-only" });
    }
  });
});

describe("06 §1 row 1: registered Reality proxies", () => {
  it("06 §1 row 1: a registered proxy matching an IDisputeResolver row gets that write family and its capabilities", async () => {
    const detection = await detectRecorded(1, LOCKLER_REALITY_PROXY);
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("idr-v2");
    expect(detection.capabilities).toEqual(classifySelectors(new Set(recorded(1, LOCKLER_REALITY_PROXY).expectedSelectors)).capabilities);
  });

  it("06 §1 row 1: a registered proxy matching none of rows 4 to 6 is view-only for writes (golden mainnet 150)", async () => {
    const detection = await detectRecorded(1, VIEW_ONLY_REALITY_PROXY);
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("view-only");
    expect(detection.capabilities).toEqual({ localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } });
  });

  it("06 §1 row 1: rows 2 and 3 never apply to a registered proxy", async () => {
    const escrowCode = recorded(1, MAINNET_ESCROW).code;
    const detection = await detectOn(1, LOCKLER_REALITY_PROXY, { code: { [LOCKLER_REALITY_PROXY]: escrowCode } }).detection;
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("view-only");
  });

  it("06 §1 row 1: the registry decides, keyed by arbitrator chain and address", async () => {
    const withoutProxies: Registry = { ...REGISTRY, realityProxies: {} };
    const unregistered = await detectOn(1, LOCKLER_REALITY_PROXY, recordedNode(1), withoutProxies).detection;
    expect(unregistered.family).toBe("idr-v2");
    expect(unregistered.realityProxy).toBeNull();

    const lockler = recorded(1, LOCKLER_REALITY_PROXY);
    const otherChain = await detectOn(100, LOCKLER_REALITY_PROXY, { code: { [LOCKLER_REALITY_PROXY]: lockler.code } }).detection;
    expect(otherChain.family).toBe("idr-v2");
  });
});

describe("C11: probes read bytecode, never call the arbitrable", () => {
  it("C11: detection only reads code and the EIP-1967 slot, never eth_call", async () => {
    for (const contract of RECORDED_CONTRACTS) {
      const { detection, calls } = detectOn(contract.chainId, contract.address);
      await detection;
      expect(calls.every((call) => call.method === "eth_getCode" || call.method === "eth_getStorageAt")).toBe(true);
    }
  });

  it("C11: an RPC error reading the arbitrable's code rejects instead of reading as view-only", async () => {
    const node: FakeNode = { ...recordedNode(1), fail: (call) => (call.method === "eth_getCode" ? rpcError(-32000, "header not found") : undefined) };
    await expect(detectOn(1, MAINNET_ARBITRABLE_PROXY, node).detection).rejects.toThrow();
  });

  it("C11: a revert-style error is never read as a missing selector", async () => {
    const node: FakeNode = { ...recordedNode(1), fail: () => rpcError(3, "execution reverted") };
    await expect(detectOn(1, MAINNET_ARBITRABLE_PROXY, node).detection).rejects.toThrow();
  });

  it("C11: an RPC error reading the EIP-1967 slot rejects", async () => {
    const node: FakeNode = { ...recordedNode(1), fail: (call) => (call.method === "eth_getStorageAt" ? rpcError(-32000, "timeout") : undefined) };
    await expect(detectOn(1, MAINNET_ARBITRABLE_PROXY, node).detection).rejects.toThrow();
  });

  it("C11: an RPC error reading the implementation's code rejects", async () => {
    const node: FakeNode = {
      ...recordedNode(1),
      fail: (call) => (call.method === "eth_getCode" && call.params[0] === UNSLASHED_IMPLEMENTATION ? rpcError(-32000, "timeout") : undefined),
    };
    await expect(detectOn(1, UNSLASHED, node).detection).rejects.toThrow();
  });

  it("F3 C11: an eth_getCode answer without a result rejects instead of reading as no code (mainnet ArbitrableProxy)", async () => {
    const node: FakeNode = { ...recordedNode(1), noResult: (call) => call.method === "eth_getCode" };
    await expect(detectOn(1, MAINNET_ARBITRABLE_PROXY, node).detection).rejects.toThrow();
  });

  it("F3 C11: an eth_getStorageAt answer without a result rejects instead of reading as not a proxy (Unslashed)", async () => {
    const node: FakeNode = { ...recordedNode(1), noResult: (call) => call.method === "eth_getStorageAt" };
    await expect(detectOn(1, UNSLASHED, node).detection).rejects.toThrow();
  });

  it("F3 C11: an implementation whose eth_getCode answer has no result rejects (Unslashed)", async () => {
    const node: FakeNode = { ...recordedNode(1), noResult: (call) => call.method === "eth_getCode" && call.params[0] === UNSLASHED_IMPLEMENTATION };
    await expect(detectOn(1, UNSLASHED, node).detection).rejects.toThrow();
  });

  it("F3 C11: a detection rejected for a missing result is not cached, so the next one reads the chain again", async () => {
    const cache = createFamilyCache();
    let answered = false;
    const { client, calls } = fakeNodeClient({ ...recordedNode(1), noResult: (call) => call.method === "eth_getCode" && !answered });
    await expect(detectFamily({ client, chainId: 1, arbitrable: MAINNET_ARBITRABLE_PROXY, cache })).rejects.toThrow();
    answered = true;
    await expect(detectFamily({ client, chainId: 1, arbitrable: MAINNET_ARBITRABLE_PROXY, cache })).resolves.toMatchObject({ family: "idr-v2" });
    expect(codeReads(calls)).toEqual([MAINNET_ARBITRABLE_PROXY, MAINNET_ARBITRABLE_PROXY]);
  });

  it("C11: malformed code from the node rejects", async () => {
    await expect(detectOn(1, UNLISTED, { code: { [UNLISTED]: "0x63zz" } }).detection).rejects.toThrow();
  });

  it("C11: follows the EIP-1967 slot: the Unslashed proxy is scanned through its implementation and detects as idr-v1", async () => {
    const { detection, calls } = detectOn(1, UNSLASHED);
    const result = await detection;
    expect(result.implementation).toBe(UNSLASHED_IMPLEMENTATION);
    expect(result.family).toBe("idr-v1");
    expect(result.capabilities.withdraw).toEqual({ kind: "idr-v1" });
    expect(codeReads(calls)).toEqual([UNSLASHED, UNSLASHED_IMPLEMENTATION]);
  });

  it("C11: the Unslashed proxy's own code carries no probe selector, so following the slot is what classifies it", () => {
    expect(classifySelectors(scanSelectors(recorded(1, UNSLASHED).code)).family).toBe("view-only");
  });

  it("C11: the Proof of Humanity v2 proxies are followed and stay view-only", async () => {
    for (const [chainId, address] of [
      [1, "0xbe9834097a4e97689d9b667441acafb456d0480a"],
      [100, "0xa4ac94c4fa65bb352efa30e3408e64f72ac857bc"],
    ] as const) {
      const detection = await detectRecorded(chainId, address);
      expect(detection.family).toBe("view-only");
      expect(detection.implementation).toBe(recorded(chainId, address).implementation?.address);
    }
  });

  it("C11: an EIP-1167 clone is not followed, even when its target is an IDisputeResolver", async () => {
    for (const address of [GNOSIS_CURATE_CLONE, GNOSIS_863_CLONE]) {
      const clone = recorded(100, address);
      const target = toRegistryAddress(`0x${clone.code.slice(22, 62)}`);
      const node: FakeNode = { code: { [address]: clone.code, [target]: recorded(1, MAINNET_ARBITRABLE_PROXY).code }, implementationSlot: { [address]: slotWord(target) } };
      const { detection, calls } = detectOn(100, address, node);
      const result = await detection;
      expect(result.family).toBe("view-only");
      expect(result.implementation).toBeNull();
      expect(probeSelectorsOf(clone.code)).toEqual([]);
      expect(calls).toEqual([{ method: "eth_getCode", params: [address, "latest"] }]);
    }
  });

  it("C11: a contract whose implementation slot is zero is scanned from its own code", async () => {
    const { detection, calls } = detectOn(1, MAINNET_ARBITRABLE_PROXY);
    const result = await detection;
    expect(result.implementation).toBeNull();
    expect(result.family).toBe("idr-v2");
    expect(codeReads(calls)).toEqual([MAINNET_ARBITRABLE_PROXY]);
  });

  it("06 §1 row 7: an address without code is view-only and nothing else is read", async () => {
    const { detection, calls } = detectOn(1, UNLISTED, { code: {} });
    const result = await detection;
    expect(result.family).toBe("view-only");
    expect(result.writeFamily).toBe("view-only");
    expect(result.implementation).toBeNull();
    expect(result.capabilities).toEqual(classifySelectors(new Set()).capabilities);
    expect(calls.map((call) => call.method)).toEqual(["eth_getCode"]);
  });

  it("06 §1 row 7: an EIP-1967 proxy whose implementation has no code is view-only", async () => {
    const empty = toRegistryAddress("0x2222222222222222222222222222222222222222");
    const result = await detectOn(1, UNLISTED, { code: { [UNLISTED]: recorded(1, UNSLASHED).code }, implementationSlot: { [UNLISTED]: slotWord(empty) } }).detection;
    expect(result.family).toBe("view-only");
    expect(result.implementation).toBe(empty);
  });
});

describe("ledger entries decided by the probes", () => {
  it("D-12: the lowercase-listed escrow 0x0d674409… is escrow-v1 with the pay-the-cost appeal", async () => {
    const detection = await detectRecorded(1, "0x0d67440946949fe293b45c52efd8a9b3d51e2522");
    expect(detection.family).toBe("escrow-v1");
    expect(detection.capabilities.appeal).toEqual({ kind: "escrow-pay-cost" });
    expect(detection.capabilities.localId).toBe("disputeIDtoTransactionID");
  });

  it("D-12: the input address is normalized, so a checksummed escrow address detects the same", async () => {
    const node = recordedNode(1);
    const { client } = fakeNodeClient(node);
    const checksummed = "0x0D67440946949FE293B45c52eFD8A9b3d51e2522" as `0x${Lowercase<string>}`;
    const detection = await detectFamily({ client, chainId: 1, arbitrable: checksummed });
    expect(detection.family).toBe("escrow-v1");
    expect(detection.arbitrable).toBe("0x0d67440946949fe293b45c52efd8a9b3d51e2522");
  });

  it("B21: an arbitrable that is not an address rejects without reading the chain", async () => {
    const { client, calls } = fakeNodeClient({ code: {} });
    const notAnAddress = "0x1234" as `0x${Lowercase<string>}`;
    await expect(detectFamily({ client, chainId: 1, arbitrable: notAnAddress })).rejects.toThrow("Not an EVM address");
    expect(calls).toEqual([]);
  });

  it("D-49: 0x4b89e798… (mainnet) and 0x1128ed55… (Gnosis) are idr-v1 and withdraw with the v1 signatures", async () => {
    for (const [chainId, address] of [
      [1, "0x4b89e798b10478a839ea0abcf86c4b94a3c782a4"],
      [100, "0x1128ed55ab2d796fa92d2f8e1f336d745354a77a"],
    ] as const) {
      const detection = await detectRecorded(chainId, address);
      expect(detection.family).toBe("idr-v1");
      expect(detection.capabilities.withdraw).toEqual({ kind: "idr-v1" });
    }
  });

  it("D-46: the older resolver proxy 0x135c5735… is idr-legacy, funds through the fundAppeal it carries and cannot withdraw", async () => {
    const detection = await detectRecorded(1, OLDER_RESOLVER_PROXY);
    expect(detection.family).toBe("idr-legacy");
    expect(detection.capabilities).toEqual({
      localId: "externalIDtoLocalID",
      evidence: { kind: "local-id" },
      appeal: { kind: "idr", fundAppeal: "fundAppeal(uint256,uint8)" },
      withdraw: { kind: "unsupported" },
    });
  });

  it("D-47: the governors fund and withdraw through the governor dialect", async () => {
    const detection = await detectRecorded(1, POH_GOVERNOR);
    expect(detection.capabilities.appeal).toEqual({ kind: "governor" });
    expect(detection.capabilities.withdraw).toEqual({ kind: "governor" });
  });

  it("D-47: Proof of Humanity v2, T2CR and the Curate clone have no funding interface", async () => {
    for (const [chainId, address] of [
      [1, "0xbe9834097a4e97689d9b667441acafb456d0480a"],
      [1, "0xebcf3bca271b26ae4b162ba560e243055af0e679"],
      [100, GNOSIS_CURATE_CLONE],
    ] as const) {
      const detection = await detectRecorded(chainId, address);
      expect(detection.capabilities.appeal).toEqual({ kind: "none" });
      expect(detection.capabilities.withdraw).toEqual({ kind: "none" });
    }
  });

  it("D-50: an escrow deployment in no list (an unlisted address on Gnosis, whose escrow list is empty today) is escrow-v1", async () => {
    const detection = await detectOn(100, UNLISTED, { code: { [UNLISTED]: recorded(11155111, "0x338f1a474e0fb0ae9e913cfa3d7c6aa19b92015b").code } }).detection;
    expect(detection.family).toBe("escrow-v1");
    expect(detection.capabilities.evidence).toEqual({ kind: "local-id" });
  });

  it("D-50: a governor deployment in no list (an unlisted address on Sepolia) is a governor with URI-only evidence", async () => {
    const detection = await detectOn(11155111, UNLISTED, { code: { [UNLISTED]: recorded(1, POH_GOVERNOR).code } }).detection;
    expect(detection.family).toBe("governor");
    expect(detection.capabilities.evidence).toEqual({ kind: "uri-only" });
  });
});
