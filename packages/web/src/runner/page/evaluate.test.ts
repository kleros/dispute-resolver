import { JSON_DUPLICATE_KEY_GUARD } from "@dispute-resolver/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateInGlobalScope, runScriptInGlobalScope } from "./evaluate";

const globals = globalThis as Record<string, unknown>;

describe("evaluateInGlobalScope", () => {
  afterEach(() => {
    for (const name of ["__c7Result", "__probeFunction", "__probeVar", "__probeCalls", "getMetaEvidence"]) Reflect.deleteProperty(globals, name);
  });

  it("a script with a non-ASCII literal round-trips", () => {
    evaluateInGlobalScope('globalThis.__c7Result = "Harris␟Trump␟Answered Too Soon – é 日本 🙂".split("␟");');
    expect(globals.__c7Result).toEqual(["Harris", "Trump", "Answered Too Soon – é 日本 🙂"]);
  });

  it("a top-level function or var declaration becomes a global, as in a classic script", () => {
    evaluateInGlobalScope("function __probeFunction() { return 1; } var __probeVar = 2;");
    expect(typeof globals.__probeFunction).toBe("function");
    expect(globals.__probeVar).toBe(2);
  });

  it("a syntax error throws synchronously", () => {
    expect(() => {
      evaluateInGlobalScope("function (");
    }).toThrow(SyntaxError);
  });
});

describe("runScriptInGlobalScope", () => {
  afterEach(() => {
    for (const name of ["__probeCalls", "getMetaEvidence"]) Reflect.deleteProperty(globals, name);
  });

  it("calls a getMetaEvidence declared with const, as the default script declares it", () => {
    runScriptInGlobalScope('globalThis.__probeCalls = [];\nconst getMetaEvidence = () => {\n  globalThis.__probeCalls.push("const");\n};\n');
    expect(globals.__probeCalls).toEqual(["const"]);
  });

  it("calls a getMetaEvidence declared with var, as the bundled scripts declare it", () => {
    runScriptInGlobalScope('globalThis.__probeCalls = []; var getMetaEvidence = function () { globalThis.__probeCalls.push("var"); }');
    expect(globals.__probeCalls).toEqual(["var"]);
  });

  it("calls the entry point of a strict-mode script ending in a line comment", () => {
    runScriptInGlobalScope('"use strict"; globalThis.__probeCalls = []; function getMetaEvidence() { globalThis.__probeCalls.push("strict"); } //# sourceMappingURL=x.map');
    expect(globals.__probeCalls).toEqual(["strict"]);
  });

  it("a script without getMetaEvidence throws synchronously", () => {
    expect(() => {
      runScriptInGlobalScope("var unrelated = 1;");
    }).toThrow(ReferenceError);
    Reflect.deleteProperty(globals, "unrelated");
  });
});

describe("JSON_DUPLICATE_KEY_GUARD evaluated in the global scope", () => {
  let nativeParse: typeof JSON.parse;

  beforeEach(() => {
    nativeParse = JSON.parse;
    evaluateInGlobalScope(JSON_DUPLICATE_KEY_GUARD);
  });

  afterEach(() => {
    JSON.parse = nativeParse;
    Reflect.deleteProperty(globals, "__klerosJsonDuplicateKeys");
  });

  it("parses JSON without duplicate keys as the native parser does", () => {
    const text = '{"title":"a \\"quoted\\" \\\\ title","type":"bool","nested":{"type":"x"},"list":[{"a":1},{"a":2}]}';
    expect(JSON.parse(text)).toEqual(nativeParse(text));
    expect(JSON.parse("[1,2,3]")).toEqual([1, 2, 3]);
    expect(JSON.parse('"string"')).toBe("string");
    expect(JSON.parse('{"a":1}', (key, value: unknown) => (key === "a" && typeof value === "number" ? value + 1 : value))).toEqual({ a: 2 });
    expect(globals.__klerosJsonDuplicateKeys).toBeUndefined();
  });

  it("rejects duplicate keys at any depth", () => {
    expect(() => {
      JSON.parse('{"type":"bool","title":"x","type":"single-select"}');
    }).toThrow(SyntaxError);
    expect(() => {
      JSON.parse('{"a":{"b":1, "b":2}}');
    }).toThrow(SyntaxError);
    expect(() => {
      JSON.parse('[{"a":1,"a":1}]');
    }).toThrow(SyntaxError);
    expect(globals.__klerosJsonDuplicateKeys).toBe(true);
  });

  it("does not confuse string values or escaped quotes with keys", () => {
    expect(JSON.parse('{"a":"\\"a\\":1","b":"a"}')).toEqual({ a: '"a":1', b: "a" });
    expect(JSON.parse('{"a" : 1, "\\u0061b": 2}')).toEqual({ a: 1, ab: 2 });
  });

  it("still rejects invalid JSON", () => {
    expect(() => {
      JSON.parse("{title: 1}");
    }).toThrow(SyntaxError);
  });
});
