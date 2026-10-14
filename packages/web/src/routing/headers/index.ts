// Node-side build code for the Netlify headers (ARCHITECTURE.md §10.3). vite.config.ts imports it from here; the routing
// index does not re-export it, so it never enters the app's module graph. Only the plugin is exported: the policy module
// imports core, which the config loader cannot load, so the plugin loads it at build time (see headersPlugin.ts).
export { headersPlugin } from "./headersPlugin";
