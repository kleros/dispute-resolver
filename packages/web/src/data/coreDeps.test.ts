import type { ScriptRunRequest, WriteCall } from "@dispute-resolver/core";
import { parseAbi } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { SAMPLE_PARAMS, createFakeRunnerDocument, type FakeRunnerDocument, type FakeRunnerFrame } from "../test/runner";
import { createCoreDeps } from "./coreDeps";

const CONFIG = buildAppConfig({ REACT_APP_WEB3_PROVIDER_URL: "https://read.rpc.test/mainnet" }, { host: "resolve.kleros.io", origin: "https://resolve.kleros.io" });

// Aborted after each test so that the runs a test leaves pending release their frames, ports and timers.
let leftovers = new AbortController();

function scriptRun(disputeId: number): ScriptRunRequest {
  return { scriptText: "function getMetaEvidence() {}", params: { ...SAMPLE_PARAMS, disputeID: String(disputeId) }, kind: "standard", timeoutMs: 60_000, signal: leftovers.signal };
}

function frameAt(fake: FakeRunnerDocument, index: number): FakeRunnerFrame {
  const frame = fake.frames[index];
  if (frame === undefined) throw new Error(`The runner created no frame ${String(index)}.`);
  return frame;
}

beforeEach(() => {
  leftovers = new AbortController();
});

afterEach(() => {
  leftovers.abort();
  document.body.replaceChildren();
});

describe("createCoreDeps", () => {
  it("never passes the check of a write on a chain without a read RPC, and makes no request for it", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const deps = createCoreDeps(CONFIG, { document, fetch, storage: undefined });
    const call: WriteCall = {
      kind: "fund-appeal",
      chainId: 100,
      address: "0x00000000000000000000000000000000000000aa",
      abi: parseAbi(["function fundAppeal(uint256 localId, uint256 ruling) payable"]),
      functionName: "fundAppeal",
      args: [7n, 1n],
      value: 1n,
    };
    await expect(deps.simulate(call, "0x00000000000000000000000000000000000000a1")).resolves.toMatchObject({ status: "unavailable", error: { code: "no-rpc" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps at most four script frames at a time and starts a queued run when one settles", async () => {
    const fake = createFakeRunnerDocument();
    const deps = createCoreDeps(CONFIG, { document: fake.document, fetch: vi.fn<typeof fetch>(), storage: undefined });

    const runs = [1, 2, 3, 4, 5, 6].map((disputeId) => deps.runner.run(scriptRun(disputeId)));
    expect(fake.frames).toHaveLength(4);
    expect(fake.attachedFrames()).toHaveLength(4);

    frameAt(fake, 0)
      .load()
      .reply({ type: "dr-runner/result", value: { title: "1" }, jsonDuplicateKeys: false });
    await expect(runs[0]).resolves.toMatchObject({ status: "ok", value: { title: "1" } });
    expect(fake.frames).toHaveLength(5);
    expect(fake.attachedFrames()).toHaveLength(4);
    expect(frameAt(fake, 4).load().message).toMatchObject({ params: { disputeID: "5" } });
  });
});
