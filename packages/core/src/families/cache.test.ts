import { describe, expect, it } from "vitest";
import { toRegistryAddress } from "../registry";
import { recorded } from "./__fixtures__/recorded";
import { createFamilyCache, detectFamily } from "./index";
import { codeReads, fakeNodeClient, recordedNode, rpcError, type FakeNode } from "./testHelpers";
import type { FamilyDetection } from "./types";

const ARBITRABLE = toRegistryAddress("0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");

/** Lets every pending promise callback run. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createFamilyCache", () => {
  it("C11: concurrent detections of one arbitrable share one promise and one code read", async () => {
    const cache = createFamilyCache();
    const { client, calls } = fakeNodeClient(recordedNode(1));
    const first = detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache });
    const second = detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache });
    expect(second).toBe(first);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(codeReads(calls)).toEqual([ARBITRABLE]);
  });

  it("C11: a settled detection is reused for the rest of the session without RPC calls", async () => {
    const cache = createFamilyCache();
    const { client, calls } = fakeNodeClient(recordedNode(1));
    const first = await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache });
    const callsAfterFirst = calls.length;
    const again = await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache });
    expect(again).toBe(first);
    expect(calls).toHaveLength(callsAfterFirst);
  });

  it("C11: a rejected detection is evicted, so the next call probes again", async () => {
    const cache = createFamilyCache();
    let failing = true;
    const node: FakeNode = { ...recordedNode(1), fail: () => (failing ? rpcError(-32000, "timeout") : undefined) };
    const { client } = fakeNodeClient(node);
    await expect(detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache })).rejects.toThrow();
    await settle();
    expect(cache.get(1, ARBITRABLE)).toBeUndefined();
    failing = false;
    await expect(detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache })).resolves.toMatchObject({ family: "idr-v2" });
  });

  it("C11: the cache is keyed by arbitrator chain and address", async () => {
    const cache = createFamilyCache();
    const code = recorded(1, ARBITRABLE).code;
    const { client, calls } = fakeNodeClient({ code: { [ARBITRABLE]: code } });
    const mainnet = await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache });
    const gnosis = await detectFamily({ client, chainId: 100, arbitrable: ARBITRABLE, cache });
    expect(gnosis).not.toBe(mainnet);
    expect(gnosis.chainId).toBe(100);
    expect(codeReads(calls)).toEqual([ARBITRABLE, ARBITRABLE]);
  });

  it("C11: each cache is its own in-memory session store", async () => {
    const { client, calls } = fakeNodeClient(recordedNode(1));
    await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache: createFamilyCache() });
    await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE, cache: createFamilyCache() });
    expect(codeReads(calls)).toEqual([ARBITRABLE, ARBITRABLE]);
  });

  it("C11: without a cache every call probes", async () => {
    const { client, calls } = fakeNodeClient(recordedNode(1));
    await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE });
    await detectFamily({ client, chainId: 1, arbitrable: ARBITRABLE });
    expect(codeReads(calls)).toEqual([ARBITRABLE, ARBITRABLE]);
  });

  it("C11: get, set and delete hold the promise itself", async () => {
    const cache = createFamilyCache();
    const detection = Promise.resolve({ family: "view-only" } as FamilyDetection);
    cache.set(1, ARBITRABLE, detection);
    expect(cache.get(1, ARBITRABLE)).toBe(detection);
    expect(cache.get(100, ARBITRABLE)).toBeUndefined();
    cache.delete(1, ARBITRABLE);
    expect(cache.get(1, ARBITRABLE)).toBeUndefined();
    await detection;
  });

  it("C11: a stored promise that rejects is evicted by the cache itself", async () => {
    const cache = createFamilyCache();
    const failed = Promise.reject(new Error("timeout"));
    cache.set(1, ARBITRABLE, failed);
    await expect(failed).rejects.toThrow("timeout");
    await settle();
    expect(cache.get(1, ARBITRABLE)).toBeUndefined();
  });

  it("C11: a late rejection does not evict the promise that replaced it", async () => {
    const cache = createFamilyCache();
    const deferred: { reject?: (reason: Error) => void } = {};
    const old = new Promise<FamilyDetection>((_resolve, reject) => {
      deferred.reject = reject;
    });
    cache.set(1, ARBITRABLE, old);
    const replacement = Promise.resolve({ family: "idr-v2" } as FamilyDetection);
    cache.set(1, ARBITRABLE, replacement);
    deferred.reject?.(new Error("timeout"));
    await expect(old).rejects.toThrow("timeout");
    await settle();
    expect(cache.get(1, ARBITRABLE)).toBe(replacement);
  });
});
