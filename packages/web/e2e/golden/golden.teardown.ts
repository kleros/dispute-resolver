import { test as teardown } from "@playwright/test";
import { REPORTS_DIR } from "./config";
import { buildReports } from "./report";

// Runs after the golden project, whether its tests passed or not: assembles the JSON and Markdown reports.
teardown("write the golden reports", () => {
  const { total, failed } = buildReports();
  teardown.info().annotations.push({ type: "golden-report", description: `${REPORTS_DIR}/golden-report.md: ${total.toString()} screens, ${failed.toString()} failed` });
});
