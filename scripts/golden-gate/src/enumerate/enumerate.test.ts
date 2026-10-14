import { describe, expect, it } from "vitest";
import type { Address } from "../../../../packages/core/src/types";
import type { CanonicalIpfsPath } from "../../../../packages/core/src/uri/types";
import type { IpfsReader } from "../ipfs";
import { checkTestnetReality, checksummed, enumerateChain, recheckFromEvents, testnetCheckComplete, type EnumerationDeps } from "./enumerate";
import type { LocatorResult } from "./locator";

const RESOLVER: Address = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const SEER_PROXY: Address = "0x2018038203aee8e7a29dabd73771b0355d4f85ad";
const DEFAULT_SCRIPT = "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const QMQGMR = "/ipfs/QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js";
const UNLISTED = "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.js";

/** Meta-evidence per dispute: its file path and its JSON text. */
const FILES: Readonly<Record<string, readonly [CanonicalIpfsPath, string]>> = {
  "0": ["/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/a.json", JSON.stringify({ title: "a", dynamicScriptURI: DEFAULT_SCRIPT, arbitrableChainID: "1" })],
  "1": ["/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/b.json", JSON.stringify({ title: "b" })],
  "2": ["/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/c.json", JSON.stringify({ title: "c", dynamicScriptURI: QMQGMR })],
  "3": ["/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/d.json", JSON.stringify({ title: "d", dynamicScriptURI: UNLISTED })],
  "4": ["/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/e.json", "not json"],
};

function deps(overrides: Partial<EnumerationDeps> = {}): EnumerationDeps {
  const ipfs: IpfsReader = {
    read: (path) => {
      const entry = Object.values(FILES).find(([file]) => file === path);
      return Promise.resolve(entry === undefined ? { ok: false, detail: "404" } : { ok: true, text: entry[1], cached: false });
    },
  };
  return {
    chainId: 1,
    blockNumber: 1_000n,
    source: "meta-evidence-api",
    count: () => Promise.resolve(7n),
    arbitrableOf: (disputeId) => Promise.resolve(disputeId === 6n ? { ok: false, detail: "rpc down" } : { ok: true, arbitrable: disputeId === 2n ? SEER_PROXY : RESOLVER }),
    locate: (disputeId): Promise<LocatorResult> => {
      const entry = FILES[disputeId.toString()];
      if (disputeId === 5n) return Promise.resolve({ status: "missing", detail: "HTTP 400" });
      return Promise.resolve(entry === undefined ? { status: "error", detail: "unreachable" } : { status: "uri", uri: entry[0] });
    },
    ipfs,
    concurrency: 3,
    onProgress: () => undefined,
    ...overrides,
  };
}

describe("C6 enumeration of the disputes that reference allowlisted scripts", () => {
  it("C6: records each dispute that runs an allowlisted script with its CID and the chain-ID fields its parameters use", async () => {
    const { references } = await enumerateChain(deps());
    expect(references).toEqual([
      {
        chainId: 1,
        disputeId: 0,
        arbitrable: RESOLVER,
        cid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
        scriptUri: DEFAULT_SCRIPT,
        metaEvidenceUri: "/ipfs/QmT2WNbSrAztgkDBoo6Z6BJ1zLYP8EetMtNRLGeQCjS1hu/a.json",
        metaEvidenceSource: "meta-evidence-api",
        chainIdFields: { arbitrableChainID: "1" },
      },
    ]);
  });

  it("C6: notes why every other dispute runs no script, including the CID a registered Reality proxy skips", async () => {
    const { chain } = await enumerateChain(deps());
    expect(chain.statusCounts).toEqual({
      runs: 1,
      "no-script": 1,
      "registered-reality-proxy": 1,
      "script-not-allowlisted": 1,
      "meta-evidence-not-json": 1,
      "meta-evidence-missing": 1,
      "read-error": 1,
    });
    expect(chain.notes.find((item) => item.disputeId === 2)).toMatchObject({ status: "registered-reality-proxy", cid: "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js" });
    expect(chain.notes.find((item) => item.disputeId === 6)).toMatchObject({ status: "read-error", detail: "rpc down" });
    expect(chain).toMatchObject({ chainId: 1, blockNumber: 1000, disputeCount: 7, source: "meta-evidence-api" });
  });

  it("C6: a dispute left unread by a transport failure is read once more after the first pass", async () => {
    const attempts = new Map<bigint, number>();
    const flaky = deps({
      count: () => Promise.resolve(1n),
      arbitrableOf: (disputeId) => {
        const attempt = (attempts.get(disputeId) ?? 0) + 1;
        attempts.set(disputeId, attempt);
        return Promise.resolve(attempt === 1 ? { ok: false, detail: "rate limited" } : { ok: true, arbitrable: RESOLVER });
      },
    });
    const { chain, references } = await enumerateChain(flaky);
    expect(chain.statusCounts).toEqual({ runs: 1 });
    expect(references).toHaveLength(1);
  });

  it("04 §5: reports a listed testnet Reality dispute that the enumeration did not find running its script", async () => {
    const { chain, references } = await enumerateChain(deps({ chainId: 11155111 }));
    const check = checkTestnetReality(
      [
        { chainId: 11155111, disputeId: 0n, arbitrable: RESOLVER },
        { chainId: 11155111, disputeId: 1n, arbitrable: RESOLVER },
        { chainId: 10200, disputeId: 4n, arbitrable: RESOLVER },
      ],
      [chain],
      references,
    );
    expect(check).toEqual({
      listed: 3,
      missing: [
        { key: "11155111:1", status: "no-script", onChain: null },
        { key: "10200:4", status: "not-enumerated", onChain: null },
      ],
    });
  });

  it("04 §5: a listed testnet Reality dispute the API misnames is read from its own events and joins the gate", async () => {
    const check = { listed: 2, missing: [{ key: "11155111:1", status: "no-script" as const, onChain: null }, { key: "10200:4", status: "not-enumerated" as const, onChain: null }] };
    const fromEvents = deps({ chainId: 11155111, source: "chain-events", locate: () => Promise.resolve({ status: "uri", uri: FILES["0"]?.[0] }) });
    const recheck = await recheckFromEvents(fromEvents, check);
    expect(recheck.references).toMatchObject([{ chainId: 11155111, disputeId: 1, metaEvidenceSource: "chain-events", cid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj" }]);
    expect(recheck.check.missing).toEqual([
      { key: "11155111:1", status: "no-script", onChain: "runs" },
      { key: "10200:4", status: "not-enumerated", onChain: null },
    ]);
    expect(testnetCheckComplete(recheck.check, true)).toBe(true);
    expect(testnetCheckComplete(recheck.check, false)).toBe(false);
  });

  it("spec 9.5: the old app saw the arbitrable checksummed, as ethers returns it", () => {
    expect(checksummed(RESOLVER)).toBe("0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf");
  });
});
