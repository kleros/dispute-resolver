import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(import.meta.dirname, "../../../.env");

/** Loads the repository's `.env` when present; variables already in the environment win. */
export function loadRepositoryEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}
