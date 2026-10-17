import { defineConfig, devices } from "@playwright/test";

const port = "4173";

/**
 * The e2e build's WalletConnect project ID: a placeholder, so the build connects an injected wallet as a deploy does
 * (without one the app is read-only, K-02). The specs abort every wallet service, so the ID never reaches Reown from
 * them; it overrides any ID in `.env` for this build only, and the production build never sees it.
 */
const E2E_WALLETCONNECT_PROJECT_ID = "e2e00000000000000000000000000000";

export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    // `yarn e2e`: the app's own Playwright checks (the runner page of ADR 0004, e2e/app, and e2e/deploy with DR_E2E_DEPLOY_URL).
    { name: "chromium", testDir: "./e2e", use: { ...devices["Desktop Chrome"] } },
    // `yarn e2e:runner`: the runner checks (e2e/runner) in the other engines users run; the `chromium` project covers Chromium.
    { name: "runner-firefox", testDir: "./e2e/runner", use: { ...devices["Desktop Firefox"] } },
    { name: "runner-webkit", testDir: "./e2e/runner", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `yarn build && yarn preview --port ${port} --strictPort`,
    env: { REACT_APP_WALLETCONNECT_PROJECT_ID: E2E_WALLETCONNECT_PROJECT_ID },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
