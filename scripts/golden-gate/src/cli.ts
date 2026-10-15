import { parseArgs } from "node:util";
import { CASE_PAGE_BUDGET_MS } from "../../../packages/core/src/metaEvidence";
import type { ChainId } from "../../../packages/core/src/types";
import { ARBITRATOR_CHAINS } from "./chains";
import type { DisputeKey, GateOptions } from "./gate/report";

/** Today's `DYNAMIC_SCRIPT_TIMEOUT_MS` (spec 9.5). */
export const OLD_RUNNER_TIMEOUT_MS = 180_000;

const DEFAULT_CONCURRENCY = 4;

export const USAGE = `Usage: yarn golden-gate <command> [options]

Commands:
  live        04 §3: select the live tier on chains 1, 100, 11155111 and 10200 -> golden/live.json
  accounts    04 §1: first contributor of every stable and live case -> golden/accounts.json (needs golden/live.json)
  enumerate   C6: every dispute running an allowlisted script -> golden/script-references.json
  gate        C6 / 04 §5: run every referencing dispute in the old and new runners -> golden/gate-log.json, golden/gate-log.md
  all         live, accounts and gate in that order

Options (enumerate, gate; any restriction makes the gate run partial):
  --chains <ids>          comma-separated arbitrator chains (default: 1,100,11155111,10200)
  --disputes <list>       gate only, instead of --chains: comma-separated <chain>:<dispute> pairs, read and run alone
  --cids <cids>           gate only these scripts (a directory CID selects its files)
  --max-per-cid <n>       gate at most the n newest disputes of each script
  --concurrency <n>       disputes run at once (default ${String(DEFAULT_CONCURRENCY)})
  --timeout-ms <ms>       timeout of both runners (default: old ${String(OLD_RUNNER_TIMEOUT_MS)}, new ${String(CASE_PAGE_BUDGET_MS)})
  --reuse-enumeration     gate the disputes of golden/script-references.json instead of enumerating again
  --skip-build            use the existing packages/web/dist instead of building the app`;

export type Command = "live" | "accounts" | "enumerate" | "gate" | "all";

const COMMANDS: ReadonlySet<string> = new Set(["live", "accounts", "enumerate", "gate", "all"]);

export interface CliRequest {
  readonly command: Command;
  readonly gate: GateOptions;
}

function isCommand(value: string): value is Command {
  return COMMANDS.has(value);
}

function positiveInteger(name: string, value: string | undefined): number | null {
  if (value === undefined) return null;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`--${name} must be a positive integer (got "${value}").`);
  return Number(value);
}

function chainList(value: string | undefined): ChainId[] {
  if (value === undefined) return [...ARBITRATOR_CHAINS];
  const chains = value.split(",").map((item) => Number(item.trim()));
  const unknown = chains.filter((chainId) => !ARBITRATOR_CHAINS.includes(chainId));
  if (unknown.length > 0) throw new Error(`--chains accepts only ${ARBITRATOR_CHAINS.join(", ")} (got ${unknown.join(", ")}).`);
  return chains;
}

const DISPUTE_KEY = /^(\d+):(0|[1-9]\d*)$/;

function disputeList(value: string | undefined): DisputeKey[] | null {
  if (value === undefined) return null;
  const keys = value.split(",").map((item) => {
    const match = DISPUTE_KEY.exec(item.trim());
    const chainId = Number(match?.[1]);
    if (match === null || !ARBITRATOR_CHAINS.includes(chainId)) {
      throw new Error(`--disputes takes <chain>:<dispute> pairs on chains ${ARBITRATOR_CHAINS.join(", ")} (got "${item}").`);
    }
    return { chainId, disputeId: Number(match[2]) };
  });
  return keys.filter((key, index) => keys.findIndex((other) => other.chainId === key.chainId && other.disputeId === key.disputeId) === index);
}

/** Parses the command line; throws with a message for the user on anything it does not accept. */
export function parseCommandLine(args: readonly string[]): CliRequest {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: {
      chains: { type: "string" },
      disputes: { type: "string" },
      cids: { type: "string" },
      "max-per-cid": { type: "string" },
      concurrency: { type: "string" },
      "timeout-ms": { type: "string" },
      "reuse-enumeration": { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
    },
  });
  const [command, ...extra] = positionals;
  if (command === undefined || !isCommand(command) || extra.length > 0) throw new Error(USAGE);
  const disputes = disputeList(values.disputes);
  if (disputes !== null && command !== "gate" && command !== "all") throw new Error("--disputes restricts the gate only: use it with gate or all.");
  if (disputes !== null && values.chains !== undefined) throw new Error("--disputes names its chains: use --chains or --disputes, not both.");
  const timeout = positiveInteger("timeout-ms", values["timeout-ms"]);
  const cids = values.cids
    ?.split(",")
    .map((cid) => cid.trim())
    .filter((cid) => cid !== "");
  return {
    command,
    gate: {
      chains: disputes === null ? chainList(values.chains) : [...new Set(disputes.map((key) => key.chainId))],
      disputes,
      cids: cids === undefined || cids.length === 0 ? null : cids,
      maxPerCid: positiveInteger("max-per-cid", values["max-per-cid"]),
      concurrency: positiveInteger("concurrency", values.concurrency) ?? DEFAULT_CONCURRENCY,
      oldTimeoutMs: timeout ?? OLD_RUNNER_TIMEOUT_MS,
      newTimeoutMs: timeout ?? CASE_PAGE_BUDGET_MS,
      reuseEnumeration: values["reuse-enumeration"],
      skipBuild: values["skip-build"],
    },
  };
}
