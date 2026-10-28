import { describe, expect, it } from "vitest";
import { getChain } from "../chains";
import { normalizeIpfsPath, toCidPath } from "../uri";
import { SELECTORS } from "../abi";
import { RECORDED_CONTRACTS } from "../families/__fixtures__/recorded";
import { REGISTRY } from "./registry";
import { DISPUTE_1621_OVERRIDE, DISPUTE_1621_SCRIPT, DISPUTE_1684_SCRIPT, REMOVED_UNSLASHED_ADDRESS, addressOfKey, chainOfKey, sortedStrings } from "../test/registry/testHelpers";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("every address is lowercase, 40 hex characters, unique within its table", () => {
  const realityEntries = Object.entries(REGISTRY.realityProxies);

  it("registry keys are '<chain>:<lowercase address>', the entry's proxy is the key's address and its reality contract is lowercase hex", () => {
    for (const [key, entry] of realityEntries) {
      expect(chainOfKey(key)).toMatch(/^[1-9]\d*$/);
      expect(addressOfKey(key)).toMatch(ADDRESS_PATTERN);
      expect(entry.proxy).toBe(addressOfKey(key));
      expect(entry.reality).toMatch(ADDRESS_PATTERN);
    }
    for (const key of [...Object.keys(REGISTRY.overrides), ...Object.keys(REGISTRY.verifiedArbitrables)]) {
      expect(chainOfKey(key)).toMatch(/^[1-9]\d*$/);
      expect(addressOfKey(key)).toMatch(ADDRESS_PATTERN);
    }
  });

  it("no contract is both a verified arbitrable and a registered Reality proxy", () => {
    const realityKeys = new Set(Object.keys(REGISTRY.realityProxies));
    expect(Object.keys(REGISTRY.verifiedArbitrables).filter((key) => realityKeys.has(key))).toEqual([]);
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
  it("every Reality proxy, behavior override and verified arbitrable has a non-empty justification", () => {
    for (const [key, entry] of [...Object.entries(REGISTRY.realityProxies), ...Object.entries(REGISTRY.overrides), ...Object.entries(REGISTRY.verifiedArbitrables)]) {
      expect(entry.justification.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("every verified arbitrable's justification opens with the kind of evidence it rests on", () => {
    for (const [key, entry] of Object.entries(REGISTRY.verifiedArbitrables)) {
      expect(entry.justification, key).toMatch(/^(?:Verified source \((?:Blockscout|Sourcify)[^)]*\)|Bytecode twin of \d+:0x[0-9a-f]{40} at block \d+)/);
    }
  });

  it("a refund is promised only where the only funded ruling wins and the withdraw code was read, directly or in a twin", () => {
    for (const [key, entry] of Object.entries(REGISTRY.verifiedArbitrables)) {
      if (entry.refundsWithoutAppeal !== true) continue;
      expect(entry.settlement, key).toBe("sole-funded-wins");
      const twin = /^Bytecode twin of (\d+:0x[0-9a-f]{40})/.exec(entry.justification)?.[1];
      const source = twin === undefined ? entry : REGISTRY.verifiedArbitrables[twin as keyof typeof REGISTRY.verifiedArbitrables];
      expect(source?.refundsWithoutAppeal, key).toBe(true);
      expect(source?.justification, key).toMatch(/withdraw/i);
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
    for (const key of [...Object.keys(REGISTRY.overrides), ...Object.keys(REGISTRY.verifiedArbitrables)]) expectReadable(Number(chainOfKey(key)), `key of ${key}`);
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

  it("the verified arbitrables are the reviewed set: resolver proxies, Yubiai, the legacy proxy, the governors and the mainnet escrows", () => {
    expect(sortedStrings(Object.keys(REGISTRY.verifiedArbitrables))).toEqual(
      sortedStrings([
        "1:0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
        "100:0xc7add3c961f7935cb4914e37da991d2f1cd7986c",
        "11155111:0x009ca5a0b816156f91b29a93d7688c52480bab24",
        "11155111:0x1780601e6465f32233643f3af54abc3d8df161be",
        "1:0x4b89e798b10478a839ea0abcf86c4b94a3c782a4",
        "100:0x1128ed55ab2d796fa92d2f8e1f336d745354a77a",
        "100:0xaeecfa44639b61d2e0a9534d918789d94a24a9de",
        "1:0x135c573503f70dc290b1d60fe2e7f7eb114febd6",
        "1:0x327a29fce0a6490e4236240be176daa282eccfdf",
        "1:0x7510c77163683448b8dc8fe9e019d9482be1ed2b",
        "1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4",
        "100:0xf7de5537ecd69a94695fcf4bcdbdee6329b63322",
        "1:0xe2dd8cce2c33a04215074adb4b5820b765d8ed9d",
        "1:0x0d67440946949fe293b45c52efd8a9b3d51e2522",
        "1:0xc25a0b9681abf6f090aed71a8c08fb564b41dab6",
        "1:0xbcf0d1ad453728f75e9cfd4358ed187598a45e6c",
      ]),
    );
  });

  it("no upgradeable contract is verified: an entry's rules would not survive an upgrade", () => {
    for (const key of Object.keys(REGISTRY.verifiedArbitrables)) {
      const contract = RECORDED_CONTRACTS.find((candidate) => `${String(candidate.chainId)}:${candidate.address}` === key);
      expect(contract, `${key} has recorded bytecode`).toBeDefined();
      expect(contract?.implementation ?? null, key).toBeNull();
    }
  });

  it("the Reality proxies marked as not appealable are exactly the registered ones whose code has no fundAppeal", () => {
    const fundAppeal = new Set([SELECTORS["fundAppeal(uint256,uint256)"], SELECTORS["fundAppeal(uint256,uint8)"], SELECTORS["fundAppeal(uint256)"]]);
    const withoutFunding = RECORDED_CONTRACTS.filter(
      (contract) => contract.expectedFamily === "reality-proxy" && !contract.expectedSelectors.some((selector) => fundAppeal.has(selector)),
    );
    const notAppealable = Object.entries(REGISTRY.realityProxies).filter(([, entry]) => entry.appealable === false);
    expect(sortedStrings(notAppealable.map(([key]) => key))).toEqual(sortedStrings(withoutFunding.map((contract) => `${String(contract.chainId)}:${contract.address}`)));
    expect(notAppealable).toHaveLength(6);
    for (const [key, entry] of notAppealable) expect(entry.justification, key).toMatch(/no appeal function/);
  });

  it("the canonical hosts are resolve.kleros.io", () => {
    expect(REGISTRY.canonicalHosts).toEqual(["resolve.kleros.io"]);
  });
});
