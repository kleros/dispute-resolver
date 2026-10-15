import { describe, expect, it } from "vitest";
import { createRedactor } from "../env";
import { collectDiagnostics, type DiagnosticSource } from "./browser";

/** A synthetic RPC key: never a value of `.env`. */
const KEY = "0123456789abcdef0123456789abcdef";
const RPC_URL = `https://mainnet.rpc.test/v3/${KEY}`;
const redact = createRedactor({ REACT_APP_WEB3_PROVIDER_URL: RPC_URL });

interface ConsoleMessage {
  type(): string;
  text(): string;
}

/** A page whose console messages and uncaught errors the test emits by hand. */
function fakePage(): DiagnosticSource & { readonly log: (message: ConsoleMessage) => void; readonly fail: (error: Error) => void } {
  const consoleListeners: ((message: ConsoleMessage) => void)[] = [];
  const errorListeners: ((error: Error) => void)[] = [];
  function on(event: "console", listener: (message: ConsoleMessage) => void): void;
  function on(event: "pageerror", listener: (error: Error) => void): void;
  function on(event: "console" | "pageerror", listener: ((message: ConsoleMessage) => void) | ((error: Error) => void)): void {
    if (event === "console") consoleListeners.push(listener as (message: ConsoleMessage) => void);
    else errorListeners.push(listener as (error: Error) => void);
  }
  return {
    on,
    log: (message) => {
      for (const listener of consoleListeners) listener(message);
    },
    fail: (error) => {
      for (const listener of errorListeners) listener(error);
    },
  };
}

/** Where the key starts in a logged line: its first ten characters fall before the 300-character cut. */
const KEY_START = 290;

/** A line, once prefixed with `prefixLength` characters, whose RPC key crosses the 300-character cut. */
function straddling(prefixLength: number): string {
  const lead = ` redirected to ${RPC_URL.slice(0, -KEY.length)}`;
  return `${"x".repeat(KEY_START - prefixLength - lead.length)}${lead}${KEY} instead`;
}

describe("gate diagnostics (CLAUDE.md, Secrets)", () => {
  it("Secrets: a console line is redacted whole before it is cut, so no part of a key crossing the cut survives", () => {
    const page = fakePage();
    const diagnostics = collectDiagnostics(page, redact);
    const text = straddling("warning: ".length);
    page.log({ type: () => "warning", text: () => text });
    const [line] = diagnostics.done().console;
    expect(line).toBeDefined();
    expect(line).not.toContain(KEY.slice(0, 8));
    expect(line).toContain("<REACT_APP_WEB3_PROVIDER_URL>");
    expect(line?.length).toBeLessThanOrEqual(300);
  });

  it("Secrets: a request URL outside .env, such as a third party's keyed RPC URL, is logged as its host and fingerprint", () => {
    const page = fakePage();
    const diagnostics = collectDiagnostics(page, redact);
    const thirdParty = `https://mainnet.infura.test/v3/${"fedcba98".repeat(4)}`;
    page.log({ type: () => "error", text: () => `Failed to load resource: ${thirdParty}` });
    page.fail(new Error(`fetch ${thirdParty}?apikey=1 failed`));
    const [line] = diagnostics.done().console;
    const [error] = diagnostics.done().pageErrors;
    expect(line).toMatch(/^error: Failed to load resource: mainnet\.infura\.test sha256:[\da-f]{12}$/);
    expect(error).toMatch(/^Error: fetch mainnet\.infura\.test sha256:[\da-f]{12} failed$/);
    expect(`${line ?? ""}${error ?? ""}`.includes("fedcba98")).toBe(false);
  });

  it("Secrets: a page error is redacted whole before it is cut", () => {
    const page = fakePage();
    const diagnostics = collectDiagnostics(page, redact);
    page.fail(new Error(straddling("Error: ".length)));
    const [line] = diagnostics.done().pageErrors;
    expect(line).not.toContain(KEY.slice(0, 8));
    expect(line).toContain("<REACT_APP_WEB3_PROVIDER_URL>");
  });
});
