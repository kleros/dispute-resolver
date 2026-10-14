import { defineConfig } from "vitest/config";

// The gate's own unit tests (run through `yarn golden-gate:test`). They never touch the network: RPC is answered by
// fake clients and every fetch by a stub.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["src/**/*.test.ts", "browser/**/*.test.ts"],
    environment: "node",
  },
});
