import { describeError, getLogsChunked } from "../rpc";
import type { Outcome } from "../types";
import { CONTRIBUTION_EVENT, RULING_FUNDED_EVENT, checkContext, governorSession, idrLocalId } from "./context";
import { readGovernorRound } from "./governor";
import { fail, failedRead, succeed } from "./outcome";
import type { AppealContext, RoundFunding, RulingAmount } from "./types";

function byRuling(a: RulingAmount, b: RulingAmount): number {
  if (a.ruling === b.ruling) return 0;
  return a.ruling < b.ruling ? -1 : 1;
}

/**
 * `Contribution(localId, round)` amounts summed per ruling and the `RulingFunded(localId, round)` rulings in event order,
 * scanned on the arbitrable from `fromBlock` to the head through the chunked scan (D-02): the same range on every reload,
 * however long after the round's start a contribution came.
 */
async function readResolverFunding(context: AppealContext, round: bigint, fromBlock: bigint): Promise<Outcome<RoundFunding>> {
  const localId = idrLocalId(context.localId);
  if (!localId.ok) return localId;
  const { client, binding, signal } = context;
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    const scan = { address: binding.arbitrated, args: { _localDisputeID: localId.value, _round: round }, fromBlock, toBlock: head };
    const [contributionLogs, fundedLogs] = await Promise.all([
      getLogsChunked(client, { ...scan, event: CONTRIBUTION_EVENT }, { signal }),
      getLogsChunked(client, { ...scan, event: RULING_FUNDED_EVENT }, { signal }),
    ]);
    const totals = new Map<bigint, bigint>();
    for (const { args } of contributionLogs) {
      if (args.ruling === undefined || args._amount === undefined) return fail("invalid-data", "A Contribution event of the arbitrable could not be decoded.");
      totals.set(args.ruling, (totals.get(args.ruling) ?? 0n) + args._amount);
    }
    const fundedRulings: bigint[] = [];
    for (const { args } of fundedLogs) {
      if (args._ruling === undefined) return fail("invalid-data", "A RulingFunded event of the arbitrable could not be decoded.");
      fundedRulings.push(args._ruling);
    }
    const contributions = [...totals].map(([ruling, amount]) => ({ ruling, amount })).sort(byRuling);
    return succeed({ round, contributions, fundedRulings });
  } catch (error) {
    return fail("rpc-error", `Could not read the appeal funding: ${describeError(error)}`);
  }
}

/**
 * The governor dialect (D-47): `getRoundInfo(session, round)`, list index i being ruling i + 1 (verified source). The
 * fees paid per list are the contributions and the fully paid lists the funded rulings.
 */
async function readGovernorFunding(context: AppealContext, round: bigint): Promise<Outcome<RoundFunding>> {
  const session = governorSession(context);
  if (!session.ok) return session;
  const { client, binding, signal } = context;
  try {
    signal?.throwIfAborted();
    const info = await readGovernorRound(client, binding.arbitrated, session.value, round);
    const contributions = info.paidFees.flatMap((amount, index) => (amount > 0n ? [{ ruling: BigInt(index + 1), amount }] : []));
    const fundedRulings = info.hasPaid.flatMap((paid, index) => (paid ? [BigInt(index + 1)] : []));
    return succeed({ round, contributions, fundedRulings });
  } catch (error) {
    return failedRead("the governor's appeal round", error);
  }
}

/**
 * The funding of one round (D-02, D-30, D-47): for the IDisputeResolver families the `Contribution` and `RulingFunded`
 * events of the round, which need a resolved local ID; for governors the round of the dispute's session. Other
 * families have no funding to read (`unsupported`). Never rejects: a failed read is a failed `Outcome`, never an
 * empty funding (D-36).
 */
export function readRoundFunding(context: AppealContext, round: bigint, fromBlock: bigint): Promise<Outcome<RoundFunding>> {
  const checked = checkContext(context);
  if (!checked.ok) return Promise.resolve(checked);
  switch (context.family.capabilities.appeal.kind) {
    case "idr":
      return readResolverFunding(context, round, fromBlock);
    case "governor":
      return readGovernorFunding(context, round);
    case "escrow-pay-cost":
    case "none":
      return Promise.resolve(fail("unsupported", "This arbitrable has no crowdfunded appeal funding to read."));
  }
}
