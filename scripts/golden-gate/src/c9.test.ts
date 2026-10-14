import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_SRC_DIR } from "./paths";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe("test harness isolation (C9)", () => {
  it("C9: no file of packages/web/src imports the gate tooling or its old-runner replica", () => {
    const importers = sourceFiles(WEB_SRC_DIR).filter((file) => /from\s+["'][^"']*golden-gate|import\(\s*["'][^"']*golden-gate/.test(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
  });
});
