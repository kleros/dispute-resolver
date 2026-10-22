import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { XhrOpen } from "../types";
import { realEnvironment } from "./realEnvironment";

const nativeOpen = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "open");

describe("realEnvironment network hooks", () => {
  afterEach(() => {
    if (nativeOpen) Object.defineProperty(XMLHttpRequest.prototype, "open", nativeOpen);
  });

  it("wrapXhrOpen hands the wrapper the native open, called on the request", () => {
    const receivers: unknown[] = [];
    realEnvironment().network.wrapXhrOpen(
      (original: XhrOpen): XhrOpen =>
        function open(this: XMLHttpRequest, method, url, ...rest) {
          receivers.push(this);
          original.call(this, method, url, ...rest);
        },
    );

    const request = new XMLHttpRequest();
    request.open("POST", "https://rpc.example.test/");

    expect(receivers).toEqual([request]);
    expect(request.readyState).toBe(XMLHttpRequest.OPENED);
  });

  it("the runner page's sources carry no lint suppression", () => {
    const sources = readdirSync(import.meta.dirname).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const suppressed = sources.filter((name) => /eslint-disable|NOSONAR/.test(readFileSync(join(import.meta.dirname, name), "utf8")));
    expect(sources).toContain("realEnvironment.ts");
    expect(suppressed).toEqual([]);
  });
});
