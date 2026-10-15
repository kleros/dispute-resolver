import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { WEB_SRC_DIR } from "./paths";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Whether a source file imports anything under the gate tooling, in any form: named, type, side-effect, re-export,
 * dynamic `import()` or `require`. TypeScript's own pre-processor lists the module specifiers, so comments and string
 * literals outside an import are not mistaken for one.
 */
function importsGateTooling(source: string): boolean {
  return ts.preProcessFile(source, true, true).importedFiles.some((file) => file.fileName.includes("golden-gate"));
}

describe("test harness isolation (C9)", () => {
  it("C9: no file of packages/web/src imports the gate tooling or its old-runner replica", () => {
    const importers = sourceFiles(WEB_SRC_DIR).filter((file) => importsGateTooling(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
  });

  it("C9: every import form of the gate tooling is caught, side-effect imports included", () => {
    expect(importsGateTooling('import "../../../scripts/golden-gate/browser/oldRunnerPage";\n')).toBe(true);
    expect(importsGateTooling("import '../../../scripts/golden-gate/browser/oldRunnerPage'\n")).toBe(true);
    expect(importsGateTooling('import { run } from "../../../scripts/golden-gate/browser/oldRunnerPage";\n')).toBe(true);
    expect(importsGateTooling('import type { OldRunInput } from "../../../scripts/golden-gate/browser/protocol";\n')).toBe(true);
    expect(importsGateTooling('export * from "../../../scripts/golden-gate/browser/protocol";\n')).toBe(true);
    expect(importsGateTooling('const page = await import("../../../scripts/golden-gate/browser/oldRunnerPage");\n')).toBe(true);
    expect(importsGateTooling('import foo = require("../../../scripts/golden-gate/browser/oldRunnerPage");\n')).toBe(true);
  });

  it("C9: a mention of the gate tooling outside an import is not an import", () => {
    expect(importsGateTooling('const note = "see scripts/golden-gate for the C6 gate";\n// import "golden-gate" is forbidden\n')).toBe(false);
  });
});
