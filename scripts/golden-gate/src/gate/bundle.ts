import { resolve } from "node:path";
import { build } from "vite";
import { BROWSER_DIR, WEB_DIR } from "../paths";

/** The two harness page scripts the gate injects. */
export interface HarnessBundles {
  readonly oldRunner: string;
  readonly newRunner: string;
}

/**
 * Bundles one harness entry as a classic IIFE in memory, with Vite (the app's own bundler) and no config file, as
 * `buildRunnerBootstrap` builds the runner page's script. Rooted at the web package so its imports resolve as in the app.
 */
async function bundleEntry(entry: string, name: string): Promise<string> {
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    root: WEB_DIR,
    logLevel: "warn",
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      sourcemap: false,
      minify: false,
      lib: { entry, formats: ["iife"], name, fileName: () => `${name}.js` },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap((output) => ("output" in output ? output.output : [])).filter((item) => item.type === "chunk");
  const [chunk] = chunks;
  if (chunk === undefined || chunks.length !== 1) throw new Error(`Bundling ${entry} produced ${String(chunks.length)} chunks instead of one.`);
  return chunk.code;
}

/** The old runner replica and the new runner host, each as one script. */
export async function bundleHarnesses(): Promise<HarnessBundles> {
  return {
    oldRunner: await bundleEntry(resolve(BROWSER_DIR, "oldRunnerPage.ts"), "goldenGateOldRunner"),
    newRunner: await bundleEntry(resolve(BROWSER_DIR, "newRunnerPage.ts"), "goldenGateNewRunner"),
  };
}
