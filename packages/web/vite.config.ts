import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { headersPlugin } from "./vite-plugins/headersPlugin";
import { runnerBootstrapPlugin } from "./vite-plugins/runnerBootstrapPlugin";

// The repository root holds .env; only variables starting with REACT_APP_ reach the client bundle,
// which keeps the existing variable names working unchanged.
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), runnerBootstrapPlugin(), headersPlugin()],
  envDir: repositoryRoot,
  envPrefix: "REACT_APP_",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Just above the one chunk that cannot be split: @kleros/ui-components-library 3.10.0 ships its document viewer as a
    // single prebuilt module, emitted as its own chunk of about 515 kB minified. Only two of the library's own chunks
    // reference it, and it references them back; no chunk of the app's own code does. Every other chunk stays under
    // Vite's default of 500 kB.
    chunkSizeWarningLimit: 520,
    rolldownOptions: {
      treeshake: {
        // The workspace's own TypeScript modules run no code at import time beyond their declarations, so a module whose
        // exports are unused can be dropped. Without this, the barrels (`data`, `@dispute-resolver/core`) keep every
        // module they re-export in the entry's graph: core's `rulings` then pulls reality-eth-lib (ethers, marked,
        // DOMPurify) into the first paint although only the case page uses it. Stylesheets and dependencies keep the
        // default, so `import "./index.css"` and every package's own `sideEffects` field still apply. The first rule a
        // module matches wins: core's zod.ts configures zod at import time, and under the general rule the bundler drops
        // that call although the module's export is used (scripts/check-bundle.mjs fails the build's check without it).
        moduleSideEffects: [
          { test: /\/packages\/core\/src\/zod\.ts$/, sideEffects: true },
          { test: /\/packages\/(core|web)\/src\/.+\.tsx?$/, sideEffects: false },
        ],
      },
      output: {
        codeSplitting: {
          // Lazily loaded dependencies that the automatic split leaves in chunks over the size limit, given chunks of
          // their own. None is in the first paint's graph: ethers and reality-eth-lib are the case page's, WalletConnect
          // is AppKit's, and viem's CommonJS build is reached only through AppKit's optional connectors. Each group keeps
          // the default of taking its modules' dependencies with them, which keeps the execution order valid; a group
          // whose dependencies the first paint shares would pull the whole group into the first paint, so the
          // WalletConnect group is its `core` package only. The first group a module matches takes it: reality-eth-lib
          // nests its own ethers, which goes to `ethers`.
          groups: [
            { name: "ethers", test: /\/node_modules\/(ethers|aes-js)\// },
            { name: "reality-eth-lib", test: /\/node_modules\/(@reality\.eth|marked|dompurify|isomorphic-dompurify)\// },
            { name: "walletconnect-core", test: /\/node_modules\/@walletconnect\/core\// },
            { name: "viem-cjs", test: /\/node_modules\/viem\/_cjs\//, maxSize: 400_000 },
          ],
        },
      },
    },
  },
});
