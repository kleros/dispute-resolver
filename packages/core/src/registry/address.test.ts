import { describe, expect, it } from "vitest";
import { toRegistryAddress } from "./address";

describe("toRegistryAddress", () => {
  it("lowercases a checksummed address", () => {
    expect(toRegistryAddress("0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069")).toBe("0x988b3a538b618c7a603e1c11ab82cd16dbe28069");
  });

  it("rejects a value that is not an address", () => {
    expect(() => toRegistryAddress("not-an-address")).toThrow();
    expect(() => toRegistryAddress(42)).toThrow();
  });
});
