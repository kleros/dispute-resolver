import { defineConfig, devices } from "@playwright/test";

const port = "4173";

/**
 * A placeholder, so the e2e build connects an injected wallet as a deploy does (without a project ID the app is
 * read-only). The specs abort every wallet service, so the ID never reaches Reown; it overrides any ID in `.env` for this
 * build only.
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
    { name: "chromium", testDir: "./e2e", use: { ...devices["Desktop Chrome"] } },
    // The runner checks also run in the other engines users run; the `chromium` project covers Chromium.
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
