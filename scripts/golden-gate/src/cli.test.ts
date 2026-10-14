import { describe, expect, it } from "vitest";
import { USAGE, parseCommandLine } from "./cli";

describe("command line", () => {
  it("defaults to every arbitrator chain, the production timeouts and four disputes at once", () => {
    expect(parseCommandLine(["gate"])).toEqual({
      command: "gate",
      gate: {
        chains: [1, 100, 11155111, 10200],
        cids: null,
        maxPerCid: null,
        concurrency: 4,
        oldTimeoutMs: 180_000,
        newTimeoutMs: 120_000,
        reuseEnumeration: false,
        skipBuild: false,
      },
    });
  });

  it("reads the restrictions of a partial run", () => {
    const request = parseCommandLine(["gate", "--chains", "1,10200", "--cids", "QmZZHw,QmQGMR", "--max-per-cid", "2", "--timeout-ms", "30000", "--skip-build"]);
    expect(request.gate).toMatchObject({ chains: [1, 10200], cids: ["QmZZHw", "QmQGMR"], maxPerCid: 2, oldTimeoutMs: 30_000, newTimeoutMs: 30_000, skipBuild: true });
  });

  it("refuses a chain without an arbitrator, a malformed number and an unknown command", () => {
    expect(() => parseCommandLine(["gate", "--chains", "137"])).toThrow("--chains accepts only");
    expect(() => parseCommandLine(["gate", "--concurrency", "0"])).toThrow("--concurrency must be a positive integer");
    expect(() => parseCommandLine(["deploy"])).toThrow(USAGE);
    expect(() => parseCommandLine([])).toThrow(USAGE);
  });
});
