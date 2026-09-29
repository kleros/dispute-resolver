import { act } from "react-dom/test-utils";
import { fetchDataFromScript, DYNAMIC_SCRIPT_TIMEOUT_MS } from "./utils";

//The sandboxed iframe is replaced by a stub that keeps the body it was given, so a test can answer as the script would.
//The implementation is set before each test because the jest config resets mocks between tests.
jest.mock("iframe", () => jest.fn());
const iframe = require("iframe");
const mockFrames = [];

const PARAMETERS = { arbitrableChainID: "100", arbitrableContractAddress: "0x0000000000000000000000000000000000000abc", disputeID: "1" };

const requestIdOf = frame => frame.options.body.match(/scriptRequestId = "([^"]+)"/)[1];
//An answer as the script in the frame would post it: from the frame's own window, with the request's id.
const post = (frame, data, source = frame.iframe.contentWindow) =>
  act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data, source }));
  });
const answer = (frame, message) => post(frame, { target: "script", id: requestIdOf(frame), ...message });
const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

//A stub frame is attached to the document, so its window exists and can be the source of the answers.
const stubFrame = options => {
  const element = document.createElement("iframe");
  document.body.appendChild(element);
  const frame = { options, iframe: element, remove: jest.fn(() => element.remove()) };
  mockFrames.push(frame);
  return frame;
};

beforeEach(() => {
  mockFrames.length = 0;
  iframe.mockImplementation(stubFrame);
});

afterEach(() => {
  document.querySelectorAll("iframe").forEach(element => element.remove());
});

describe("fetchDataFromScript", () => {
  it("resolves with the result the script posts and removes the iframe", async () => {
    const pending = fetchDataFromScript("function getMetaEvidence() { resolveScript({ title: 'x' }) }", PARAMETERS);
    await settle();
    expect(mockFrames).toHaveLength(1);
    expect(mockFrames[0].iframe.style.display).toBe("none");
    expect(mockFrames[0].options.sandboxAttributes).toEqual(["allow-scripts", undefined]);

    await answer(mockFrames[0], { result: { title: "x" } });

    await expect(pending).resolves.toEqual({ title: "x" });
    expect(mockFrames[0].remove).toHaveBeenCalledTimes(1);
  });

  it("wraps the script so a thrown or rejected getMetaEvidence, or a runtime error, is posted back as an error", async () => {
    const pending = fetchDataFromScript("throw new Error('boom')", PARAMETERS);
    await settle();
    const body = mockFrames[0].options.body;
    expect(body).toContain("returnPromise.then(result => answer({ result }), error => answer({ error: describe(error) }))");
    expect(body).toContain("window.onerror = (message) => { answer({ error: String(message) }); return true }");
    expect(body).toMatch(/try \{\s*throw new Error\('boom'\)\s*getMetaEvidence\(\)\s*\} catch \(error\) \{\s*rejectScript\(error\)\s*\}/);

    const rejection = expect(pending).rejects.toThrow("The dynamic script failed: boom");
    await answer(mockFrames[0], { error: "boom" });
    await rejection;
    expect(mockFrames[0].remove).toHaveBeenCalledTimes(1);
  });

  it("rejects when the script has not answered within the time limit", async () => {
    expect(DYNAMIC_SCRIPT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    const pending = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 50 });
    await settle();

    await expect(pending).rejects.toThrow("The dynamic script did not answer within 50 ms.");
    expect(mockFrames[0].remove).toHaveBeenCalledTimes(1);
  });

  it("rejects with an AbortError when the signal aborts, and ignores a later answer", async () => {
    const controller = new AbortController();
    const pending = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { signal: controller.signal });
    await settle();

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mockFrames[0].remove).toHaveBeenCalledTimes(1);

    await answer(mockFrames[0], { result: "late" });
    expect(mockFrames[0].remove).toHaveBeenCalledTimes(1);
  });

  it("rejects at once, without an iframe, when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(mockFrames).toHaveLength(0);
  });

  it("uses an unguessable id for each request", async () => {
    const first = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 50 });
    const second = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 50 });
    await settle();
    const ids = mockFrames.map(requestIdOf);
    ids.forEach(id => expect(id).toMatch(/^[0-9a-f]{32}$/));
    expect(ids[0]).not.toBe(ids[1]);
    await expect(first).rejects.toThrow();
    await expect(second).rejects.toThrow();
  });

  it("ignores a forged message from another source, even with the right id", async () => {
    const pending = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 500 });
    await settle();
    const forged = { target: "script", id: requestIdOf(mockFrames[0]), result: "forged" };
    const otherFrame = document.createElement("iframe");
    document.body.appendChild(otherFrame);

    await post(mockFrames[0], forged, null);
    await post(mockFrames[0], forged, window);
    await post(mockFrames[0], forged, otherFrame.contentWindow);
    expect(mockFrames[0].remove).not.toHaveBeenCalled();

    await answer(mockFrames[0], { result: "genuine" });
    await expect(pending).resolves.toBe("genuine");
  });

  it("still settles when the iframe was already removed and its removal throws", async () => {
    const pending = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS);
    await settle();
    const frame = mockFrames[0];
    const source = frame.iframe.contentWindow;
    frame.remove.mockImplementation(() => {
      throw new Error("The node to be removed is not a child of this node.");
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});

    await post(frame, { target: "script", id: requestIdOf(frame), result: "done" }, source);
    await expect(pending).resolves.toBe("done");
    expect(frame.remove).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("could not be removed"), expect.any(Error));
  });

  it("rejects and removes its listener when the iframe cannot be created", async () => {
    iframe.mockImplementation(() => {
      throw new Error("blob: not allowed");
    });
    const added = jest.spyOn(window, "addEventListener");
    const removed = jest.spyOn(window, "removeEventListener");

    await expect(fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS)).rejects.toThrow("The dynamic script could not be started: blob: not allowed");

    const listener = added.mock.calls.find(([type]) => type === "message")[1];
    expect(removed).toHaveBeenCalledWith("message", listener);
    added.mockRestore();
    removed.mockRestore();
  });

  it("settles only on the answer of its own request", async () => {
    const first = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 500 });
    const second = fetchDataFromScript("function getMetaEvidence() {}", PARAMETERS, { timeoutMs: 500 });
    await settle();
    expect(requestIdOf(mockFrames[0])).not.toBe(requestIdOf(mockFrames[1]));

    await post(mockFrames[0], { target: "other", id: requestIdOf(mockFrames[0]), result: "no" });
    await post(mockFrames[0], null);
    await post(mockFrames[0], { target: "script", id: requestIdOf(mockFrames[1]), result: "wrong frame" });
    await answer(mockFrames[1], { result: "second" });
    await expect(second).resolves.toBe("second");
    expect(mockFrames[0].remove).not.toHaveBeenCalled();

    await answer(mockFrames[0], { result: "first" });
    await expect(first).resolves.toBe("first");
  });

  it("gives the whitelisted arbitrables the same origin", async () => {
    const whitelist = require("ethereum/arbitrableWhitelist").default;
    const [chainId, addresses] = Object.entries(whitelist).find(([, list]) => list.length > 0);
    const pending = fetchDataFromScript("function getMetaEvidence() {}", { arbitrableChainID: chainId, arbitrableContractAddress: addresses[0].toUpperCase() }, { timeoutMs: 50 });
    await settle();
    expect(mockFrames[0].options.sandboxAttributes).toEqual(["allow-scripts", "allow-same-origin"]);
    await expect(pending).rejects.toThrow();
  });
});
