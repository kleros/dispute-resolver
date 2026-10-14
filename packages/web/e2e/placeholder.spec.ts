import { expect, test } from "@playwright/test";

// Placeholder so the Playwright wiring has something to run. The golden-case suite replaces it.
// Run with `yarn e2e` after `yarn playwright install chromium`; `yarn test` never runs this folder.
test("the shell renders a styled button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button")).toBeVisible();
});
