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
    // Playwright hides headless Chromium's scrollbars, which the app takes for overlay ones; without the switch Chromium
    // lays out classic scrollbars, as on Windows and Linux desktops, so every spec runs on the page scroller those
    // visitors get (shell/PageScroller.tsx).
    { name: "chromium", testDir: "./e2e", use: { ...devices["Desktop Chrome"], launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } } },
    // The runner checks also run in the other engines users run; the `chromium` project covers Chromium.
    { name: "runner-firefox", testDir: "./e2e/runner", use: { ...devices["Desktop Firefox"] } },
    { name: "runner-webkit", testDir: "./e2e/runner", use: { ...devices["Desktop Safari"] } },
    // The page scroller in the other engines. Headless Firefox hides every scrollbar, so this project runs it headed, with
    // GTK's classic scrollbars, on the virtual display `yarn e2e:scroller` starts, one window at a time: a window another
    // covers stops drawing frames. WebKit on Linux overlays its scrollbars, as macOS does: the spec checks that path there,
    // and gives the scroller checks a scrollbar rule that lays a classic one out.
    {
      name: "scroller-firefox",
      testDir: "./e2e/app",
      testMatch: "page-scroller.spec.ts",
      use: { ...devices["Desktop Firefox"], headless: false, launchOptions: { firefoxUserPrefs: { "widget.gtk.overlay-scrollbars.enabled": false } } },
    },
    { name: "scroller-webkit", testDir: "./e2e/app", testMatch: "page-scroller.spec.ts", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `yarn build && yarn preview --port ${port} --strictPort`,
    env: { REACT_APP_WALLETCONNECT_PROJECT_ID: E2E_WALLETCONNECT_PROJECT_ID },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
