import { configDefaults, defineConfig } from "vitest/config";

// Stryker's instrumentation slows every call several times, so a test with a wall-clock budget cannot hold under it, and
// Stryker refuses to start while any test fails. Those tests still run in the normal suite.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/*.performance.test.ts"] } });
