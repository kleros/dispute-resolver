import { existsSync } from "node:fs";
import { z } from "zod";
import type { ChainId, Env } from "../../../packages/core/src/types";
import { caseKey, loadStableTier, type CaseTier, type GoldenCase } from "./cases";
import { openChainReader } from "./chains";
import { mapWithConcurrency } from "./concurrency";
import { chainContributorReads, readFirstContributor, type ContributorRecord } from "./contributors";
import { readJson } from "./output";
import { LIVE_FILE } from "./paths";

/** Contributor reads in flight per chain. */
const READS_PER_CHAIN = 4;

const livePickSchema = z.object({ disputeId: z.number().int().nonnegative() });

/** The period of P-04's governor pick: the appeal period. */
const GOVERNOR_APPEAL_PERIOD = 3;

const liveFileSchema = z.object({
  generatedAt: z.string(),
  chains: z.array(
    z.discriminatedUnion("status", [
      z.object({
        status: z.literal("ok"),
        chainId: z.number().int(),
        blockNumber: z.number().int(),
        periods: z.record(z.string(), livePickSchema.nullable()),
        /** P-04's governor pick; absent from a selection written before it existed. */
        governorAppeal: livePickSchema.nullable().optional(),
      }),
      z.object({ status: z.literal("failed"), chainId: z.number().int(), message: z.string() }),
    ]),
  ),
});

export interface LiveCase extends GoldenCase {
  readonly livePeriod: number;
}

/**
 * The live-tier cases of `golden/live.json`, one per selected period and one for P-04's governor pick, and when the
 * selection was taken.
 */
export function parseLiveCases(value: unknown): { readonly generatedAt: string; readonly cases: LiveCase[] } {
  const live = liveFileSchema.parse(value);
  const cases = live.chains.flatMap((chain) => {
    if (chain.status !== "ok") return [];
    const picks = [
      ...Object.entries(chain.periods).map(([period, pick]) => ({ livePeriod: Number(period), pick })),
      { livePeriod: GOVERNOR_APPEAL_PERIOD, pick: chain.governorAppeal ?? null },
    ];
    return picks.flatMap(({ livePeriod, pick }) => (pick === null ? [] : [{ chainId: chain.chainId, disputeId: BigInt(pick.disputeId), tier: "live" as const, livePeriod }]));
  });
  return { generatedAt: live.generatedAt, cases };
}

/** One case of `golden/accounts.json`. */
export interface AccountEntry {
  readonly key: string;
  readonly chainId: ChainId;
  readonly disputeId: number;
  readonly tier: CaseTier;
  readonly livePeriods: readonly number[];
  readonly account: string | null;
  readonly record: ContributorRecord;
}

export interface AccountsFile {
  readonly generatedAt: string;
  readonly source: string;
  readonly liveSelectionTakenAt: string | null;
  readonly blocks: Readonly<Record<string, number>>;
  readonly entries: readonly AccountEntry[];
  readonly errors: number;
}

/**
 * Merges the stable and live cases: a dispute selected for the live tier that is also a stable case keeps its stable
 * tier and records the live periods it was picked for, each once (P-04's governor pick can repeat 04 §3's appeal pick).
 */
export function mergeCases(stable: readonly GoldenCase[], live: readonly LiveCase[]): { readonly item: GoldenCase; readonly livePeriods: number[] }[] {
  const merged = new Map<string, { item: GoldenCase; livePeriods: number[] }>();
  for (const item of stable) merged.set(caseKey(item.chainId, item.disputeId), { item, livePeriods: [] });
  for (const item of live) {
    const key = caseKey(item.chainId, item.disputeId);
    const existing = merged.get(key);
    if (existing === undefined) merged.set(key, { item, livePeriods: [item.livePeriod] });
    else if (!existing.livePeriods.includes(item.livePeriod)) existing.livePeriods.push(item.livePeriod);
  }
  return [...merged.values()].sort((a, b) => a.item.chainId - b.item.chainId || (a.item.disputeId < b.item.disputeId ? -1 : 1));
}

/**
 * 04 §1's account context: for every stable-tier case and every live-tier case of `golden/live.json`, the first
 * contributor of its `Contribution` events, or no account. Each chain is read as of one recorded block.
 */
export async function extractAccounts(env: Env, redact: (text: string) => string): Promise<AccountsFile> {
  if (!existsSync(LIVE_FILE)) throw new Error("golden/live.json does not exist: run `yarn golden-gate live` first, so the live-tier cases get their accounts too.");
  const live = parseLiveCases(readJson(LIVE_FILE));
  const cases = mergeCases(loadStableTier(), live.cases);
  const chainIds = [...new Set(cases.map(({ item }) => item.chainId))];
  const blocks: Record<string, number> = {};
  const entries: AccountEntry[] = [];
  for (const chainId of chainIds) {
    const reader = await openChainReader(chainId, env);
    blocks[String(chainId)] = Number(reader.block);
    const reads = chainContributorReads(reader);
    const chainCases = cases.filter(({ item }) => item.chainId === chainId);
    const read = await mapWithConcurrency(chainCases, READS_PER_CHAIN, async (entry) => ({ ...entry, found: await readFirstContributor(reads, entry.item.disputeId) }));
    for (const { item, livePeriods, found } of read) {
      const record: ContributorRecord = found.status === "error" ? { ...found, message: redact(found.message) } : found;
      entries.push({ key: caseKey(chainId, item.disputeId), chainId, disputeId: Number(item.disputeId), tier: item.tier, livePeriods, account: record.account, record });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    source: "docs/parity/04-golden-cases.md §1 (account context)",
    liveSelectionTakenAt: live.generatedAt,
    blocks,
    entries,
    errors: entries.filter((entry) => entry.record.status === "error").length,
  };
}
