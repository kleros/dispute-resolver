import { expect, test } from "@playwright/test";
import type { CheckResult, FieldResult } from "./compare/engine";
import { writeScreenResult, type ScreenResult } from "./report";

// Writes one screen's result for the report and fails the test on what 04 §1 calls a failure: a field that differs from
// production with no ledger entry, or a failed blocking check. Non-blocking checks are notes in the report only.

export type ScreenOutcome = Omit<ScreenResult, "passed" | "attempt">;

function unexplainedOf(fields: readonly FieldResult[]): string[] {
  return fields.filter((field) => field.status === "difference").map((field) => `${field.field}: ${field.detail}`);
}

function failedChecksOf(checks: readonly CheckResult[]): string[] {
  return checks.filter((check) => check.blocking && !check.ok).map((check) => `${check.name}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
}

export function recordOutcome(outcome: ScreenOutcome): void {
  const unexplained = unexplainedOf(outcome.fields);
  const failedChecks = failedChecksOf(outcome.checks);
  writeScreenResult({ ...outcome, attempt: test.info().retry + 1, passed: unexplained.length === 0 && failedChecks.length === 0 });
  expect.soft(unexplained, "fields that differ from production with no ledger entry").toEqual([]);
  expect.soft(failedChecks, "blocking checks").toEqual([]);
}
