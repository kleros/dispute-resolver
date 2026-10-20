import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPTED_MESSAGE_TYPE, ERROR_MESSAGE_TYPE, PROTOCOL_VERSION, RESULT_MESSAGE_TYPE, RUN_MESSAGE_TYPE } from "./protocol";

const ARCHITECTURE = readFileSync(resolve(import.meta.dirname, "../../ARCHITECTURE.md"), "utf8");

/** The text of ARCHITECTURE.md from the heading `from` up to the heading `to`. */
function section(from: string, to: string): string {
  const start = ARCHITECTURE.indexOf(`\n${from} `);
  const end = ARCHITECTURE.indexOf(`\n${to} `, start);
  expect(start, from).toBeGreaterThan(-1);
  expect(end, to).toBeGreaterThan(start);
  return ARCHITECTURE.slice(start, end);
}

const RUNNER_SECTIONS = section("### 7.2", "## 8.");
const PAGE_BOOTSTRAP = section("### 7.2", "### 7.3");
const HOST_PROTOCOL = section("### 7.3", "### 7.4");
const WIRING_AND_TESTS = section("### 7.4", "## 8.");

describe("P16-R2: ARCHITECTURE.md §7.2 to §7.4 describe the runner protocol that ships (ADR 0004 amendment, P-16)", () => {
  it("P16-R2: §7.2 step 2 accepts the shipped protocol version and acknowledges on the port", () => {
    expect(PAGE_BOOTSTRAP).toContain(`version === ${String(PROTOCOL_VERSION)}`);
    expect(PAGE_BOOTSTRAP).toContain(`{ type: "${ACCEPTED_MESSAGE_TYPE}" }`);
  });

  it("P16-R2: §7.3 posts the shipped protocol version and names the acknowledgement window", () => {
    expect(HOST_PROTOCOL).toContain(`{ type: "${RUN_MESSAGE_TYPE}", version: ${String(PROTOCOL_VERSION)},`);
    expect(HOST_PROTOCOL).toContain(ACCEPTED_MESSAGE_TYPE);
    expect(HOST_PROTOCOL).toContain(RESULT_MESSAGE_TYPE);
    expect(HOST_PROTOCOL).toContain(ERROR_MESSAGE_TYPE);
    expect(HOST_PROTOCOL).toContain("ACKNOWLEDGEMENT_WINDOW_MS");
  });

  it("P16-R2: no other protocol version is described", () => {
    const versions = [...RUNNER_SECTIONS.matchAll(/version(?: ===|:) (\d+)/g)].map((match) => Number(match[1]));
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((version) => version !== PROTOCOL_VERSION)).toEqual([]);
  });

  it("P16-R2: §7.4 lists the P-16 unit and end-to-end tests", () => {
    expect(WIRING_AND_TESTS).toContain("P-16");
    expect(WIRING_AND_TESTS).toContain("e2e/runner/runner-blocked.spec.ts");
    expect(WIRING_AND_TESTS).toContain("vite-plugins/runnerBootstrapPlugin.test.ts");
  });
});
