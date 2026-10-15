import { describe, expect, it } from "vitest";
import { USAGE, parseCommandLine } from "./cli";

describe("command line", () => {
  it("defaults to every arbitrator chain, the production timeouts and four disputes at once", () => {
    expect(parseCommandLine(["gate"])).toEqual({
      command: "gate",
      gate: {
        chains: [1, 100, 11155111, 10200],
        disputes: null,
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

  it("reads the disputes of a run restricted to them, and their chains", () => {
    const request = parseCommandLine(["gate", "--disputes", "1:1454, 1:1672,11155111:2,1:1454", "--reuse-enumeration"]);
    expect(request.gate).toMatchObject({
      chains: [1, 11155111],
      disputes: [
        { chainId: 1, disputeId: 1454 },
        { chainId: 1, disputeId: 1672 },
        { chainId: 11155111, disputeId: 2 },
      ],
      reuseEnumeration: true,
    });
  });

  it("refuses a malformed dispute, a dispute on a chain without an arbitrator, --disputes with --chains, and --disputes outside the gate", () => {
    expect(() => parseCommandLine(["gate", "--disputes", "1:01"])).toThrow("--disputes takes <chain>:<dispute> pairs");
    expect(() => parseCommandLine(["gate", "--disputes", "137:5"])).toThrow("--disputes takes <chain>:<dispute> pairs");
    expect(() => parseCommandLine(["gate", "--disputes", "1:5", "--chains", "1"])).toThrow("use --chains or --disputes, not both");
    expect(() => parseCommandLine(["enumerate", "--disputes", "1:5"])).toThrow("--disputes restricts the gate only");
  });

  it("refuses a chain without an arbitrator, a malformed number and an unknown command", () => {
    expect(() => parseCommandLine(["gate", "--chains", "137"])).toThrow("--chains accepts only");
    expect(() => parseCommandLine(["gate", "--concurrency", "0"])).toThrow("--concurrency must be a positive integer");
    expect(() => parseCommandLine(["deploy"])).toThrow(USAGE);
    expect(() => parseCommandLine([])).toThrow(USAGE);
  });
});
