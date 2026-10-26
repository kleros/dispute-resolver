import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHAINS } from "@dispute-resolver/core";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "./env";

/** The variables the app reads besides the chain table's. */
const CONFIG_NAMES = ["REACT_APP_WALLETCONNECT_PROJECT_ID", "REACT_APP_ATLAS_URI", "REACT_APP_IPFS_GATEWAY", "REACT_APP_METAEVIDENCE_URL"];

function readNames(): string[] {
  const chainNames = Object.values(CHAINS).map((chain) => chain.readRpcEnv);
  return [...chainNames.filter((name) => name !== undefined), ...CONFIG_NAMES];
}

/**
 * Each `import.meta.env` in env.ts, as the name it is read by, or undefined when it is read whole or by a computed name.
 * Vite inlines only `import.meta.env.NAME` by that name; any other spelling inlines every REACT_APP_* variable of the build.
 */
function importMetaEnvReads(): (string | undefined)[] {
  const path = resolve(import.meta.dirname, "env.ts");
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const reads: (string | undefined)[] = [];
  const visit = (node: ts.Node): void => {
    const isImportMetaEnv =
      ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === "env";
    if (isImportMetaEnv) {
      const { parent } = node;
      reads.push(ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.questionDotToken === undefined ? parent.name.text : undefined);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("readEnv", () => {
  it("keeps only REACT_APP_* string values", () => {
    const env = readEnv({
      REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org",
      REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example.org/key",
      MODE: "test",
      DEV: true,
      PROD: false,
      SSR: false,
      BASE_URL: "/",
      VITE_OTHER: "x",
      REACT_APP_NOT_A_STRING: 1,
      REACT_APP_FLAG: true,
      REACT_APP_NOTHING: undefined,
    });
    expect(env).toEqual({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org", REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example.org/key" });
  });

  it("the result is frozen", () => {
    const env = readEnv({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org" });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("an empty source yields an empty environment", () => {
    expect(readEnv({})).toEqual({});
  });
});

// The real .env is loaded in tests too: assertions name variables, never print their values.
describe("ENV", () => {
  it("carries the variables the app reads from import.meta.env, frozen", async () => {
    vi.stubEnv("REACT_APP_WALLETCONNECT_PROJECT_ID", "stubbed-project-id");
    const { ENV } = await import("./env");
    expect(ENV.REACT_APP_WALLETCONNECT_PROJECT_ID).toBe("stubbed-project-id");
    expect(Object.keys(ENV).filter((key) => !key.startsWith("REACT_APP_"))).toEqual([]);
    expect(Object.isFrozen(ENV)).toBe(true);
  });

  it("carries every variable of the chain table and the configuration, each under its own name", async () => {
    const names = readNames();
    for (const name of names) vi.stubEnv(name, `value of ${name}`);
    const { ENV } = await import("./env");
    expect(names.filter((name) => ENV[name] !== `value of ${name}`)).toEqual([]);
  });

  it("never carries a REACT_APP_* variable the app does not read, even when the environment sets it", async () => {
    vi.stubEnv("REACT_APP_WEB3_MUMBAI_PROVIDER_URL", "https://rpc.example/v2/abc123SECRETxyz");
    vi.stubEnv("REACT_APP_OPTIMISM", "https://rpc.example/v2/abc123SECRETxyz");
    const { ENV } = await import("./env");
    const read = new Set(readNames());
    expect(Object.keys(ENV).filter((name) => !read.has(name))).toEqual([]);
    expect(Object.values(ENV).some((value) => value?.includes("abc123SECRETxyz"))).toBe(false);
  });

  it("reads import.meta.env only by the literal name of each variable the app reads, the one spelling Vite inlines alone", () => {
    const reads = importMetaEnvReads();
    expect(reads).not.toContain(undefined);
    expect(new Set(reads)).toEqual(new Set(readNames()));
  });
});
