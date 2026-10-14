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

describe("parameter validation (B5)", () => {
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
  ])("B5: refuses %s without creating a frame", async (_label, overrides) => {
    const { fake, runner } = setup();
    await expect(runner.run(withParams(overrides))).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
    expect(fake.frames).toEqual([]);
  });

  it("B5: refuses a script text that is not a string", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ scriptText: 42 as unknown as string }))).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
    expect(fake.frames).toEqual([]);
  });

  it("B5: accepts null RPC URLs and other configured chains", async () => {
    const { fake, runner } = setup();
    const run = runner.run(withParams({ arbitrableChainID: 100, arbitratorJsonRpcUrl: null, arbitrableJsonRpcUrl: null }));
    frameAt(fake, 0).load().reply({ type: "dr-runner/result", value: {}, jsonDuplicateKeys: false });
    await expect(run).resolves.toEqual({ status: "ok", value: {}, jsonDuplicateKeys: false });
  });

  it("B5: posts only the six parameters, never extra fields", () => {
    const { fake, runner } = setup();
    void runner.run(withParams({ jsonRpcUrl: "https://rpc.example/extra" }));
    const posted = frameAt(fake, 0).load().message as { params: Record<string, unknown> };
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(posted.params).sort(byName)).toEqual(Object.keys(SAMPLE_PARAMS).sort(byName));
  });
});

describe("runner frame (C4, ARCHITECTURE.md §7.3)", () => {
  it("C4: sets the sandbox before the source", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const order = frameAt(fake, 0).attributeOrder();
    expect(order).toContain("sandbox");
    expect(order).toContain("src");
    expect(order.findIndex((name) => name === "sandbox")).toBeLessThan(order.findIndex((name) => name === "src"));
  });

  it("C4: sandboxes the frame with allow-scripts only, hidden and without a referrer", () => {
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

  it("C4: posts nothing before the frame loads, then one request with target '*' and one fresh port", () => {
    const { fake, runner } = setup();
    void runner.run(request());
    const frame = frameAt(fake, 0);
    expect(frame.watchPosts()).toEqual([]);
    const posted = frame.load();
    expect(posted.targetOrigin).toBe("*");
    expect(posted.ports).toHaveLength(1);
    expect(posted.message).toEqual({
      type: "dr-runner/run",
      version: 1,
      scriptText: "function getMetaEvidence() {}",
      params: SAMPLE_PARAMS,
      guardSource: null,
      rpcRedirects: SAMPLE_REDIRECTS,
    });
  });

  it("A4: sends core's duplicate-key guard for a Reality script", () => {
    const { fake, runner } = setup();
    void runner.run(request({ kind: "reality" }));
    expect(frameAt(fake, 0).load().message).toMatchObject({ guardSource: JSON_DUPLICATE_KEY_GUARD });
  });

  it("B8: gives every run its own frame and its own port", () => {
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

describe("results (B1, B8, D-05)", () => {
  it("B1: settles ok with the value and duplicate-key flag the port carried", async () => {
    const { fake, runner } = setup();
    const run = runner.run(request({ kind: "reality" }));
    frameAt(fake, 0)
      .load()
      .reply({ type: "dr-runner/result", value: { rulingOptions: { titles: ["Harris", "Trump"] } }, jsonDuplicateKeys: true });
    await expect(run).resolves.toEqual({ status: "ok", value: { rulingOptions: { titles: ["Harris", "Trump"] } }, jsonDuplicateKeys: true });
  });

  it("B1: settles script-error when the script failed", async () => {
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
  ])("B1: settles runner-error for %s", async (_label, reply) => {
    const { fake, runner } = setup();
    const run = runner.run(request());
    frameAt(fake, 0).load().reply(reply);
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "runner-error" });
  });

  it("B1, D-05: a message posted to the window by another frame is ignored", async () => {
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

  it("B8: two concurrent runs resolve to their own results", async () => {
    const { fake, runner } = setup();
    const first = runner.run(request({ params: { ...SAMPLE_PARAMS, disputeID: "1" } }));
    const second = runner.run(request({ params: { ...SAMPLE_PARAMS, disputeID: "2" } }));
    const firstPost = frameAt(fake, 0).load();
    const secondPost = frameAt(fake, 1).load();

    secondPost.reply({ type: "dr-runner/result", value: { title: "dispute 2" }, jsonDuplicateKeys: false });
    firstPost.reply({ type: "dr-runner/result", value: { title: "dispute 1" }, jsonDuplicateKeys: false });

    await expect(first).resolves.toEqual({ status: "ok", value: { title: "dispute 1" }, jsonDuplicateKeys: false });
    await expect(second).resolves.toEqual({ status: "ok", value: { title: "dispute 2" }, jsonDuplicateKeys: false });
  });

  it("B8: removes the frame once the run settles and ignores later replies", async () => {
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

describe("timeout and abort (B8, D-38)", () => {
  it("B8: a run that never answers times out and its frame is removed", async () => {
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

  it("D-38: a run with no budget left times out without a frame", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ timeoutMs: 0 }))).resolves.toMatchObject({ status: "failed", reason: "timeout" });
    await expect(runner.run(request({ timeoutMs: -5 }))).resolves.toMatchObject({ status: "failed", reason: "timeout" });
    expect(fake.frames).toEqual([]);
  });

  it("B8: aborting a running script removes its frame", async () => {
    const { fake, runner } = setup();
    const controller = new AbortController();
    const run = runner.run(request({ signal: controller.signal }));
    frameAt(fake, 0).load();
    controller.abort();
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "aborted" });
    expect(fake.attachedFrames()).toEqual([]);
  });

  it("B8: an already aborted run creates no frame", async () => {
    const { fake, runner } = setup();
    await expect(runner.run(request({ signal: AbortSignal.abort() }))).resolves.toMatchObject({ status: "failed", reason: "aborted" });
    expect(fake.frames).toEqual([]);
  });
});

describe("concurrency (D-29)", () => {
  it("D-29: runs at most four scripts at a time and starts the next one when a run settles", async () => {
    const { fake, runner } = setup(4);
    const runs = [1, 2, 3, 4, 5, 6].map((id) => runner.run(request({ params: { ...SAMPLE_PARAMS, disputeID: String(id) } })));
    expect(fake.frames).toHaveLength(4);

    frameAt(fake, 1)
      .load()
      .reply({ type: "dr-runner/result", value: { title: "2" }, jsonDuplicateKeys: false });
    await expect(runs[1]).resolves.toMatchObject({ value: { title: "2" } });
    expect(fake.frames).toHaveLength(5);
    expect(fake.attachedFrames()).toHaveLength(4);
    expect(frameAt(fake, 4).load().message).toMatchObject({ params: { disputeID: "5" } });
  });

  it("D-38: time spent queued counts against the run's timeout", async () => {
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

  it("D-29: aborting a queued run settles it without a frame and keeps the queue moving", async () => {
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

  it("D-29: refuses a concurrency cap that is not a positive integer", () => {
    const fake = createFakeRunnerDocument();
    expect(() => createIframeScriptRunner({ document: fake.document, runnerUrl: RUNNER_PATH, maxConcurrent: 0, rpcRedirects: [] })).toThrow(RangeError);
  });
});

describe("frame failures (ARCHITECTURE.md §7.3)", () => {
  it("§7.3: a run whose frame cannot be opened fails without rejecting and frees its slot", async () => {
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

  it("§7.3: keeps frames in one hidden container and recreates it if the page removed it", () => {
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
