import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHAINS } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";

/** The text of question MC-1 in docs/ledger-proposals.md, which lists an explorer origin per supported chain (D-40). */
function readExplorerQuestion(): string {
  const document = readFileSync(resolve(import.meta.dirname, "../../../../docs/ledger-proposals.md"), "utf8");
  const start = document.indexOf("**MC-1 ");
  const end = document.indexOf("**MC-2 ", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return document.slice(start, end);
}

/** The documented `<chain id> \`<explorer host>\`` pairs, keyed by chain ID. */
function documentedExplorerHosts(): Map<number, string> {
  const pairs = [...readExplorerQuestion().matchAll(/\b(\d+) `([a-z\d.-]+)`/g)].map((match): [number, string] => [Number(match[1]), String(match[2])]);
  return new Map(pairs);
}

describe("MC-1: explorer origins in the ledger proposals", () => {
  it("MC-1: lists exactly the chains of the table, each with its explorer host (D-40, P-13)", () => {
    const documented = documentedExplorerHosts();
    const configured = new Map(
      Object.values(CHAINS).map((chain) => {
        expect(chain.explorerBaseUrl, `chain ${String(chain.id)}`).toBeDefined();
        return [chain.id, new URL(String(chain.explorerBaseUrl)).host];
      }),
    );
    expect(documented.size).toBeGreaterThan(0);
    expect(Object.fromEntries(documented)).toEqual(Object.fromEntries(configured));
  });
});
