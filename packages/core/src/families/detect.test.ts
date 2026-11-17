import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import { getRealityProxy, REGISTRY, registryKey, toRegistryAddress } from "../registry";
import type { Registry } from "../registry/types";
import type { Hex } from "../types";
import { RECORDED_CONTRACTS, recorded } from "./__fixtures__/recorded";
import { classifySelectors, detectFamily, scanSelectors } from "./index";
import { codeReads, fakeNodeClient, recordedNode, rpcError, slotWord, type FakeNode } from "../test/families/testHelpers";
import type { FamilyDetection } from "./types";

const UNSLASHED = "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38";
const UNSLASHED_IMPLEMENTATION = "0xa5eb6fec99f0c5b052078451c7dbb927d4b7054f";
const MAINNET_ARBITRABLE_PROXY = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const MAINNET_ESCROW = "0xc25a0b9681abf6f090aed71a8c08fb564b41dab6";
const POH_GOVERNOR = "0x327a29fce0a6490e4236240be176daa282eccfdf";
const GNOSIS_CURATE_CLONE = "0x957a53a994860be4750810131d9c876b2f52d6e1";
const GNOSIS_863_CLONE = "0x25fa9432832efdd48deec6d4cf1cd3f139678a5b";
const VIEW_ONLY_REALITY_PROXY = "0x594ec762b59978c97c82bc36ab493ed8b1f1f368";
const LOCKLER_REALITY_PROXY = "0x1c2811550551d84030cd1b608e6fe3fd6fd5fc0d";
const UNLISTED = toRegistryAddress("0x1111111111111111111111111111111111111111");

function detectOn(chainId: number, address: string, node: FakeNode = recordedNode(chainId), registry?: Registry) {
  const { client, calls } = fakeNodeClient(node);
  const detection = detectFamily({ client, chainId, arbitrable: toRegistryAddress(address), ...(registry === undefined ? {} : { registry }) });
  return { detection, calls };
}

function detectRecorded(chainId: number, address: string): Promise<FamilyDetection> {
  return detectOn(chainId, address).detection;
}

/** The probe selectors carried by `code`'s dispatcher, in `SELECTORS` order. */
function probeSelectorsOf(code: Hex): Hex[] {
  const scanned = scanSelectors(code);
  return Object.values(SELECTORS).filter((selector) => scanned.has(selector));
}

function recordedProbeSelectors(chainId: number, address: string): Hex[] {
  const contract = recorded(chainId, address);
  return probeSelectorsOf(contract.implementation?.code ?? contract.code);
}

describe("family detection on recorded bytecode", () => {
  it.each(RECORDED_CONTRACTS.map((contract) => [`${contract.label} (${String(contract.chainId)}:${contract.address}, block ${String(contract.blockNumber)})`, contract] as const))(
    "detects the expected family for %s",
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

  it("every registered Reality proxy has recorded bytecode", () => {
    const recordedKeys = RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily === "reality-proxy").map((contract) => registryKey(contract.chainId, contract.address));
    expect([...recordedKeys].sort((a, b) => a.localeCompare(b))).toEqual(Object.keys(REGISTRY.realityProxies).sort((a, b) => a.localeCompare(b)));
  });
});

describe("registered Reality proxies", () => {
  it("a registered proxy matching an IDisputeResolver rule gets that write family and its capabilities", async () => {
    const detection = await detectRecorded(1, LOCKLER_REALITY_PROXY);
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("idr-v2");
    expect(detection.capabilities).toEqual(classifySelectors(new Set(recorded(1, LOCKLER_REALITY_PROXY).expectedSelectors)).capabilities);
  });

  it("a registered proxy matching no IDisputeResolver rule is view-only for writes", async () => {
    const detection = await detectRecorded(1, VIEW_ONLY_REALITY_PROXY);
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("view-only");
    expect(detection.capabilities).toEqual({ localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } });
  });

  it("the escrow and governor rules never apply to a registered proxy", async () => {
    const escrowCode = recorded(1, MAINNET_ESCROW).code;
    const detection = await detectOn(1, LOCKLER_REALITY_PROXY, { code: { [LOCKLER_REALITY_PROXY]: escrowCode } }).detection;
    expect(detection.family).toBe("reality-proxy");
    expect(detection.writeFamily).toBe("view-only");
  });

  it("the registry decides, keyed by arbitrator chain and address", async () => {
    const withoutProxies: Registry = { ...REGISTRY, realityProxies: {} };
    const unregistered = await detectOn(1, LOCKLER_REALITY_PROXY, recordedNode(1), withoutProxies).detection;
    expect(unregistered.family).toBe("idr-v2");
    expect(unregistered.realityProxy).toBeNull();

    const lockler = recorded(1, LOCKLER_REALITY_PROXY);
    const otherChain = await detectOn(100, LOCKLER_REALITY_PROXY, { code: { [LOCKLER_REALITY_PROXY]: lockler.code } }).detection;
    expect(otherChain.family).toBe("idr-v2");
  });
});

describe("probes read bytecode and never call the arbitrable", () => {
  it.each<[string, string, Pick<FakeNode, "fail" | "noResult">]>([
    [
      "an RPC error reading the arbitrable's code rejects instead of reading as view-only",
      MAINNET_ARBITRABLE_PROXY,
      { fail: (call) => (call.method === "eth_getCode" ? rpcError(-32000, "header not found") : undefined) },
    ],
    ["a revert-style error is never read as a missing selector", MAINNET_ARBITRABLE_PROXY, { fail: () => rpcError(3, "execution reverted") }],
    [
      "an RPC error reading the EIP-1967 slot rejects",
      MAINNET_ARBITRABLE_PROXY,
      { fail: (call) => (call.method === "eth_getStorageAt" ? rpcError(-32000, "timeout") : undefined) },
    ],
    [
      "an RPC error reading the implementation's code rejects",
      UNSLASHED,
      { fail: (call) => (call.method === "eth_getCode" && call.params[0] === UNSLASHED_IMPLEMENTATION ? rpcError(-32000, "timeout") : undefined) },
    ],
    [
      "an eth_getCode answer without a result rejects instead of reading as no code (mainnet ArbitrableProxy)",
      MAINNET_ARBITRABLE_PROXY,
      { noResult: (call) => call.method === "eth_getCode" },
    ],
    [
      "an implementation whose eth_getCode answer has no result rejects (Unslashed)",
      UNSLASHED,
      { noResult: (call) => call.method === "eth_getCode" && call.params[0] === UNSLASHED_IMPLEMENTATION },
    ],
  ])("%s", async (_name, address, misbehaviour) => {
    await expect(detectOn(1, address, { ...recordedNode(1), ...misbehaviour }).detection).rejects.toThrow();
  });

  it("malformed code from the node rejects", async () => {
    await expect(detectOn(1, UNLISTED, { code: { [UNLISTED]: "0x63zz" } }).detection).rejects.toThrow();
    await expect(detectOn(1, UNLISTED, { code: { [UNLISTED]: "0x123" } }).detection).rejects.toThrow();
  });

  it("follows the EIP-1967 slot: the Unslashed proxy is scanned through its implementation and detects as idr-v1", async () => {
    const { detection, calls } = detectOn(1, UNSLASHED);
    const result = await detection;
    expect(result.implementation).toBe(UNSLASHED_IMPLEMENTATION);
    expect(result.family).toBe("idr-v1");
    expect(result.capabilities.withdraw).toEqual({ kind: "idr-v1" });
    expect(codeReads(calls)).toEqual([UNSLASHED, UNSLASHED_IMPLEMENTATION]);
  });

  it("an EIP-1167 clone is not followed, even when its target is an IDisputeResolver", async () => {
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

  it("a contract whose implementation slot is zero is scanned from its own code", async () => {
    const { detection, calls } = detectOn(1, MAINNET_ARBITRABLE_PROXY);
    const result = await detection;
    expect(result.implementation).toBeNull();
    expect(result.family).toBe("idr-v2");
    expect(codeReads(calls)).toEqual([MAINNET_ARBITRABLE_PROXY]);
  });

  it("an address without code is view-only and nothing else is read", async () => {
    const { detection, calls } = detectOn(1, UNLISTED, { code: {} });
    const result = await detection;
    expect(result.family).toBe("view-only");
    expect(result.writeFamily).toBe("view-only");
    expect(result.implementation).toBeNull();
    expect(result.capabilities).toEqual(classifySelectors(new Set()).capabilities);
    expect(calls.map((call) => call.method)).toEqual(["eth_getCode"]);
  });

  it("an EIP-1967 proxy whose implementation has no code is view-only", async () => {
    const empty = toRegistryAddress("0x2222222222222222222222222222222222222222");
    const result = await detectOn(1, UNLISTED, { code: { [UNLISTED]: recorded(1, UNSLASHED).code }, implementationSlot: { [UNLISTED]: slotWord(empty) } }).detection;
    expect(result.family).toBe("view-only");
    expect(result.implementation).toBe(empty);
  });
});

describe("known deployments decided by the probes", () => {
  it("the input address is normalized, so a checksummed escrow address detects the same", async () => {
    const node = recordedNode(1);
    const { client } = fakeNodeClient(node);
    const checksummed = "0x0D67440946949FE293B45c52eFD8A9b3d51e2522" as `0x${Lowercase<string>}`;
    const detection = await detectFamily({ client, chainId: 1, arbitrable: checksummed });
    expect(detection.family).toBe("escrow-v1");
    expect(detection.arbitrable).toBe("0x0d67440946949fe293b45c52efd8a9b3d51e2522");
  });

  it("an arbitrable that is not an address rejects without reading the chain", async () => {
    const { client, calls } = fakeNodeClient({ code: {} });
    const notAnAddress = "0x1234" as `0x${Lowercase<string>}`;
    await expect(detectFamily({ client, chainId: 1, arbitrable: notAnAddress })).rejects.toThrow("Not an EVM address");
    expect(calls).toEqual([]);
  });

  it("an escrow deployment at an unlisted address on Gnosis is escrow-v1", async () => {
    const detection = await detectOn(100, UNLISTED, { code: { [UNLISTED]: recorded(11155111, "0x338f1a474e0fb0ae9e913cfa3d7c6aa19b92015b").code } }).detection;
    expect(detection.family).toBe("escrow-v1");
    expect(detection.capabilities.evidence).toEqual({ kind: "local-id" });
  });

  it("a governor deployment at an unlisted address on Sepolia is a governor with URI-only evidence", async () => {
    const detection = await detectOn(11155111, UNLISTED, { code: { [UNLISTED]: recorded(1, POH_GOVERNOR).code } }).detection;
    expect(detection.family).toBe("governor");
    expect(detection.capabilities.evidence).toEqual({ kind: "uri-only" });
  });
});
