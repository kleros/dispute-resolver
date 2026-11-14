import { describe, expect, it } from "vitest";
import { z } from "./zod";

/** Runs `body` while the global Function constructor counts every call and construction, and returns the count. */
function countFunctionConstructorUses(body: () => void): number {
  const original = globalThis.Function;
  let uses = 0;
  globalThis.Function = new Proxy(original, {
    apply(target, thisArgument, argumentList: unknown[]) {
      uses += 1;
      return Reflect.apply(target, thisArgument, argumentList) as unknown;
    },
    construct(target, argumentList: unknown[], newTarget: NewableFunction) {
      uses += 1;
      return Reflect.construct(target, argumentList, newTarget) as object;
    },
  });
  try {
    body();
  } finally {
    globalThis.Function = original;
  }
  return uses;
}

describe("zod configuration", () => {
  it("builds and runs an object parser without the Function constructor", () => {
    const uses = countFunctionConstructorUses(() => {
      const schema = z.object({ a: z.string(), nested: z.object({ b: z.number() }) });
      expect(schema.parse({ a: "x", nested: { b: 1 } })).toEqual({ a: "x", nested: { b: 1 } });
      expect(schema.safeParse({ a: 1, nested: { b: "y" } }).success).toBe(false);
    });
    expect(uses).toBe(0);
  });
});
