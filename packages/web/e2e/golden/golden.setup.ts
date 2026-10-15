import { test as setup } from "@playwright/test";
import { resetCaseReports } from "./report";

// Runs before the golden project: a report only ever holds the results of one run.
setup("clear the previous run's results", () => {
  resetCaseReports();
});
