import { describe, expect, it } from "vitest";
import { ACCEPTED, FAKE_APP_ORIGIN, SAMPLE_PARAMS, SAMPLE_REDIRECTS, createFakeRunnerEnvironment, runRequest, settleMacrotasks, type ScriptApi } from "../../test/runner";
import type { RunnerMessageEvent } from "../types";
import { bootstrapRunner } from "./bootstrap";

type OnEvaluate = (source: string, api: ScriptApi) => void;

/** A fake script that defines `getMetaEvidence` to run `body`. */
function entryPoint(body: (api: ScriptApi) => void): OnEvaluate {
  return (source, api) => {
    if (source === "script")
      api.globals.getMetaEvidence = () => {
        body(api);
      };
  };
}

/** A fake script whose `getMetaEvidence` resolves with `value`. */
function resolvingScript(value: unknown): OnEvaluate {
  return entryPoint((api) => {
    api.resolveScript(value);
  });
}

/** A fake script whose `getMetaEvidence` rejects with `reason`. */
function rejectingScript(reason: unknown): OnEvaluate {
  return entryPoint((api) => {
    api.rejectScript(reason);
  });
}

/** Delivers `request` from the parent to a fresh runner and returns the fake once every reply is posted. */
async function repliesTo(onEvaluate?: OnEvaluate, request = runRequest()) {
  const fake = createFakeRunnerEnvironment({ onEvaluate });
  bootstrapRunner(fake.env);
  fake.deliver(fake.fromParent(request));
  await settleMacrotasks();
  return fake;
}

describe("bootstrapRunner guards", () => {
  it.each([
    ['self.origin is not "null"', { selfOrigin: FAKE_APP_ORIGIN }],
    ["a top-level window", { isTopLevel: true }],
  ])("evaluates nothing in %s", (_label, options) => {
    const fake = createFakeRunnerEnvironment(options);
    bootstrapRunner(fake.env);
    expect(fake.listenerCount()).toBe(0);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
  });

  it.each<[string, (event: RunnerMessageEvent) => RunnerMessageEvent]>([
    ["a message from a source other than window.parent", (event) => ({ ...event, source: {} })],
    ["a message with a null source", (event) => ({ ...event, source: null })],
    ["a message from another origin", (event) => ({ ...event, origin: "https://attacker.example" })],
    ['a message from the "null" origin', (event) => ({ ...event, origin: "null" })],
    ["a request with no port", (event) => ({ ...event, ports: [] })],
    ["a request with two ports", (event) => ({ ...event, ports: [...event.ports, ...event.ports] })],
  ])("ignores %s", (_label, modify) => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(modify(fake.fromParent(runRequest())));
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
  });

  it("ignores every message when the runner's own URL has an opaque origin", () => {
    const fake = createFakeRunnerEnvironment({ locationOrigin: "null" });
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "null" });
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
  });

  it("ignores a message that is not a well-formed run request, then accepts one that is", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    const malformed: unknown[] = [
      null,
      "dr-runner/run",
      { ...runRequest(), type: "dr-runner/result" },
      { ...runRequest(), version: 1 },
      { ...runRequest(), version: 3 },
      { ...runRequest(), scriptText: 42 },
      { ...runRequest(), guardSource: 1 },
      { ...runRequest(), params: { ...SAMPLE_PARAMS, arbitratorChainID: "1" } },
      { ...runRequest(), params: { ...SAMPLE_PARAMS, arbitrableChainID: 1.5 } },
      { ...runRequest(), params: { ...SAMPLE_PARAMS, disputeID: 1650 } },
      { ...runRequest(), params: { ...SAMPLE_PARAMS, arbitrableContractAddress: "0x2018038203AEE8E7A29DABD73771B0355D4F85AD" } },
      { ...runRequest(), params: { ...SAMPLE_PARAMS, arbitratorJsonRpcUrl: 1 } },
      { ...runRequest(), rpcRedirects: "mainnet.infura.io" },
      { ...runRequest(), rpcRedirects: [{ chainId: 1, host: "mainnet.infura.io", pathPrefix: "/v3/" }] },
    ];
    for (const data of malformed) fake.deliver(fake.fromParent(data));
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual(["script"]);
  });

  it("accepts one request per frame and ignores every later one", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ scriptText: "first" })));
    fake.deliver(fake.fromParent(runRequest({ scriptText: "second" })));
    expect(fake.evaluated).toEqual(["first"]);
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("bootstrapRunner acknowledgement", () => {
  it("posts the acknowledgement on the request's port before the guard or the script is evaluated", async () => {
    const seenAtFirstEvaluation: unknown[][] = [];
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (source, api) => {
        if (seenAtFirstEvaluation.length === 0) seenAtFirstEvaluation.push([...fake.replies]);
        if (source === "script")
          api.globals.getMetaEvidence = () => {
            api.resolveScript({ title: "after" });
          };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ guardSource: "guard" })));
    expect(fake.evaluated).toEqual(["guard", "script"]);
    expect(seenAtFirstEvaluation).toEqual([[ACCEPTED]]);
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { title: "after" }, jsonDuplicateKeys: false }]);
  });

  it('the acknowledgement is exactly { type: "dr-runner/accepted" } with no other field', () => {
    const fake = createFakeRunnerEnvironment({ onEvaluate: resolvingScript({}) });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.replies[0]).toStrictEqual({ type: "dr-runner/accepted" });
  });
});

describe("bootstrapRunner script-facing globals", () => {
  it("defines a frozen copy of scriptParameters and the two callbacks as fixed globals", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));

    expect(fake.globals.scriptParameters).toEqual(SAMPLE_PARAMS);
    expect(fake.globals.scriptParameters).not.toBe(SAMPLE_PARAMS);
    expect(Object.isFrozen(fake.globals.scriptParameters)).toBe(true);
    for (const name of ["scriptParameters", "resolveScript", "rejectScript"]) {
      expect(Object.getOwnPropertyDescriptor(fake.globals, name)).toMatchObject({ writable: false, configurable: false });
    }
    expect(typeof fake.globals.resolveScript).toBe("function");
    expect(typeof fake.globals.rejectScript).toBe("function");
  });

  it("defines the globals before evaluating the script, which reads them at top level", async () => {
    const fake = await repliesTo((_source, api) => {
      const params = api.globals.scriptParameters as { disputeID: string };
      api.globals.getMetaEvidence = () => {
        api.resolveScript({ seen: params.disputeID });
      };
    });
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { seen: "1650" }, jsonDuplicateKeys: false }]);
  });
});

describe("bootstrapRunner run and reply", () => {
  it("reports the duplicate keys the guard recorded", async () => {
    const script = entryPoint((api) => {
      api.globals.__klerosJsonDuplicateKeys = true;
      api.resolveScript({});
    });
    const fake = await repliesTo(script, runRequest({ guardSource: "guard" }));
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: {}, jsonDuplicateKeys: true }]);
  });

  it.each<[string, OnEvaluate | undefined, string]>([
    [
      "reports a synchronous script failure after the acknowledgement",
      () => {
        throw new SyntaxError("Unexpected token");
      },
      "Unexpected token",
    ],
    [
      "posts an error when getMetaEvidence throws synchronously",
      entryPoint(() => {
        throw new Error("boom");
      }),
      "boom",
    ],
    ["posts an error for a script without getMetaEvidence", undefined, "getMetaEvidence is not defined"],
    ["posts an error when the script calls rejectScript", rejectingScript(new Error("question not found")), "question not found"],
    ["still posts an error for a rejection reason that is not an Error", rejectingScript({ code: 42 }), "The script reported a failure."],
    [
      "posts an error when a promise given to resolveScript rejects",
      entryPoint((api) => {
        api.resolveScript(Promise.reject(new Error("rpc down")));
      }),
      "rpc down",
    ],
    [
      "posts an error instead of a value that cannot be structured-cloned",
      resolvingScript({ title: "x", render: () => "not cloneable" }),
      "The script's result cannot be copied out of the runner.",
    ],
  ])("%s", async (_label, onEvaluate, message) => {
    const fake = await repliesTo(onEvaluate);
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message }]);
  });

  it("posts only the first resolve or reject after the acknowledgement", async () => {
    const fake = await repliesTo(
      entryPoint((api) => {
        // The pinned Reality renderers resolve in a switch without breaks, so later cases call resolveScript again.
        api.resolveScript({ rulingOptions: { type: "single-select" } });
        api.resolveScript({ rulingOptions: { type: "uint" } });
        api.rejectScript(new Error("late"));
        throw new Error("later still");
      }),
    );
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { rulingOptions: { type: "single-select" } }, jsonDuplicateKeys: false }]);
  });

  it("resolveScript adopts a promise", async () => {
    const fake = await repliesTo(resolvingScript(Promise.resolve({ title: "adopted" })));
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { title: "adopted" }, jsonDuplicateKeys: false }]);
  });

  it("does not report asynchronous errors after the acknowledgement, leaving the host's timeout to settle the run", async () => {
    const fake = await repliesTo((_source, api) => {
      api.globals.getMetaEvidence = () => {
        const later = Promise.reject(new Error("thrown later"));
        later.catch(() => undefined);
        return later;
      };
    });
    expect(fake.replies).toEqual([ACCEPTED]);
  });

  it("installs the RPC redirect before the script is evaluated", async () => {
    let topLevelRequest: Promise<Response> | undefined;
    const fake = createFakeRunnerEnvironment({
      onEvaluate: () => {
        topLevelRequest = fake.fetch("https://mainnet.infura.io/v3/deadbeefdeadbeefdeadbeefdeadbeef");
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ rpcRedirects: SAMPLE_REDIRECTS })));
    await topLevelRequest;
    expect(fake.requests).toEqual([{ via: "fetch", input: "https://rpc.example/mainnet", rest: [] }]);
  });
});
