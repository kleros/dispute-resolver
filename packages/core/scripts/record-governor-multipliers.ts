/**
 * Recorder of `appeals/__fixtures__/governor-multipliers.json`: the raw `eth_call` replies of every
 * multiplier getter of the four deployed governors (poh.eth, ubi-voting.eth, kleros.eth on chain 1, fork-dao.eth on
 * chain 100, the list of `governor-sessions-abi.json`), each read at one pinned block per chain.
 *
 * Usage (from the repository root):
 *   yarn workspace @dispute-resolver/core tsx scripts/record-governor-multipliers.ts            re-record at the pinned blocks
 *   yarn workspace @dispute-resolver/core tsx scripts/record-governor-multipliers.ts --repin    pin each chain's latest finalized block
 *   yarn workspace @dispute-resolver/core tsx scripts/record-governor-multipliers.ts --check    compare the file with the chain, without writing
 *
 * Without a file, the blocks are the latest finalized ones. Reading at an old block needs an archive node. Exit code 0
 * when the file was written or, with `--check`, matches the chain; 1 on a difference, an unknown argument or any failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { toFunctionSelector } from "viem";
import { z } from "zod";
import type { ChainId } from "../src/types";
import { failureMessage } from "./failureMessage";
import { finalizedBlock, loadRepositoryEnv, rawRpcFor, type RecordedReply } from "./recordingRpc";

const FIXTURES = resolve(import.meta.dirname, "../src/appeals/__fixtures__");
const OUTPUT_FILE = resolve(FIXTURES, "governor-multipliers.json");
const GOVERNORS_FILE = resolve(FIXTURES, "governor-sessions-abi.json");

/** The getters `readMultipliers` tries, plus `sharedMultiplier()`. */
const GETTERS = [
  "getMultipliers()",
  "winnerStakeMultiplier()",
  "winnerMultiplier()",
  "loserStakeMultiplier()",
  "loserMultiplier()",
  "denominator()",
  "MULTIPLIER_DIVISOR()",
  "MULTIPLIER_DENOMINATOR()",
  "loserAppealPeriodMultiplier()",
  "sharedMultiplier()",
] as const;

const PROVENANCE =
  "Raw JSON-RPC replies of eth_call with each multiplier getter selector and sharedMultiplier(), no arguments, sent to each chain's read RPC at that chain's pinned block (chains[].blockNumber), recorded 2026-10-14 by packages/core/scripts/record-governor-multipliers.ts. A result of \"0x\" is a contract whose fallback function answers any unknown selector with no data.";

const governorList = z.object({ governors: z.array(z.object({ label: z.string(), chainId: z.number(), address: z.string() })) });
const reply = z.union([z.object({ result: z.string() }), z.object({ error: z.object({ code: z.number(), message: z.string() }) })]);
const recording = z.object({
  provenance: z.string(),
  chains: z.array(z.object({ chainId: z.number(), blockNumber: z.number() })),
  contracts: z.array(z.object({ label: z.string(), chainId: z.number(), address: z.string(), calls: z.record(z.string(), reply) })),
});

type Recording = z.infer<typeof recording>;
type Mode = "record" | "repin" | "check";

const FLAGS: Readonly<Record<string, Mode>> = { "--repin": "repin", "--check": "check" };

function modeOf(args: readonly string[]): Mode {
  const [flag, ...rest] = args;
  if (flag === undefined) return "record";
  const mode = FLAGS[flag];
  if (mode === undefined || rest.length > 0) throw new Error(`Usage: record-governor-multipliers [--repin | --check] (got ${args.join(" ")})`);
  return mode;
}

function readRecorded(): Recording | undefined {
  try {
    return recording.parse(JSON.parse(readFileSync(OUTPUT_FILE, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** The block each chain is read at: the recorded one, unless re-pinning or no file exists. */
async function pinnedBlocks(chainIds: readonly ChainId[], previous: Recording | undefined, mode: Mode): Promise<Map<ChainId, bigint>> {
  const entries = await Promise.all(
    chainIds.map(async (chainId) => {
      const recorded = previous?.chains.find((chain) => chain.chainId === chainId);
      const block = mode !== "repin" && recorded !== undefined ? BigInt(recorded.blockNumber) : await finalizedBlock(rawRpcFor(chainId));
      return [chainId, block] as const;
    }),
  );
  return new Map(entries);
}

async function record(previous: Recording | undefined, mode: Mode): Promise<Recording> {
  const { governors } = governorList.parse(JSON.parse(readFileSync(GOVERNORS_FILE, "utf8")));
  const chainIds = [...new Set(governors.map((governor) => governor.chainId))];
  const blocks = await pinnedBlocks(chainIds, previous, mode);
  const contracts: Recording["contracts"] = [];
  for (const governor of governors) {
    const block = blocks.get(governor.chainId);
    if (block === undefined) throw new Error(`No pinned block for chain ${String(governor.chainId)}.`);
    const rpc = rawRpcFor(governor.chainId);
    const calls: Record<string, RecordedReply> = {};
    for (const getter of GETTERS) calls[getter] = await rpc.call(governor.address, toFunctionSelector(getter), block);
    contracts.push({ label: governor.label, chainId: governor.chainId, address: governor.address, calls });
  }
  return { provenance: PROVENANCE, chains: chainIds.map((chainId) => ({ chainId, blockNumber: Number(blocks.get(chainId)) })), contracts };
}

async function main(): Promise<number> {
  const mode = modeOf(process.argv.slice(2));
  loadRepositoryEnv();
  const previous = readRecorded();
  if (mode === "check" && previous === undefined) throw new Error("There is no governor-multipliers.json to check.");
  const recorded = await record(previous, mode);
  const source = `${JSON.stringify(recorded, null, 2)}\n`;
  if (mode === "check") {
    if (readFileSync(OUTPUT_FILE, "utf8") !== source) {
      console.error("governor-multipliers.json does not match the chain data at its pinned blocks.");
      return 1;
    }
    console.info(`governor-multipliers.json matches the chain at ${JSON.stringify(recorded.chains)}.`);
    return 0;
  }
  writeFileSync(OUTPUT_FILE, source);
  console.info(`Wrote ${String(recorded.contracts.length)} governors at ${JSON.stringify(recorded.chains)}.`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(failureMessage(error));
  process.exitCode = 1;
}
