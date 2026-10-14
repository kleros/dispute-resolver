import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { headersPlugin } from "./src/routing/headers";
import { runnerBootstrapPlugin } from "./src/runner/build";

// The repository root holds .env; only variables starting with REACT_APP_ reach the client bundle,
// which keeps the existing variable names working unchanged.
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), runnerBootstrapPlugin(), headersPlugin()],
  envDir: repositoryRoot,
  envPrefix: "REACT_APP_",
  // Vite's client default, stated so the test environment uses it too: @kleros/kleros-app 3.1.0 declares only `module`.
  resolve: { mainFields: ["browser", "module", "jsnext:main", "jsnext"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Playwright specs live in e2e/ and run through `yarn e2e`, never through `yarn test`.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // The library imports its own CSS from JavaScript; Node cannot load that, so Vite has to process the package.
    server: { deps: { inline: ["@kleros/ui-components-library"] } },
  },
});
