import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, runnerImport, type Plugin } from "vite";
import type * as AppCsp from "../src/routing/headers/appCsp";

const HEADERS_FILE = "_headers";

/** The prefix of the variables core's chain table and the app read. */
const ENV_PREFIX = "REACT_APP_";

/**
 * Vite's config loader leaves bare imports to Node, which cannot load core's TypeScript sources, so the module (and core
 * through it) is loaded with Vite's module runner when the plugin runs.
 */
const APP_CSP_MODULE = fileURLToPath(new URL("../src/routing/headers/appCsp.ts", import.meta.url));

/**
 * The policy is computed from the build's environment (`.env` files of `envDir` and `process.env`, through `loadEnv`).
 * Every failure names the variable, never its value.
 */
export function headersPlugin(): Plugin {
  let root: string | null = null;
  let outDir: string | null = null;
  let env: Readonly<Record<string, string>> = {};
  return {
    name: "dispute-resolver:headers",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      env = loadEnv(config.mode, config.envDir, ENV_PREFIX);
    },
    async writeBundle() {
      if (root === null || outDir === null) throw new Error("headersPlugin: the build configuration was not resolved.");
      const file = path.join(outDir, HEADERS_FILE);
      let headers: string;
      try {
        headers = await readFile(file, "utf8");
      } catch {
        throw new Error(`headersPlugin: ${HEADERS_FILE} is missing from the build output; public/${HEADERS_FILE} must be copied.`);
      }
      const { module } = await runnerImport<typeof AppCsp>(APP_CSP_MODULE, { root, logLevel: "error" });
      await writeFile(file, module.applyAppCsp(headers, module.buildAppCsp(env)), "utf8");
    },
  };
}
