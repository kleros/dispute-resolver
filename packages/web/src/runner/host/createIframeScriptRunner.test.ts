import { JSON_DUPLICATE_KEY_GUARD, type ScriptParameters, type ScriptRunRequest } from "@dispute-resolver/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PARAMS, SAMPLE_REDIRECTS, createFakeRunnerDocument, settleMacrotasks, type FakeRunnerDocument, type FakeRunnerFrame } from "../../test/runner";
import { RUNNER_PATH } from "../protocol";
import { createIframeScriptRunner } from "./createIframeScriptRunner";

function setup(maxConcurrent = 4) {
  const fake = createFakeRunnerDocument();
  const runner = createIframeScriptRunner({ document: fake.document, runnerUrl: RUNNER_PATH, maxConcurrent, rpcRedirects: SAMPLE_REDIRECTS });
  return { fake, runner };
}

async function isPending(run: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void run.then(() => {
    settled = true;
  });
  await settleMacrotasks();
  return !settled;
}

function frameAt(fake: FakeRunnerDocument, index: number): FakeRunnerFrame {
  const frame = fake.frames[index];
  if (frame === undefined) throw new Error(`The host created no frame ${String(index)}.`);
  return frame;
}

// Aborted after each test so that runs a test leaves pending release their frames, ports and timers.
let leftovers = new AbortController();

function request(overrides: Partial<ScriptRunRequest> = {}): ScriptRunRequest {
  return { scriptText: "function getMetaEvidence() {}", params: SAMPLE_PARAMS, kind: "standard", timeoutMs: 60_000, signal: leftovers.signal, ...overrides };
}

/** Parameters as an untrusted caller could pass them at runtime, whatever their static type says. */
function withParams(overrides: Record<string, unknown>): ScriptRunRequest {
  const params: unknown = { ...SAMPLE_PARAMS, ...overrides };
  return request({ params: params as ScriptParameters });
}

beforeEach(() => {
  leftovers = new AbortController();
});

afterEach(() => {
  leftovers.abort();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("parameter validation", () => {
  it.each([
    ["a disputeID carrying markup", { disputeID: "1</script><script>alert(1)</script>" }],
    ["a disputeID with a leading zero", { disputeID: "01" }],
    ["a non-ASCII-digit disputeID", { disputeID: "١٢" }],
    ["a chain ID carrying markup", { arbitratorChainID: "1</script>" }],
    ["a chain ID given as a string", { arbitrableChainID: "1" }],
    ["a chain ID with a leading zero", { arbitratorChainID: "01" }],
    ["a non-integer chain ID", { arbitratorChainID: 1.5 }],
    ["an unconfigured chain ID", { arbitrableChainID: 10 }],
    ["a checksummed address", { arbitrableContractAddress: "0x2018038203AEE8E7A29DABD73771B0355D4F85AD" }],
    ["an address carrying markup", { arbitrableContractAddress: "0x</script>" }],
    ["a plain-http RPC URL", { arbitratorJsonRpcUrl: "http://rpc.example/mainnet" }],
    ["a javascript: RPC URL", { arbitrableJsonRpcUrl: "javascript:alert(1)" }],
    ["a relative RPC URL", { arbitratorJsonRpcUrl: "/rpc" }],
  ])("refuses %s without creating a frame", async (_label, overrides) => {
    const { fake, runner } = setup();
    await expect(runner.run(withParams(overrides))).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
    expect(fake.frames).toEqual([]);
  });

  it("refuses a script text that is not a string", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ scriptText: 42 as unknown as string }))).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
    expect(fake.frames).toEqual([]);
  });

  it("accepts null RPC URLs and other configured chains", async () => {
    const { fake, runner } = setup();
    const run = runner.run(withParams({ arbitrableChainID: 100, arbitratorJsonRpcUrl: null, arbitrableJsonRpcUrl: null }));
    frameAt(fake, 0).load().reply({ type: "dr-runner/result", value: {}, jsonDuplicateKeys: false });
    await expect(run).resolves.toEqual({ status: "ok", value: {}, jsonDuplicateKeys: false });
  });

  it("posts only the six script parameters, never extra fields", () => {
    const { fake, runner } = setup();
    void runner.run(withParams({ jsonRpcUrl: "https://rpc.example/extra" }));
    const posted = frameAt(fake, 0).load().message as { params: Record<string, unknown> };
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(posted.params).sort(byName)).toEqual(Object.keys(SAMPLE_PARAMS).sort(byName));
  });
});

describe("runner frame", () => {
  it("sets the sandbox before the source", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const order = frameAt(fake, 0).attributeOrder();
    expect(order.filter((name) => name === "sandbox" || name === "src")).toEqual(["sandbox", "src"]);
  });

  it("sandboxes the frame with allow-scripts only, hidden and without a referrer", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const frame = frameAt(fake, 0).element;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.getAttribute("tabindex")).toBe("-1");
    expect(frame.style.display).toBe("none");
    expect(frame.getAttribute("src")).toBe(RUNNER_PATH);
    expect(frame.isConnected).toBe(true);
  });

  it("posts nothing before the frame loads, then one request with target '*' and one fresh port", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const frame = frameAt(fake, 0);
    expect(frame.watchPosts()).toEqual([]);
    const posted = frame.load();
    expect(posted.targetOrigin).toBe("*");
    expect(posted.ports).toHaveLength(1);
    expect(posted.message).toEqual({
      type: "dr-runner/run",
      version: 2,
      scriptText: "function getMetaEvidence() {}",
      params: SAMPLE_PARAMS,
      guardSource: null,
      rpcRedirects: SAMPLE_REDIRECTS,
    });
  });

  it("sends core's duplicate-key guard for a Reality script", () => {
    const { fake, runner } = setup();
    void runner.run(request({ kind: "reality" }));
    expect(frameAt(fake, 0).load().message).toMatchObject({ guardSource: JSON_DUPLICATE_KEY_GUARD });
  });

  it("gives every run its own frame and its own port", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    void runner.run(request());
    const first = frameAt(fake, 0);
    const second = frameAt(fake, 1);
    const [firstPort] = first.load().ports;
    const [secondPort] = second.load().ports;
    expect(first.element).not.toBe(second.element);
    expect(firstPort).toBeDefined();
    expect(firstPort).not.toBe(secondPort);
  });
});

describe("results", () => {
  it("settles ok with the value and duplicate-key flag the port carried", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request({ kind: "reality" }));
    frameAt(fake, 0)
      .load()
      .reply({ type: "dr-runner/result", value: { rulingOptions: { titles: ["Harris", "Trump"] } }, jsonDuplicateKeys: true });
    await expect(run).resolves.toEqual({ status: "ok", value: { rulingOptions: { titles: ["Harris", "Trump"] } }, jsonDuplicateKeys: true });
  });

  it("settles script-error when the script failed", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    frameAt(fake, 0).load().reply({ type: "dr-runner/error", message: "question not found" });
    await expect(run).resolves.toEqual({ status: "failed", reason: "script-error", message: "The dynamic script failed: question not found" });
  });

  it.each([
    ["a reply of an unknown type", { type: "dr-runner/other" }],
    ["a result without its flag", { type: "dr-runner/result", value: {} }],
    ["an error without a message", { type: "dr-runner/error" }],
    ["a bare value", "{}"],
  ])("settles runner-error for %s", async (_label, reply) => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    frameAt(fake, 0).load().reply(reply);
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
  });

  it("ignores a message posted to the window by another frame", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const { fake, runner } = setup();
    const run = runner.run(request());
    const posted = frameAt(fake, 0).load();

    const forged = { type: "dr-runner/result", value: { title: "forged" }, jsonDuplicateKeys: false };
    window.dispatchEvent(new MessageEvent("message", { data: forged, origin: "https://attacker.example" }));
    window.postMessage(forged, location.origin);
    await settleMacrotasks();

    posted.reply({ type: "dr-runner/result", value: { title: "genuine" }, jsonDuplicateKeys: false });
    await expect(run).resolves.toEqual({ status: "ok", value: { title: "genuine" }, jsonDuplicateKeys: false });
    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain("message");
  });

  it("removes the frame once the run settles and ignores later replies", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    const posted = frameAt(fake, 0).load();
    posted.reply({ type: "dr-runner/result", value: { title: "first" }, jsonDuplicateKeys: false });
    await expect(run).resolves.toMatchObject({ status: "ok", value: { title: "first" } });
    expect(fake.attachedFrames()).toEqual([]);

    posted.reply({ type: "dr-runner/error", message: "late" });
    await settleMacrotasks();
    await expect(run).resolves.toMatchObject({ status: "ok", value: { title: "first" } });
  });
});

describe("timeout and abort", () => {
  it("times out a run that never answers and removes its frame", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fake, runner } = setup();
    const run = runner.run(request({ timeoutMs: 1_000 }));
    frameAt(fake, 0).load();
    vi.advanceTimersByTime(999);
    expect(fake.attachedFrames()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await expect(run).resolves.toEqual({ status: "failed", reason: "timeout", message: "The dynamic script for dispute 1650 timed out." });
    expect(fake.attachedFrames()).toEqual([]);
  });

  it("times out a run with no budget left without creating a frame", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ timeoutMs: 0 }))).resolves.toMatchObject({ status: "failed", reason: "timeout" });
    await expect(runner.run(request({ timeoutMs: -5 }))).resolves.toMatchObject({ status: "failed", reason: "timeout" });
    expect(fake.frames).toEqual([]);
  });

  it("creates no frame for an already aborted run", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ signal: AbortSignal.abort() }))).resolves.toMatchObject({ status: "failed", reason: "aborted" });
    expect(fake.frames).toEqual([]);
  });
});

describe("acknowledgement window", () => {
  const NOT_STARTED = /did not start within 5 seconds/;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("a frame whose load never fires settles runner-error when the acknowledgement window ends, and is removed", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request({ timeoutMs: 60_000 }));
    vi.advanceTimersByTime(4_999);
    expect(await isPending(run)).toBe(true);
    expect(fake.attachedFrames()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await expect(run).resolves.toEqual({ status: "failed", reason: "runner-error", message: expect.stringMatching(NOT_STARTED) as unknown });
    expect(fake.attachedFrames()).toEqual([]);
  });

  it("a frame that loads but never acknowledges settles runner-error at the window", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    frameAt(fake, 0).load();
    vi.advanceTimersByTime(5_000);
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "runner-error", message: expect.stringMatching(NOT_STARTED) as unknown });
    expect(fake.attachedFrames()).toEqual([]);
  });

  it("the acknowledgement cancels the window and the run then waits for its result until its timeout", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request({ timeoutMs: 60_000 }));
    vi.advanceTimersByTime(4_900);
    frameAt(fake, 0).load().acknowledge();
    await settleMacrotasks();
    vi.advanceTimersByTime(200);
    expect(await isPending(run)).toBe(true);
    expect(fake.attachedFrames()).toHaveLength(1);
    vi.advanceTimersByTime(60_000 - 5_100);
    await expect(run).resolves.toEqual({ status: "failed", reason: "timeout", message: "The dynamic script for dispute 1650 timed out." });
    expect(fake.attachedFrames()).toEqual([]);
  });

  it("acknowledgements never settle the run, carry nothing through, and a second one is ignored", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    const posted = frameAt(fake, 0).load();
    posted.reply({ type: "dr-runner/accepted", value: { title: "smuggled" }, jsonDuplicateKeys: false });
    await settleMacrotasks();
    posted.acknowledge();
    await settleMacrotasks();
    vi.advanceTimersByTime(5_000);
    expect(await isPending(run)).toBe(true);
    posted.reply({ type: "dr-runner/result", value: { title: "genuine" }, jsonDuplicateKeys: false });
    await expect(run).resolves.toEqual({ status: "ok", value: { title: "genuine" }, jsonDuplicateKeys: false });
  });

  it("aborting during the acknowledgement window settles aborted and clears both timers", async () => {
    const { fake, runner } = setup();
    const controller = new AbortController();
    const run = runner.run(request({ signal: controller.signal }));
    frameAt(fake, 0).load();
    vi.advanceTimersByTime(2_000);
    controller.abort();
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "aborted" });
    expect(fake.attachedFrames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3_000);
    vi.advanceTimersByTime(60_000);
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "aborted" });
  });

  it("the acknowledgement window counts from the frame's append, not from run()", async () => {
    const { fake, runner } = setup(1);
    const controller = new AbortController();
    const first = runner.run(request({ signal: controller.signal }));
    const queued = runner.run(request());
    frameAt(fake, 0).load().acknowledge();
    await settleMacrotasks();
    vi.advanceTimersByTime(6_000);
    expect(fake.frames).toHaveLength(1);
    controller.abort();
    await expect(first).resolves.toMatchObject({ status: "failed", reason: "aborted" });
    expect(fake.attachedFrames()).toHaveLength(1);
    expect(fake.frames).toHaveLength(2);

    vi.advanceTimersByTime(4_999);
    expect(await isPending(queued)).toBe(true);
    vi.advanceTimersByTime(1);
    await expect(queued).resolves.toMatchObject({ status: "failed", reason: "runner-error", message: expect.stringMatching(NOT_STARTED) as unknown });
    expect(fake.attachedFrames()).toEqual([]);
  });
});

describe("concurrency", () => {
  it("counts time spent queued against the run's timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fake, runner } = setup(1);
    const first = runner.run(request({ timeoutMs: 10_000 }));
    const queued = runner.run(request({ timeoutMs: 1_000 }));
    vi.advanceTimersByTime(1_000);
    await expect(queued).resolves.toMatchObject({ status: "failed", reason: "timeout" });
    expect(fake.frames).toHaveLength(1);

    frameAt(fake, 0).load().reply({ type: "dr-runner/result", value: {}, jsonDuplicateKeys: false });
    await expect(first).resolves.toMatchObject({ status: "ok" });
    expect(fake.frames).toHaveLength(1);
  });

  it("aborting a queued run settles it without a frame and keeps the queue moving", async () => {
    const { fake, runner } = setup(1);
    const controller = new AbortController();
    const first = runner.run(request());
    const aborted = runner.run(request({ signal: controller.signal }));
    const third = runner.run(request({ params: { ...SAMPLE_PARAMS, disputeID: "3" } }));
    controller.abort();
    await expect(aborted).resolves.toMatchObject({ status: "failed", reason: "aborted" });

    frameAt(fake, 0).load().reply({ type: "dr-runner/result", value: {}, jsonDuplicateKeys: false });
    await expect(first).resolves.toMatchObject({ status: "ok" });
    expect(fake.frames).toHaveLength(2);
    const thirdPost = frameAt(fake, 1).load();
    expect(thirdPost.message).toMatchObject({ params: { disputeID: "3" } });
    thirdPost.reply({ type: "dr-runner/result", value: { title: "3" }, jsonDuplicateKeys: false });
    await expect(third).resolves.toMatchObject({ status: "ok", value: { title: "3" } });
  });

  it("refuses a concurrency cap that is not a positive integer", () => {
    const fake = createFakeRunnerDocument();
    expect(() => createIframeScriptRunner({ document: fake.document, runnerUrl: RUNNER_PATH, maxConcurrent: 0, rpcRedirects: [] })).toThrow(RangeError);
  });
});

describe("frame failures", () => {
  it("a run whose frame cannot be opened fails without rejecting and frees its slot", async () => {
    const brokenDocument = {
      body: document.body,
      createElement() {
        throw new Error("no DOM");
      },
    };
    const runner = createIframeScriptRunner({ document: brokenDocument as unknown as Document, runnerUrl: RUNNER_PATH, maxConcurrent: 1, rpcRedirects: [] });
    const first = runner.run(request());
    const second = runner.run(request());
    await expect(first).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
    await expect(second).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
  });

  it("keeps frames in one hidden container and recreates it if the page removed it", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const firstContainer = frameAt(fake, 0).element.parentElement;
    expect(firstContainer?.hidden).toBe(true);
    expect(firstContainer?.parentElement).toBe(document.body);

    document.body.replaceChildren();
    void runner.run(request());
    const secondContainer = frameAt(fake, 1).element.parentElement;
    expect(secondContainer).not.toBe(firstContainer);
    expect(secondContainer?.hidden).toBe(true);
    expect(secondContainer?.isConnected).toBe(true);
  });
});
