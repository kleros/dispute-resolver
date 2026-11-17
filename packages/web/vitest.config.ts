import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Vite's client default, stated so the test environment uses it too: @kleros/kleros-app 3.1.0 declares only `module`.
    resolve: { mainFields: ["browser", "module", "jsnext:main", "jsnext"] },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "vite-plugins/**/*.test.ts"],
      // Whole-page user-event tests run about three times slower on the GitHub runner, past the default 5 s.
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
