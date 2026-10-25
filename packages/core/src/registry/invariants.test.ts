import { describe, expect, it } from "vitest";
import { getChain } from "../chains";
import { normalizeIpfsPath, toCidPath } from "../uri";
import { REGISTRY } from "./registry";
import { DISPUTE_1621_OVERRIDE, DISPUTE_1621_SCRIPT, DISPUTE_1684_SCRIPT, REMOVED_UNSLASHED_ADDRESS, addressOfKey, chainOfKey, sortedStrings } from "../test/registry/testHelpers";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("every address is lowercase, 40 hex characters, unique within its table", () => {
  const realityEntries = Object.entries(REGISTRY.realityProxies);

  it("registry keys are '<chain>:<lowercase address>' and the entry's proxy is the key's address", () => {
    for (const [key, entry] of realityEntries) {
      expect(chainOfKey(key)).toMatch(/^[1-9]\d*$/);
      expect(addressOfKey(key)).toMatch(ADDRESS_PATTERN);
      expect(entry.proxy).toBe(addressOfKey(key));
    }
    for (const key of Object.keys(REGISTRY.overrides)) {
      expect(addressOfKey(key)).toMatch(ADDRESS_PATTERN);
    }
  });

  it("reality contract addresses are lowercase hex", () => {
    for (const [, entry] of realityEntries) {
      expect(entry.reality).toMatch(ADDRESS_PATTERN);
    }
  });

  it("no reality proxy address repeats within an arbitrator chain", () => {
    for (const chain of ["1", "100"]) {
      const proxies = realityEntries.filter(([key]) => chainOfKey(key) === chain).map(([, entry]) => entry.proxy);
      expect(proxies.length).toBeGreaterThan(0);
      expect(duplicates(proxies)).toEqual([]);
    }
  });

  it("the display allowlist holds lowercase hex addresses, unique per chain", () => {
    for (const [chain, addresses] of Object.entries(REGISTRY.displayAllowlist)) {
      expect(addresses.length, `chain ${chain}`).toBeGreaterThan(0);
      for (const address of addresses) expect(address).toMatch(ADDRESS_PATTERN);
      expect(duplicates(addresses), `chain ${chain}`).toEqual([]);
    }
  });
});

describe("every entry is justified", () => {
  it("every Reality proxy has a non-empty justification", () => {
    for (const [key, entry] of Object.entries(REGISTRY.realityProxies)) {
      expect(entry.justification.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("every behavior override has a non-empty justification", () => {
    for (const [key, entry] of Object.entries(REGISTRY.overrides)) {
      expect(entry.justification.trim().length, key).toBeGreaterThan(0);
    }
  });
});

describe("every referenced chain is configured with a read RPC", () => {
  function expectReadable(chainId: number, where: string): void {
    const chain = getChain(chainId);
    expect(chain, `${where}: chain ${String(chainId)} is not in the chain table`).toBeDefined();
    expect(chain?.readRpcEnv ?? chain?.defaultRpcUrl, `${where}: chain ${String(chainId)} has no read RPC`).toBeTruthy();
  }

  it("every Reality home chain and every key chain has a readRpcEnv or a defaultRpcUrl", () => {
    for (const [key, entry] of Object.entries(REGISTRY.realityProxies)) {
      expectReadable(entry.realityChainId, `home chain of ${key}`);
      expectReadable(Number(chainOfKey(key)), `key of ${key}`);
    }
    for (const key of Object.keys(REGISTRY.overrides)) expectReadable(Number(chainOfKey(key)), `key of ${key}`);
    for (const chain of Object.keys(REGISTRY.dynamicScriptAllowlist)) expectReadable(Number(chain), "dynamic script allowlist");
    for (const chain of Object.keys(REGISTRY.displayAllowlist)) expectReadable(Number(chain), "display allowlist");
  });
});

describe("the dynamic-script allowlist", () => {
  const lists = Object.entries(REGISTRY.dynamicScriptAllowlist);

  it("lists exist for the four chains whose disputes may run scripts", () => {
    expect(
      Object.keys(REGISTRY.dynamicScriptAllowlist)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 100, 10200, 11155111]);
  });

  it("every entry is a canonical CID path: no scheme, no leading slash, no trailing slash", () => {
    for (const [chain, entries] of lists) {
      for (const entry of entries) {
        const canonical = normalizeIpfsPath(entry);
        expect(canonical, `chain ${chain}: ${entry}`).not.toBeNull();
        if (canonical !== null) expect(toCidPath(canonical), `chain ${chain}: ${entry}`).toBe(entry);
      }
    }
  });

  it("no list repeats an entry", () => {
    for (const [chain, entries] of lists) expect(duplicates(entries), `chain ${chain}`).toEqual([]);
  });

  it("the dispute 1621 override script is on no list", () => {
    for (const [, entries] of lists) expect(entries).not.toContain(DISPUTE_1621_OVERRIDE);
  });

  it("the script of dispute 1621's own meta-evidence is on the mainnet list, so it runs in place of the override", () => {
    expect(REGISTRY.dynamicScriptAllowlist[1]).toContain(DISPUTE_1621_SCRIPT);
  });

  it("mainnet dispute 1684's wallet-hijack script is on no list", () => {
    for (const [, entries] of lists) expect(entries).not.toContain(DISPUTE_1684_SCRIPT);
  });

  it("the default script is allowed on every chain that has a list", () => {
    expect(REGISTRY.defaultScriptCid).toBe("QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj");
    for (const [chain, entries] of lists) expect(entries, `chain ${chain}`).toContain(REGISTRY.defaultScriptCid);
  });
});

describe("the display allowlist", () => {
  it("is keyed by the expected chains", () => {
    expect(
      Object.keys(REGISTRY.displayAllowlist)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 100, 130, 137, 300, 1301, 8453, 10200, 84532, 11155111, 11155420]);
  });
});

describe("excluded addresses", () => {
  it("the codeless second Unslashed address 0xb9f9b5ee... appears nowhere in the registry", () => {
    expect(JSON.stringify(REGISTRY).toLowerCase()).not.toContain(REMOVED_UNSLASHED_ADDRESS.slice(2));
  });
});

describe("registry data", () => {
  it("29 Reality proxies on arbitrator chains 1 and 100", () => {
    const keys = Object.keys(REGISTRY.realityProxies);
    expect(keys).toHaveLength(29);
    expect(sortedStrings([...new Set(keys.map(chainOfKey))])).toEqual(["1", "100"]);
  });

  it("Unslashed on mainnet is the single override", () => {
    expect(Object.keys(REGISTRY.overrides)).toEqual(["1:0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38"]);
  });

  it("the canonical hosts are resolve.kleros.io", () => {
    expect(REGISTRY.canonicalHosts).toEqual(["resolve.kleros.io"]);
  });

  it("kleros.eth is not a Reality proxy or an override", () => {
    expect(REGISTRY.realityProxies).not.toHaveProperty(["1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]);
    expect(REGISTRY.overrides).not.toHaveProperty(["1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]);
  });
});
