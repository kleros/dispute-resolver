import { isAddress, isHex } from "viem";
import { SELECTORS } from "../abi";
import { getRealityProxy, REGISTRY, toRegistryAddress } from "../registry";
import type { Registry } from "../registry/types";
import type { Address, ChainId, Hex, ReadClient } from "../types";
import { classifyRealityProxySelectors, classifySelectors } from "./classify";
import { isEip1167Clone, readEip1967Implementation } from "./proxies";
import { scanSelectors } from "./scanSelectors";
import type { FamilyCache, FamilyDetection } from "./types";

const PROBE_SELECTORS: readonly Hex[] = Object.values(SELECTORS);

/**
 * The code of `address`, `0x` when it has none. Read as raw JSON-RPC because viem's `getCode` turns both `"0x"` and an
 * answer without a result into `undefined`; only the literal `"0x"` is an empty account. A missing result or malformed
 * code rejects rather than reading as "no selectors" (C11).
 */
async function readCode(client: ReadClient, address: Address): Promise<Hex> {
  const code: unknown = await client.request({ method: "eth_getCode", params: [address, "latest"] });
  if (typeof code !== "string" || !isHex(code, { strict: true }) || code.length % 2 !== 0) throw new Error(`Malformed code at ${address}`);
  return code;
}

/**
 * The code whose dispatcher decides the family: the implementation's behind an EIP-1967 proxy, else the contract's own.
 * An empty account or an EIP-1167 clone is scanned as is, without reading the implementation slot (C11).
 */
async function readDispatcher(client: ReadClient, address: Address): Promise<{ readonly code: Hex; readonly implementation: Address | null }> {
  const code = await readCode(client, address);
  if (code === "0x" || isEip1167Clone(code)) return { code, implementation: null };
  const implementation = await readEip1967Implementation(client, address);
  if (implementation === null) return { code, implementation };
  return { code: await readCode(client, implementation), implementation };
}

async function probe(client: ReadClient, chainId: ChainId, arbitrable: Address, registry: Registry): Promise<FamilyDetection> {
  const realityProxy = getRealityProxy(registry, chainId, arbitrable) ?? null;
  const { code, implementation } = await readDispatcher(client, arbitrable);
  const scanned = scanSelectors(code);
  const probed = realityProxy === null ? classifySelectors(scanned) : classifyRealityProxySelectors(scanned);
  return {
    chainId,
    arbitrable,
    family: realityProxy === null ? probed.family : "reality-proxy",
    writeFamily: probed.family,
    capabilities: probed.capabilities,
    realityProxy,
    implementation,
    selectors: PROBE_SELECTORS.filter((selector) => scanned.has(selector)),
  };
}

/**
 * The family of an arbitrable on an arbitrator chain (06 §1, ADR 0003 layer one). A registered Reality proxy is
 * `reality-proxy` with its write family from rows 4–6; any other arbitrable gets rows 2–7 on its dispatcher bytecode.
 * Detection reads code and the EIP-1967 slot only, never calls the arbitrable, and rejects on any RPC error: a failure
 * is never read as "selector absent" (C11). With a `cache`, one detection per chain and address is shared.
 */
export function detectFamily(request: {
  readonly client: ReadClient;
  readonly chainId: ChainId;
  readonly arbitrable: Address;
  readonly registry?: Registry;
  readonly cache?: FamilyCache;
}): Promise<FamilyDetection> {
  const { client, chainId, cache } = request;
  if (!isAddress(request.arbitrable, { strict: false })) return Promise.reject(new Error(`Not an EVM address: ${String(request.arbitrable)}`));
  const arbitrable = toRegistryAddress(request.arbitrable);
  const cached = cache?.get(chainId, arbitrable);
  if (cached !== undefined) return cached;
  const detection = probe(client, chainId, arbitrable, request.registry ?? REGISTRY);
  cache?.set(chainId, arbitrable, detection);
  return detection;
}
