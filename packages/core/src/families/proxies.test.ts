import { describe, expect, it } from "vitest";
import { EIP1967_IMPLEMENTATION_SLOT } from "../abi";
import { toRegistryAddress } from "../registry";
import type { Hex } from "../types";
import { isEip1167Clone, readEip1967Implementation } from "./proxies";
import { fakeNodeClient, rpcError, slotWord } from "../test/families/testHelpers";

const PROXY = toRegistryAddress("0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38");
const IMPLEMENTATION = toRegistryAddress("0xa5eb6fec99f0c5b052078451c7dbb927d4b7054f");
const CLONE_PREFIX = "363d3d373d3d3d363d73";
const CLONE_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

describe("isEip1167Clone", () => {
  it("matches the pattern case-insensitively", () => {
    expect(isEip1167Clone(`0x${CLONE_PREFIX.toUpperCase()}${"AB".repeat(20)}${CLONE_SUFFIX.toUpperCase()}`)).toBe(true);
  });

  it("rejects code that only resembles a clone", () => {
    const target = "ab".repeat(20);
    expect(isEip1167Clone(`0x${CLONE_PREFIX}${target}${CLONE_SUFFIX}00`)).toBe(false);
    expect(isEip1167Clone(`0x00${CLONE_PREFIX}${target}${CLONE_SUFFIX}`)).toBe(false);
    expect(isEip1167Clone(`0x${CLONE_PREFIX}${"ab".repeat(19)}${CLONE_SUFFIX}`)).toBe(false);
    expect(isEip1167Clone("0x")).toBe(false);
  });
});

describe("readEip1967Implementation", () => {
  it("returns the lowercase address in the low 20 bytes of the implementation slot", async () => {
    const { client, calls } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: slotWord(IMPLEMENTATION) } });
    await expect(readEip1967Implementation(client, PROXY)).resolves.toBe(IMPLEMENTATION);
    expect(calls).toEqual([{ method: "eth_getStorageAt", params: [PROXY, EIP1967_IMPLEMENTATION_SLOT, "latest"] }]);
  });

  it("a checksummed word from the node becomes a lowercase core address", async () => {
    const checksummedWord = `0x000000000000000000000000A5EB6FEC99F0C5B052078451C7DBB927D4B7054F` as Hex;
    const { client } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: checksummedWord } });
    await expect(readEip1967Implementation(client, PROXY)).resolves.toBe(IMPLEMENTATION);
  });

  it("a zero word, an empty answer or a short zero means no implementation", async () => {
    for (const word of [slotWord(toRegistryAddress("0x0000000000000000000000000000000000000000")), "0x", "0x0"] as const) {
      const { client } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: word } });
      await expect(readEip1967Implementation(client, PROXY)).resolves.toBeNull();
    }
  });

  it("a word whose low 20 bytes are zero is not an implementation", async () => {
    const highBitsOnly = `0x01${"00".repeat(31)}` as Hex;
    const { client } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: highBitsOnly } });
    await expect(readEip1967Implementation(client, PROXY)).resolves.toBeNull();
  });

  it("an RPC error rejects instead of reading as no implementation", async () => {
    const { client } = fakeNodeClient({ code: {}, fail: () => rpcError(-32000, "header not found") });
    await expect(readEip1967Implementation(client, PROXY)).rejects.toThrow();
  });

  it("an answer without a result rejects instead of reading as no implementation", async () => {
    const { client } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: slotWord(IMPLEMENTATION) }, noResult: () => true });
    await expect(readEip1967Implementation(client, PROXY)).rejects.toThrow();
  });

  it("a malformed word rejects", async () => {
    for (const word of ["0xzz", `0x${"11".repeat(33)}`, `zz${slotWord(IMPLEMENTATION)}`] as Hex[]) {
      const { client } = fakeNodeClient({ code: {}, implementationSlot: { [PROXY]: word } });
      await expect(readEip1967Implementation(client, PROXY)).rejects.toThrow();
    }
  });
});
