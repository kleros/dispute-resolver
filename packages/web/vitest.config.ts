import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest reads this file instead of vite.config.ts, so it has to start from the app's configuration.
export default mergeConfig(
  viteConfig,
  defineConfig({
    // Vite's client default, stated so the test environment uses it too: @kleros/kleros-app 3.1.0 declares only `module`.
    resolve: { mainFields: ["browser", "module", "jsnext:main", "jsnext"] },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // The Playwright specs in e2e/ run through `yarn e2e`, never here.
      include: ["src/**/*.test.{ts,tsx}", "vite-plugins/**/*.test.ts"],
      // Component tests that drive whole pages with user-event run about three times slower on the GitHub runner than on
      // a workstation: CreatePage.test.tsx took 65 s there against 24 s locally, and four of its tests passed the default
      // 5 s limit. A test that hangs still fails, after 30 s.
      testTimeout: 30_000,
      server: {
        deps: {
          // The library imports its own CSS from JavaScript; Node cannot load that, so Vite has to process the package.
          // user-event goes through Vite too, so it resolves the same @testing-library/dom module as React Testing
          // Library, whose configuration wraps every user-event interaction in act().
          inline: ["@kleros/ui-components-library", "@testing-library/user-event"],
        },
      },
    },
  }),
);
