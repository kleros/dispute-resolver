import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { REPOSITORY_ROOT } from "../paths";

// The one URL today's RPC patch redirects (spec 9.5, `RPCS_TO_REDIRECT` in today's src/utils/utils.js) carries a
// provider key, so the gate never writes it down: it reads it from today's source each run, preferring the master
// branch so it keeps working once the old app leaves the tree.

/** Today's file that declares the redirected URL, relative to the repository root. */
export const LEGACY_SOURCE_FILE = "src/utils/utils.js";

/** The branch that keeps today's app. */
export const LEGACY_SOURCE_REVISION = "master";

/** One place today's source can be read from, tried in order. */
export interface LegacySource {
  readonly label: string;
  readonly read: () => Promise<string>;
}

/** An Infura HTTPS endpoint with its key, the shape `RPCS_TO_REDIRECT` uses. */
const INFURA_URL = /https:\/\/[a-z0-9.-]+\.infura\.io\/v3\/[0-9a-f]+/gi;

/**
 * The first line of an error's cause: a failed command's standard error when it wrote one (git's `fatal: …`), else the
 * message. One line, so a failure names its cause without dumping a command's whole output.
 */
function reasonOf(error: unknown): string {
  const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  return (stderr === "" ? message : stderr).split("\n", 1)[0] ?? "";
}

/**
 * The single Infura URL a source declares. Fails when it declares none or several distinct ones, since either means
 * today's redirect is no longer the one the replica reproduces. The message never quotes the source.
 */
export function legacyRedirectUrlFrom(source: string, label: string): string {
  const urls = [...new Set(source.match(INFURA_URL) ?? [])];
  if (urls.length === 1 && urls[0] !== undefined) return urls[0];
  throw new Error(`${label} declares ${String(urls.length)} Infura URLs; the old runner replica needs exactly one, the URL today's RPC patch redirects.`);
}

/**
 * Reads the redirected URL from the first source that can be read. A readable source that does not declare exactly one
 * URL fails at once rather than falling through, so the URL always comes from the preferred source.
 */
export async function loadLegacyRedirectUrl(sources: readonly LegacySource[]): Promise<string> {
  const failures: string[] = [];
  for (const source of sources) {
    let text: string;
    try {
      text = await source.read();
    } catch (error) {
      failures.push(`${source.label}: ${reasonOf(error)}`);
      continue;
    }
    return legacyRedirectUrlFrom(text, source.label);
  }
  throw new Error(`Cannot read the URL today's RPC patch redirects (${LEGACY_SOURCE_FILE}). ${failures.join("; ")}`);
}

const execFileAsync = promisify(execFile);

/** Today's source on the master branch through `git show`, then the old app's file while it is still in the tree. */
export function defaultLegacySources(): readonly LegacySource[] {
  const object = `${LEGACY_SOURCE_REVISION}:${LEGACY_SOURCE_FILE}`;
  return [
    {
      label: `git show ${object}`,
      read: async () => (await execFileAsync("git", ["show", object], { cwd: REPOSITORY_ROOT, encoding: "utf8" })).stdout,
    },
    {
      label: LEGACY_SOURCE_FILE,
      read: () => readFile(resolve(REPOSITORY_ROOT, LEGACY_SOURCE_FILE), "utf8"),
    },
  ];
}
