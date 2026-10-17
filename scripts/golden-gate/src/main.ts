/**
 * The golden-case gate tooling of docs/parity/04-golden-cases.md (§1 account context, §3 live tier, §5 dynamic-script
 * output-equivalence gate, checklist C6). Run through the root script `yarn golden-gate <command>`; `--help` lists the
 * commands. Reads the repository's `.env` (RPC URLs, the meta-evidence API), never prints or writes its values, and
 * writes its outputs under golden/. Exit code 0 when every step passed, 1 otherwise.
 */
import type { Env } from "../../../packages/core/src/types";
import { resolveGateway } from "../../../packages/core/src/uri";
import { extractAccounts } from "./accounts";
import { ARBITRATOR_CHAINS } from "./chains";
import { testnetCheckComplete } from "./enumerate/enumerate";
import { USAGE, parseCommandLine, type CliRequest } from "./cli";
import { createRedactor, loadEnvironment } from "./env";
import { enumerateReferences, runGate } from "./gate/runGate";
import { nodeHttpGet } from "./http";
import { createIpfsReader } from "./ipfs";
import { selectLive, type LivePick } from "./live";
import { toJson, writeTextAtomically } from "./output";
import { ACCOUNTS_FILE, IPFS_CACHE_DIR, LIVE_FILE, REFERENCES_FILE } from "./paths";

type Redact = (text: string) => string;

function log(line: string): void {
  console.info(line);
}

/** A live pick in the run's log: its dispute and the family recorded for it. */
function describePick(pick: LivePick | null): string {
  return pick === null ? "none" : `${String(pick.disputeId)} (${pick.family})`;
}

async function live(env: Env, redact: Redact): Promise<boolean> {
  const file = await selectLive(env, redact);
  writeTextAtomically(LIVE_FILE, redact(toJson(file)));
  for (const chain of file.chains) {
    if (chain.status === "failed") {
      log(`live: chain ${String(chain.chainId)} failed: ${chain.message}`);
      continue;
    }
    const picks = Object.entries(chain.periods).map(([period, pick]) => `period ${period}: ${describePick(pick)}`);
    const governor = `governor appeal (P-04): ${chain.governorAppeal === null ? "none" : String(chain.governorAppeal.disputeId)}`;
    log(`live: chain ${String(chain.chainId)} at block ${String(chain.blockNumber)}: ${[...picks, governor].join(", ")}`);
  }
  log("Wrote golden/live.json.");
  return file.chains.every((chain) => chain.status === "ok");
}

async function accounts(env: Env, redact: Redact): Promise<boolean> {
  const file = await extractAccounts(env, redact);
  writeTextAtomically(ACCOUNTS_FILE, redact(toJson(file)));
  const withAccount = file.entries.filter((entry) => entry.account !== null).length;
  log(`accounts: ${String(file.entries.length)} cases, ${String(withAccount)} with a contributor, ${String(file.errors)} unread. Wrote golden/accounts.json.`);
  for (const { key, record } of file.entries) {
    if (record.status === "error") log(`accounts: ${key}: ${record.message}`);
    // MC-7: a funded governor case has contributors no event names, so it runs with no account; say so on every run.
    if (record.status === "governor-funded") log(`accounts: ${key}: ${record.reason}`);
  }
  return file.errors === 0;
}

async function enumerate(env: Env, request: CliRequest, redact: Redact): Promise<boolean> {
  const ipfs = createIpfsReader({ gateway: resolveGateway(env), get: nodeHttpGet, cacheDir: IPFS_CACHE_DIR });
  const references = await enumerateReferences(env, request.gate.chains, ipfs, (line) => {
    log(redact(line));
  });
  writeTextAtomically(REFERENCES_FILE, redact(toJson(references)));
  const unread = references.chains.reduce((total, chain) => total + (chain.statusCounts["read-error"] ?? 0), 0);
  log(`enumerate: ${String(references.references.length)} disputes run an allowlisted script, ${String(unread)} disputes unread. Wrote golden/script-references.json.`);
  for (const item of references.testnetRealityCheck.missing) {
    log(`enumerate: listed testnet Reality dispute ${item.key}: the meta-evidence API's answer gives ${item.status}; its own events give ${item.onChain ?? "not read"}.`);
  }
  const partial = !ARBITRATOR_CHAINS.every((chainId) => request.gate.chains.includes(chainId));
  return unread === 0 && testnetCheckComplete(references.testnetRealityCheck, partial);
}

async function gate(env: Env, request: CliRequest, redact: Redact): Promise<boolean> {
  const result = await runGate(env, request.gate, redact, (line) => {
    log(redact(line));
  });
  const { summary } = result;
  log(
    `gate: ${result.passed ? "PASSED" : "NOT PASSED"}${result.partial ? " (partial run)" : ""}: ${String(summary.runs)} runs, ${String(summary.passed)} passed, ${String(summary.forReview)} for review, ${String(summary.failed)} failed; ${String(result.unexercised.length)} allowlisted scripts unexercised. Wrote golden/gate-log.json and golden/gate-log.md.`,
  );
  return result.passed;
}

type Handler = (env: Env, request: CliRequest, redact: Redact) => Promise<boolean>;

const HANDLERS: Readonly<Record<CliRequest["command"], Handler>> = {
  live: (env, _request, redact) => live(env, redact),
  accounts: (env, _request, redact) => accounts(env, redact),
  enumerate,
  gate,
  all: async (env, request, redact) => {
    const liveOk = await live(env, redact);
    const accountsOk = await accounts(env, redact);
    const gateOk = await gate(env, request, redact);
    return liveOk && accountsOk && gateOk;
  },
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    log(USAGE);
    return 0;
  }
  const request = parseCommandLine(args);
  const env = loadEnvironment();
  const redact = createRedactor(env);
  try {
    return (await HANDLERS[request.command](env, request, redact)) ? 0 : 1;
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
