/**
 * What the operator scripts may print about a failure. RPC URLs carry API keys, so no URL and no piece of a configured
 * RPC URL ever reaches the output.
 */
import { BaseError } from "viem";
import { CHAINS, resolvePublicRpcUrl, resolveReadRpcUrl } from "../src/chains";
import { urlPieces } from "../src/rpc/urlPieces";
import type { Env } from "../src/types";

const ANY_URL = /\b[a-z][\d+.a-z-]*:\/\/\S+/gi;
const LONG_TOKEN = /[\w-]{16,}/g;
const CONTROL_CHARACTERS = /\p{Cc}+/gu;

/**
 * Removes every URL, and the host, credentials, path segments and query values of each of `urls`, longest first so a
 * piece that is part of another cannot leave the rest of it behind. Control characters become spaces, so a quoted
 * message can neither forge an output line nor send terminal escapes.
 */
export function printable(text: string, urls: readonly string[]): string {
  const pieces = urls.flatMap((url) => urlPieces(url)).sort((left, right) => right.length - left.length);
  let cleaned = text.replaceAll(ANY_URL, "<url>");
  for (const piece of pieces) cleaned = cleaned.replaceAll(piece, "<redacted>");
  return cleaned.replaceAll(CONTROL_CHARACTERS, " ");
}

/**
 * `printable`, with any long token removed too (a key a provider echoes without its URL). For a node's free text only:
 * it also removes addresses and variable names.
 */
export function redact(text: string, urls: readonly string[]): string {
  return printable(text, urls).replaceAll(LONG_TOKEN, "<redacted>");
}

function configuredRpcUrls(env: Env): string[] {
  const urls = new Set<string>();
  for (const chain of Object.values(CHAINS)) {
    for (const resolution of [resolveReadRpcUrl(chain, env), resolvePublicRpcUrl(chain, env)]) {
      if (resolution.status === "configured") urls.add(resolution.url);
    }
  }
  return [...urls];
}

/**
 * A failure as one line a script may print. A viem error's `message` lists the transport URL, from which viem strips
 * only basic-auth credentials (a key in the path or the query stays), so only its `shortMessage` is used. Any other
 * error keeps its message, which can still quote a viem message or a node's answer, so every URL and every piece of a
 * configured RPC URL is removed from whatever is printed.
 */
export function failureMessage(error: unknown, env: Env = process.env): string {
  if (!(error instanceof Error)) return "The run failed.";
  const text = error instanceof BaseError ? error.shortMessage : error.message;
  return printable(text, configuredRpcUrls(env));
}

/** Runs an operator script: its exit code is `main`'s, or 1 with the failure printed through `failureMessage`. */
export async function runScript(main: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(failureMessage(error));
    process.exitCode = 1;
  }
}
