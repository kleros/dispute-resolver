// Public surface of `env` (owner: shell): the one reader of import.meta.env and the app configuration derived from it (ARCHITECTURE.md §4).
export type * from "./types";
export { ENV } from "./env";
export { APP_CONFIG, buildAppConfig } from "./config";
