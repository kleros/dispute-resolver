import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_ATTRIBUTES, TEST_IDS } from "./ids";

/** The text of ARCHITECTURE.md §12, the contract the extractor and the builders share. */
function readParitySection(): string {
  const document = readFileSync(resolve(import.meta.dirname, "../../ARCHITECTURE.md"), "utf8");
  const start = document.indexOf("## 12. Parity hooks");
  const end = document.indexOf("## 13.", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return document.slice(start, end);
}

const alphabetical = (a: string, b: string): number => a.localeCompare(b);

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))].filter((name): name is string => name !== undefined).sort(alphabetical);
}

describe("§12: parity hook names", () => {
  it("§12: TEST_IDS lists exactly the data-testid values of the tables", () => {
    const documented = uniqueMatches(readParitySection(), /data-testid="([a-z-]+)"/g);
    expect(documented.length).toBeGreaterThan(0);
    expect([...TEST_IDS].sort(alphabetical)).toEqual(documented);
  });

  it("§12: DATA_ATTRIBUTES lists exactly the other data-* attributes of the tables", () => {
    const documented = uniqueMatches(readParitySection(), /(?<![\w-])(data-[a-z]+(?:-[a-z]+)*)/g).filter((name) => name !== "data-testid");
    expect(documented.length).toBeGreaterThan(0);
    expect([...DATA_ATTRIBUTES].sort(alphabetical)).toEqual(documented);
  });

  it("§12: names are unique", () => {
    expect(new Set(TEST_IDS).size).toBe(TEST_IDS.length);
    expect(new Set(DATA_ATTRIBUTES).size).toBe(DATA_ATTRIBUTES.length);
  });
});
