import { describe, expect, it } from "vitest";
import { FAKE_APP_ORIGIN, SAMPLE_PARAMS, SAMPLE_REDIRECTS, createFakeRunnerEnvironment, flushMicrotasks, runRequest, type ScriptApi } from "../../test/runner";
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

describe("bootstrapRunner guards (C4)", () => {
  it('C4: evaluates nothing unless self.origin is "null"', () => {
    const fake = createFakeRunnerEnvironment({ selfOrigin: FAKE_APP_ORIGIN });
    bootstrapRunner(fake.env);
    expect(fake.listenerCount()).toBe(0);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual([]);
  });

  it("C4: refuses when top-level", () => {
    const fake = createFakeRunnerEnvironment({ isTopLevel: true });
    bootstrapRunner(fake.env);
    expect(fake.listenerCount()).toBe(0);
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual([]);
  });

  it("C4: ignores a message whose source is not window.parent", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), source: {} });
    fake.deliver({ ...fake.fromParent(runRequest()), source: null });
    expect(fake.evaluated).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
  });

  it("C4: ignores a message whose origin is not location.origin", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "https://attacker.example" });
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "null" });
    expect(fake.evaluated).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
  });

  it("C4: ignores every message when the runner's own URL has an opaque origin", () => {
    const fake = createFakeRunnerEnvironment({ locationOrigin: "null" });
    bootstrapRunner(fake.env);
    fake.deliver({ ...fake.fromParent(runRequest()), origin: "null" });
    expect(fake.evaluated).toEqual([]);
  });

  it("C4: ignores a request that does not carry exactly one port", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    const event = fake.fromParent(runRequest());
    fake.deliver({ ...event, ports: [] });
    fake.deliver({ ...event, ports: [...event.ports, ...event.ports] });
    expect(fake.evaluated).toEqual([]);
    expect(fake.listenerCount()).toBe(1);
  });

  it("C4: ignores a message that is not a well-formed run request, then accepts one that is", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    const malformed: unknown[] = [
      null,
      "dr-runner/run",
      { ...runRequest(), type: "dr-runner/result" },
      { ...runRequest(), version: 2 },
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
    fake.deliver(fake.fromParent(runRequest()));
    expect(fake.evaluated).toEqual(["script"]);
  });

  it("C4: accepts one request per frame and ignores every later one", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ scriptText: "first" })));
    fake.deliver(fake.fromParent(runRequest({ scriptText: "second" })));
    expect(fake.evaluated).toEqual(["first"]);
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("bootstrapRunner script-facing globals (§7.2, spec §9.5)", () => {
  it("§7.2: defines a frozen copy of scriptParameters and the two callbacks as fixed globals", () => {
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

  it("§7.2: defines the globals before evaluating the script, which reads them at top level", async () => {
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
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/result", value: { seen: "1650" }, jsonDuplicateKeys: false }]);
  });
});

describe("bootstrapRunner run and reply (§7.2)", () => {
  it("B1: posts the resolved value through the transferred port", async () => {
    const fake = createFakeRunnerEnvironment({ onEvaluate: resolvingScript({ rulingOptions: { titles: ["Yes", "No"] } }) });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/result", value: { rulingOptions: { titles: ["Yes", "No"] } }, jsonDuplicateKeys: false }]);
  });

  it("A4: evaluates the duplicate-key guard before the script when the host sends one", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ guardSource: "guard" })));
    expect(fake.evaluated).toEqual(["guard", "script"]);
  });

  it("A4: evaluates no guard when the host sends none", () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest({ guardSource: null })));
    expect(fake.evaluated).toEqual(["script"]);
  });

  it("A4: reports the duplicate keys the guard recorded", async () => {
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
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/result", value: {}, jsonDuplicateKeys: true }]);
  });

  it("§7.2: a synchronous throw while evaluating the script posts an error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "Unexpected token" }]);
  });

  it("§7.2: a synchronous throw from getMetaEvidence posts an error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          throw new Error("boom");
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "boom" }]);
  });

  it("§7.2: a script without getMetaEvidence posts an error", async () => {
    const fake = createFakeRunnerEnvironment();
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "getMetaEvidence is not defined" }]);
  });

  it("§7.2: rejectScript posts an error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.rejectScript(new Error("question not found"));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "question not found" }]);
  });

  it("§7.2: a rejection reason that is not an Error still posts an error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.rejectScript({ code: 42 });
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "The script reported a failure." }]);
  });

  it("§7.2: only the first resolve or reject is posted", async () => {
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
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/result", value: { rulingOptions: { type: "single-select" } }, jsonDuplicateKeys: false }]);
  });

  it("§7.2: resolveScript adopts a promise, as the old runner's promise resolver did", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.resolveScript(Promise.resolve({ title: "adopted" }));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/result", value: { title: "adopted" }, jsonDuplicateKeys: false }]);
  });

  it("§7.2: a resolved promise that rejects posts an error", async () => {
    const fake = createFakeRunnerEnvironment({
      onEvaluate: (_source, api) => {
        api.globals.getMetaEvidence = () => {
          api.resolveScript(Promise.reject(new Error("rpc down")));
        };
      },
    });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "rpc down" }]);
  });

  it("§7.2: a value that cannot be structured-cloned posts an error instead", async () => {
    const fake = createFakeRunnerEnvironment({ onEvaluate: resolvingScript({ title: "x", render: () => "not cloneable" }) });
    bootstrapRunner(fake.env);
    fake.deliver(fake.fromParent(runRequest()));
    await flushMicrotasks();
    expect(fake.replies).toEqual([{ type: "dr-runner/error", message: "The script's result cannot be copied out of the runner." }]);
  });

  it("§7.2: asynchronous errors are not reported; the host's timeout settles the run", async () => {
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
    await flushMicrotasks();
    expect(fake.replies).toEqual([]);
  });

  it("D-25: installs the RPC redirect before the script is evaluated", async () => {
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
