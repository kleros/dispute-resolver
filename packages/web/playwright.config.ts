import { defineConfig, devices } from "@playwright/test";

const port = "4173";

/** The golden suite drives production and the new app over the network; one case can take several minutes. */
const GOLDEN_TIMEOUT_MS = 15 * 60_000;

/** Parallel golden cases (`GOLDEN_WORKERS`, default 2): each loads production and the new app against the same RPCs. */
const GOLDEN_WORKERS = Number.parseInt(process.env.GOLDEN_WORKERS ?? "2", 10) || 2;

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
    { name: "chromium", testDir: "./e2e", testIgnore: "golden/**", use: { ...devices["Desktop Chrome"] } },
    // `yarn e2e:runner`: the runner checks (e2e/runner) in the other engines users run; the `chromium` project covers Chromium.
    { name: "runner-firefox", testDir: "./e2e/runner", use: { ...devices["Desktop Firefox"] } },
    { name: "runner-webkit", testDir: "./e2e/runner", use: { ...devices["Desktop Safari"] } },
    // `yarn golden`: the golden-case parity suite of docs/parity/04-golden-cases.md §1 and §2 (e2e/golden/README.md).
    { name: "golden-setup", testDir: "./e2e/golden", testMatch: "golden.setup.ts" },
    {
      name: "golden",
      testDir: "./e2e/golden",
      testMatch: "*.spec.ts",
      dependencies: ["golden-setup"],
      teardown: "golden-report",
      timeout: GOLDEN_TIMEOUT_MS,
      // One retry absorbs an RPC rate limit under parallel load; the report records the attempt.
      retries: 1,
      workers: GOLDEN_WORKERS,
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    { name: "golden-report", testDir: "./e2e/golden", testMatch: "golden.teardown.ts" },
  ],
  webServer: {
    command: `yarn build && yarn preview --port ${port} --strictPort`,
    env: { REACT_APP_WALLETCONNECT_PROJECT_ID: E2E_WALLETCONNECT_PROJECT_ID },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
