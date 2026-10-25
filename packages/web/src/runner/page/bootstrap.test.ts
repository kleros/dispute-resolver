import { describe, expect, it } from "vitest";
import { ACCEPTED, FAKE_APP_ORIGIN, SAMPLE_PARAMS, SAMPLE_REDIRECTS, createFakeRunnerEnvironment, runRequest, settleMacrotasks, type ScriptApi } from "../../test/runner";
import type { RunnerMessageEvent } from "../types";
import { bootstrapRunner } from "./bootstrap";

/** A fake script whose `getMetaEvidence` resolves with `value`. */
function resolvingScript(value: unknown) {
  return (source: string, api: ScriptApi) => {
    if (source === "script")
      api.globals.getMetaEvidence = () => {
        api.resolveScript(value);
      };
  };
}

describe("bootstrapRunner guards", () => {
  it('evaluates nothing unless self.origin is "null"', () => {
    const fake = createFakeRunnerEnvironment({ selfOrigin: FAKE_APP_ORIGIN });
    bootstrapRunner(fake.env);
    expect(fake.listenerCount()).toBe(0);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
  });

  it("refuses to run in a top-level window", () => {
    const fake = createFakeRunnerEnvironment({ isTopLevel: true });
    bootstrapRunner(fake.env);
    expect(fake.listenerCount()).toBe(0);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
  });

  it("ignores a message whose source is not window.parent", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), source: {} });
    fake.deliver({ ...fake.fromParent(runRequest()), source: null });
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
  });

  it("ignores a message whose origin is not location.origin", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "https://attacker.example" });
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "null" });
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

  it("ignores a request that does not carry exactly one port", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    const event = fake.fromParent(runRequest());
    fake.deliver({ ...event, ports: [] });
    fake.deliver({ ...event, ports: [...event.ports, ...event.ports] });
    expect(fake.evaluated).toEqual([]);
    expect(fake.replies).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
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

  it("a refused request gets no acknowledgement, so no window learns whether a runner is alive", async () => {
    for (const options of [{ selfOrigin: FAKE_APP_ORIGIN }, { isTopLevel: true }, { locationOrigin: "null" }]) {
      const refusing = createFakeRunnerEnvironment(options);
      bootstrapRunner(refusing.env);
      refusing.deliver({ ...refusing.fromParent(runRequest()), origin: "null" });
      refusing.deliver(refusing.fromParent(runRequest()));
      expect(refusing.replies).toEqual([]);
    }

    const fake = createFakeRunnerEnvironment({ onEvaluate: resolvingScript({ title: "accepted" }) });
    bootstrapRunner(fake.env);
    const event = fake.fromParent(runRequest());
    const refused: RunnerMessageEvent[] = [
      { ...event, source: {} },
      { ...event, source: null },
      { ...event, origin: "https://attacker.example" },
      { ...event, origin: "null" },
      { ...event, ports: [] },
      { ...event, ports: [...event.ports, ...event.ports] },
      fake.fromParent(null),
      fake.fromParent({ ...runRequest(), type: "dr-runner/result" }),
      fake.fromParent({ ...runRequest(), version: 1 }),
      fake.fromParent({ ...runRequest(), version: 3 }),
      fake.fromParent({ ...runRequest(), scriptText: 42 }),
      fake.fromParent({ ...runRequest(), params: { ...SAMPLE_PARAMS, disputeID: 1650 } }),
      fake.fromParent({ ...runRequest(), rpcRedirects: "mainnet.infura.io" }),
    ];
    for (const refusedEvent of refused) fake.deliver(refusedEvent);
    expect(fake.replies).toEqual([]);
    expect(fake.evaluated).toEqual([]);

    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { title: "accepted" }, jsonDuplicateKeys: false }]);
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
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        const params = api.globals.scriptParameters as { disputeID: string };
        api.globals.getMetaEvidence = () => {
          api.resolveScript({ seen: params.disputeID });
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { seen: "1650" }, jsonDuplicateKeys: false }]);
  });
});

describe("bootstrapRunner run and reply", () => {
  it("reports the duplicate keys the guard recorded", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (source, api) => {
        if (source === "guard") return;
        api.globals.getMetaEvidence = () => {
          api.globals.__klerosJsonDuplicateKeys = true;
          api.resolveScript({});
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ guardSource: "guard" })));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: {}, jsonDuplicateKeys: true }]);
  });

  it("reports a synchronous script failure after the acknowledgement", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "Unexpected token" }]);
  });

  it("posts an error when getMetaEvidence throws synchronously", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          throw new Error("boom");
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "boom" }]);
  });

  it("posts an error for a script without getMetaEvidence", async () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "getMetaEvidence is not defined" }]);
  });

  it("posts an error when the script calls rejectScript", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.rejectScript(new Error("question not found"));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "question not found" }]);
  });

  it("still posts an error for a rejection reason that is not an Error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.rejectScript({ code: 42 });
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "The script reported a failure." }]);
  });

  it("posts only the first resolve or reject after the acknowledgement", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          // The pinned Reality renderers resolve in a switch without breaks, so later cases call resolveScript again.
          api.resolveScript({ rulingOptions: { type: "single-select" } });
          api.resolveScript({ rulingOptions: { type: "uint" } });
          api.rejectScript(new Error("late"));
          throw new Error("later still");
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { rulingOptions: { type: "single-select" } }, jsonDuplicateKeys: false }]);
  });

  it("resolveScript adopts a promise", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.resolveScript(Promise.resolve({ title: "adopted" }));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/result", value: { title: "adopted" }, jsonDuplicateKeys: false }]);
  });

  it("posts an error when a promise given to resolveScript rejects", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.resolveScript(Promise.reject(new Error("rpc down")));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "rpc down" }]);
  });

  it("posts an error instead of a value that cannot be structured-cloned", async () => {
    const fake = createFakeRunnerEnvironment({ onEvaluate: resolvingScript({ title: "x", render: () => "not cloneable" }) });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
    expect(fake.replies).toEqual([ACCEPTED, { type: "dr-runner/error", message: "The script's result cannot be copied out of the runner." }]);
  });

  it("does not report asynchronous errors after the acknowledgement, leaving the host's timeout to settle the run", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          const later = Promise.reject(new Error("thrown later"));
          later.catch(() => undefined);
          return later;
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await settleMacrotasks();
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
