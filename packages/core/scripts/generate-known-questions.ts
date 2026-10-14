/**
 * The known-questions generator (A6, REALITY_OPS.md): regenerates `src/reality/knownQuestions.generated.ts`, the
 * Reality.eth question of every dispute created by the registered Reality.eth proxies (`REGISTRY.realityProxies`), up to
 * the latest finalized block of each arbitrator chain. Read-only RPC calls through the read clients of `CHAINS`, built
 * from the environment (06 §3 invariant 3); the repository's `.env` is read when present, the environment winning.
 *
 * Usage (run through tsx by the package scripts):
 *   reality:known-questions           incremental update to the latest finalized blocks
 *   reality:known-questions --full    rescan everything from the deployment blocks
 *   reality:known-questions:check     recompute at the committed snapshot blocks, without writing
 *
 * Exit code 0 when the file was written or, with `--check`, matches the chain data; 1 when `--check` finds a
 * difference, on an unknown argument, or on any failure (a missing RPC, an RPC error, an inconsistency in the chain data).
 * Operator tooling: the only core code that reads `process.env`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BaseError } from "viem";
import { KNOWN_DISPUTE_QUESTIONS, REGISTRY_SNAPSHOT_BLOCKS, generateKnownQuestions, renderKnownQuestionsModule, type GeneratorMode } from "../src/reality";
import { REGISTRY } from "../src/registry";
import { createReadClients, describeError } from "../src/rpc";

const GENERATED_FILE = resolve(import.meta.dirname, "../src/reality/knownQuestions.generated.ts");
const ENV_FILE = resolve(import.meta.dirname, "../../../.env");
const FLAGS: Readonly<Record<string, GeneratorMode>> = { "--full": "full", "--check": "check" };

/** The mode named by the arguments: none is `incremental`, else exactly one of `--full` and `--check`. */
function modeOf(args: readonly string[]): GeneratorMode {
  const [flag, ...rest] = args;
  if (flag === undefined) return "incremental";
  const mode = FLAGS[flag];
  if (mode === undefined || rest.length > 0) throw new Error(`Usage: generate-known-questions [--full | --check] (got ${args.join(" ")})`);
  return mode;
}

/** A failure's reason without the RPC URL a viem error's full message carries, which can hold an API key. */
function reasonOf(error: unknown): string {
  return error instanceof Error && !(error instanceof BaseError) ? error.message : describeError(error);
}

async function main(): Promise<number> {
  const mode = modeOf(process.argv.slice(2));
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const data = await generateKnownQuestions({
    proxies: REGISTRY.realityProxies,
    previous: { snapshotBlocks: REGISTRY_SNAPSHOT_BLOCKS, questions: KNOWN_DISPUTE_QUESTIONS },
    mode,
    clients: createReadClients(process.env),
    onProgress: (line) => {
      console.info(line);
    },
  });
  const source = renderKnownQuestionsModule(data);
  const disputes = Object.keys(data.questions).length;
  if (mode === "check") {
    if (readFileSync(GENERATED_FILE, "utf8") !== source) {
      console.error("src/reality/knownQuestions.generated.ts does not match the chain data at its snapshot blocks.");
      return 1;
    }
    console.info(`src/reality/knownQuestions.generated.ts is up to date (${String(disputes)} disputes).`);
    return 0;
  }
  writeFileSync(GENERATED_FILE, source);
  console.info(`Wrote ${String(disputes)} disputes at snapshot blocks ${JSON.stringify(data.snapshotBlocks)}.`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(reasonOf(error));
  process.exitCode = 1;
}
