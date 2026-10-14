import { describe, expect, it } from "vitest";
import { LEGACY_SOURCE_FILE, LEGACY_SOURCE_REVISION, defaultLegacySources, legacyRedirectUrlFrom, loadLegacyRedirectUrl, type LegacySource } from "./legacyRedirect";

/** Synthetic keys: the real one is read from today's source at run time and never written in the gate. */
const URL_A = `https://mainnet.infura.io/v3/${"feedface".repeat(4)}`;
const URL_B = `https://mainnet.infura.io/v3/${"0badc0de".repeat(4)}`;

/** The shape of today's declaration (spec 9.5): one Infura URL mapped to chain 1, then the patch that reads the map. */
function todaysSource(...urls: readonly string[]): string {
  const entries = urls.map((url) => `  "${url}": "1",`).join("\n");
  return `const RPCS_TO_REDIRECT = {\n${entries}\n};\n\nObject.entries(RPCS_TO_REDIRECT).forEach(([oldRpc, chainId]) => {});\n`;
}

function source(label: string, text: string): LegacySource {
  return { label, read: () => Promise.resolve(text) };
}

function unreadable(label: string, reason: string): LegacySource {
  return { label, read: () => Promise.reject(new Error(`${reason}\nsecond line`)) };
}

describe("the old runner's redirected URL (spec 9.5, S6783)", () => {
  it("§9.5: reads the single Infura URL today's source declares", () => {
    expect(legacyRedirectUrlFrom(todaysSource(URL_A), "utils.js")).toBe(URL_A);
  });

  it("§9.5: the same URL written twice is still one URL", () => {
    expect(legacyRedirectUrlFrom(`${todaysSource(URL_A)}// ${URL_A}\n`, "utils.js")).toBe(URL_A);
  });

  it("§9.5: fails clearly, without quoting the source, when the source declares no Infura URL", () => {
    expect(() => legacyRedirectUrlFrom("const RPCS_TO_REDIRECT = {};", "utils.js")).toThrow("utils.js declares 0 Infura URLs");
  });

  it("§9.5: fails clearly, without quoting the source, when the source declares several Infura URLs", () => {
    const run = (): string => legacyRedirectUrlFrom(todaysSource(URL_A, URL_B), "utils.js");
    expect(run).toThrow("utils.js declares 2 Infura URLs");
    expect(run).not.toThrow(/feedface|0badc0de/);
  });

  it("§9.5: prefers the first readable source", async () => {
    await expect(loadLegacyRedirectUrl([source("git", todaysSource(URL_A)), source("file", todaysSource(URL_B))])).resolves.toBe(URL_A);
  });

  it("§9.5: falls back to the next source when one cannot be read", async () => {
    await expect(loadLegacyRedirectUrl([unreadable("git", "fatal: invalid object name"), source("file", todaysSource(URL_B))])).resolves.toBe(URL_B);
  });

  it("§9.5: a readable source without exactly one URL fails rather than falling through", async () => {
    await expect(loadLegacyRedirectUrl([source("git", "nothing here"), source("file", todaysSource(URL_B))])).rejects.toThrow("git declares 0 Infura URLs");
  });

  it("§9.5: fails clearly, naming each source's first error line, when no source can be read", async () => {
    const attempt = loadLegacyRedirectUrl([unreadable("git", "fatal: invalid object name"), unreadable("file", "ENOENT")]);
    await expect(attempt).rejects.toThrow(`Cannot read the URL today's RPC patch redirects (${LEGACY_SOURCE_FILE}). git: fatal: invalid object name; file: ENOENT`);
  });

  it("§9.5: names a failed command by its standard error, not its generic message", async () => {
    const failed = Object.assign(new Error("Command failed: git show master:src/utils/utils.js"), { stderr: "fatal: invalid object name 'master'.\n" });
    const attempt = loadLegacyRedirectUrl([{ label: "git", read: () => Promise.reject(failed) }]);
    await expect(attempt).rejects.toThrow("git: fatal: invalid object name 'master'.");
  });

  it("§9.5: reads today's source from the master branch first, then from the old app's file", () => {
    expect(defaultLegacySources().map((item) => item.label)).toEqual([`git show ${LEGACY_SOURCE_REVISION}:${LEGACY_SOURCE_FILE}`, LEGACY_SOURCE_FILE]);
  });
});
