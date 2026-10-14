import { ongoingScanStart } from "../../../packages/core/src/chains";
import { listOngoingDisputes } from "../../../packages/core/src/disputes";
import type { OngoingDispute } from "../../../packages/core/src/disputes/types";
import type { Address, ChainId, Env, Period } from "../../../packages/core/src/types";
import { ARBITRATOR_CHAINS, openChainReader, type ChainReader } from "./chains";
import { chainContributorReads, readFirstContributor } from "./contributors";

/** The periods the live tier covers (04 §3 step 2): evidence, commit, vote, appeal. */
export const LIVE_PERIODS = [0, 1, 2, 3] as const satisfies readonly Period[];

const APPEAL_PERIOD = 3;

export interface LivePick {
  readonly disputeId: number;
  readonly arbitrable: Address;
  readonly period: Period;
  readonly lastPeriodChange: number;
  /** Appeal period only: the number of `Contribution` events of the pick, `null` for the other periods. */
  readonly contributions: number | null;
  /** Appeal period only: whether a dispute with contributions was found and preferred over the newest. */
  readonly preferredForContributions: boolean;
}

export type LiveSelection = Readonly<Record<`${(typeof LIVE_PERIODS)[number]}`, LivePick | null>>;

export type LiveChainResult =
  | {
      readonly status: "ok";
      readonly chainId: ChainId;
      readonly blockNumber: number;
      readonly scanFromBlock: number;
      readonly openDisputes: number;
      /** Open disputes whose `disputes(id)` could not be read; the Ongoing page reports them too. */
      readonly unreadableDisputes: readonly number[];
      readonly periods: LiveSelection;
    }
  | { readonly status: "failed"; readonly chainId: ChainId; readonly message: string };

function toPick(dispute: OngoingDispute, contributions: number | null, preferredForContributions: boolean): LivePick {
  return {
    disputeId: Number(dispute.id),
    arbitrable: dispute.arbitrated,
    period: dispute.period,
    lastPeriodChange: dispute.lastPeriodChange,
    contributions,
    preferredForContributions,
  };
}

function newestFirstOrder(a: OngoingDispute, b: OngoingDispute): number {
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/**
 * 04 §3 step 2: per period 0 to 3, the newest open dispute in that period (highest ID); in the appeal period the newest
 * one with at least one `Contribution` event, else the newest. `countContributions` rejects on a failed read, so a
 * transport error never silently changes the pick.
 */
export async function selectLiveTier(open: readonly OngoingDispute[], countContributions: (dispute: OngoingDispute) => Promise<number>): Promise<LiveSelection> {
  const newestFirst = [...open].sort(newestFirstOrder);
  const inPeriod = (period: Period) => newestFirst.filter((dispute) => dispute.period === period);
  const pickNewest = (period: Period): LivePick | null => {
    const [newest] = inPeriod(period);
    return newest === undefined ? null : toPick(newest, null, false);
  };
  const pickAppeal = async (): Promise<LivePick | null> => {
    const candidates = inPeriod(APPEAL_PERIOD);
    for (const candidate of candidates) {
      const contributions = await countContributions(candidate);
      if (contributions > 0) return toPick(candidate, contributions, true);
    }
    const [newest] = candidates;
    return newest === undefined ? null : toPick(newest, 0, false);
  };
  return { "0": pickNewest(0), "1": pickNewest(1), "2": pickNewest(2), "3": await pickAppeal() };
}

/** The number of `Contribution` events of an open dispute, through the account-context reads. */
async function countContributions(reader: ChainReader, dispute: OngoingDispute): Promise<number> {
  const record = await readFirstContributor(chainContributorReads(reader), dispute.id);
  if (record.status === "error") throw new Error(`Could not read the contributions of dispute ${dispute.id.toString()}: ${record.message}`);
  return record.status === "contributor" ? record.contributions : 0;
}

/** 04 §3 for one chain, as of the reader's block: the Ongoing page's window and open disputes, then the selection. */
export async function selectLiveChain(reader: ChainReader): Promise<LiveChainResult> {
  const { chainId, client, chain, block } = reader;
  const list = await listOngoingDisputes({ chainId, client }, null);
  if (list.status === "no-arbitrator") return { status: "failed", chainId, message: `Chain ${String(chainId)} has no arbitrator.` };
  if (list.status === "failed") return { status: "failed", chainId, message: list.error.message };
  const periods = await selectLiveTier(list.disputes, (dispute) => countContributions(reader, dispute));
  return {
    status: "ok",
    chainId,
    blockNumber: Number(block),
    scanFromBlock: Number(ongoingScanStart(chain, block)),
    openDisputes: list.disputes.length + list.failedIds.length,
    unreadableDisputes: list.failedIds.map(Number),
    periods,
  };
}

/** The live-tier file (`golden/live.json`). */
export interface LiveFile {
  readonly generatedAt: string;
  readonly source: string;
  readonly chains: readonly LiveChainResult[];
}

/** 04 §3 for every chain with an arbitrator. A chain that fails is recorded as failed; the others still run. */
export async function selectLive(env: Env, redact: (text: string) => string): Promise<LiveFile> {
  const chains = await Promise.all(
    ARBITRATOR_CHAINS.map(async (chainId): Promise<LiveChainResult> => {
      try {
        return await selectLiveChain(await openChainReader(chainId, env));
      } catch (error) {
        return { status: "failed", chainId, message: redact(error instanceof Error ? error.message : String(error)) };
      }
    }),
  );
  return { generatedAt: new Date().toISOString(), source: "docs/parity/04-golden-cases.md §3", chains };
}
