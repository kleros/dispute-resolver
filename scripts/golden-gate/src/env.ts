import { existsSync } from "node:fs";
import type { Env } from "../../../packages/core/src/types";
import { ENV_FILE } from "./paths";

/** Environment values shorter than this are not treated as secrets: they are flags or chain names, not keys or URLs. */
const MIN_SECRET_LENGTH = 8;

/** A path or query token of an RPC URL at least this long is treated as an API key and redacted on its own too. */
const MIN_KEY_TOKEN_LENGTH = 16;

/**
 * The environment the gate reads: the repository's `.env` when present, the process environment winning, as the
 * known-questions generator does. Values are never printed; everything the gate writes goes through `createRedactor`.
 */
export function loadEnvironment(): Env {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return { ...process.env };
}

function escapeForRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** The secret fragments of one environment value: the value itself and, for a URL, its long path and query tokens. */
function secretFragments(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) return [];
  const fragments = [trimmed];
  if (URL.canParse(trimmed)) {
    const url = new URL(trimmed);
    const tokens = `${url.pathname}${url.search}`.split(/[/?&=]/);
    fragments.push(...tokens.filter((token) => token.length >= MIN_KEY_TOKEN_LENGTH));
  }
  return fragments;
}

/**
 * A function that replaces every value of the `REACT_APP_*` variables in a text with the variable's name in angle
 * brackets, and every long token of those values that are URLs (an RPC key in a path) with `<redacted>`. RPC URLs carry
 * API keys: the gate never writes or prints a value of `.env` (CLAUDE.md).
 */
export function createRedactor(env: Env): (text: string) => string {
  const wholes: (readonly [string, string])[] = [];
  const tokens: (readonly [string, string])[] = [];
  const entries = Object.entries(env).filter((entry): entry is [string, string] => entry[0].startsWith("REACT_APP_") && typeof entry[1] === "string");
  for (const [name, value] of entries) {
    const [whole, ...keyTokens] = secretFragments(value);
    if (whole === undefined) continue;
    wholes.push([whole, `<${name}>`]);
    tokens.push(...keyTokens.map((token) => [token, "<redacted>"] as const));
  }
  // Whole values first, longest first, so a value that contains another is replaced as a whole; key tokens last.
  const byLength = (a: readonly [string, string], b: readonly [string, string]) => b[0].length - a[0].length;
  wholes.sort(byLength);
  tokens.sort(byLength);
  const replacements = [...wholes, ...tokens].map(([secret, name]) => [new RegExp(escapeForRegExp(secret), "g"), name] as const);
  return (text) => replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}
