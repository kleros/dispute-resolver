import { configDefaults, defineConfig } from "vitest/config";

// Stryker's sandbox copies src, instrumented, under the package; the default include would run those copies too.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/.stryker-tmp/**"] } });
