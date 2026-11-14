import { idrV1Abi, idrV2Abi } from "../abi";
import { getLogsChunked, readFailure } from "../rpc";
import { compareBigint } from "../bigint";
import type { Address, Unavailable } from "../types";
import { CONTRIBUTION_EVENT, checkContext, governorSession, idrLocalId } from "./context";
import { governorReward, readGovernorContributions, readGovernorRound, readGovernorSession } from "./governor";
import type { AppealContext, WithdrawItem, WithdrawState } from "./types";

interface WithdrawRequest {
  readonly beneficiary: Address;
  readonly rounds: readonly bigint[];
  readonly roundStartBlocks: readonly bigint[];
}

function unavailableState(error: Unavailable): WithdrawState {
  return { status: "unavailable", error };
}

function settled(beneficiary: Address, items: readonly WithdrawItem[]): WithdrawState {
  const withdrawable = items.filter((item) => item.amount > 0n);
  if (withdrawable.length === 0) return { status: "nothing" };
  return { status: "available", beneficiary, total: withdrawable.reduce((sum, item) => sum + item.amount, 0n), items: withdrawable };
}

/**
 * The rulings the beneficiary contributed to in `rounds`, from its own `Contribution` logs, scanned once from the
 * earliest round start to the head.
 */
async function contributedRulings(context: AppealContext, localId: bigint, request: WithdrawRequest): Promise<readonly bigint[] | null> {
  const { client, binding, signal } = context;
  const head = await client.getBlockNumber();
  const fromBlock = request.roundStartBlocks.reduce((earliest, block) => (block < earliest ? block : earliest));
  const logs = await getLogsChunked(
    client,
    {
      address: binding.arbitrated,
      event: CONTRIBUTION_EVENT,
      args: { _localDisputeID: localId, _round: [...request.rounds], _contributor: request.beneficiary },
      fromBlock,
      toBlock: head,
    },
    { signal },
  );
  const rulings = new Set<bigint>();
  for (const { args } of logs) {
    if (args.ruling === undefined) return null;
    rulings.add(args.ruling);
  }
  return [...rulings].sort(compareBigint);
}

/** `getTotalWithdrawableAmount` per contributed ruling: a single ruling on v2, a one-ruling array on v1. */
async function readResolverWithdrawable(context: AppealContext, dialect: "idr-v2" | "idr-v1", request: WithdrawRequest): Promise<WithdrawState> {
  const localId = idrLocalId(context.localId);
  if (!localId.ok) return unavailableState(localId.error);
  const { client, binding, signal } = context;
  const { beneficiary } = request;
  try {
    signal?.throwIfAborted();
    const rulings = await contributedRulings(context, localId.value, request);
    if (rulings === null) return unavailableState({ code: "invalid-data", message: "A Contribution event of the arbitrable could not be decoded." });
    const address = binding.arbitrated;
    const items = await Promise.all(
      rulings.map(async (ruling): Promise<WithdrawItem> => {
        const amount =
          dialect === "idr-v2"
            ? await client.readContract({ address, abi: idrV2Abi, functionName: "getTotalWithdrawableAmount", args: [localId.value, beneficiary, ruling] })
            : await client.readContract({ address, abi: idrV1Abi, functionName: "getTotalWithdrawableAmount", args: [localId.value, beneficiary, [ruling]] });
        return { dialect, ruling, amount };
      }),
    );
    return settled(beneficiary, items);
  } catch (error) {
    return unavailableState(readFailure("the withdrawable amount", error, binding.chainId));
  }
}

/**
 * The governor dialect: `sessions(session)` must name this dispute; nothing until the arbitrator has executed the
 * ruling, which resolves the session; then, per round, the beneficiary's contributions per list index rewarded under the
 * session's settled ruling (never the arbitrator's `currentRuling`, which a one-sided final round overrides).
 */
async function readGovernorWithdrawable(context: AppealContext, request: WithdrawRequest): Promise<WithdrawState> {
  const session = governorSession(context);
  if (!session.ok) return unavailableState(session.error);
  const { client, binding, signal } = context;
  const { beneficiary } = request;
  try {
    signal?.throwIfAborted();
    const resolution = await readGovernorSession(client, binding.arbitrated, session.value);
    if (resolution.disputeId !== binding.disputeId) return unavailableState({ code: "invalid-data", message: "The governor session does not belong to this dispute." });
    if (!resolution.resolved) return { status: "nothing" };
    const perRound = await Promise.all(
      request.rounds.map(async (round): Promise<WithdrawItem[]> => {
        const [info, contributions] = await Promise.all([
          readGovernorRound(client, binding.arbitrated, session.value, round),
          readGovernorContributions(client, binding.arbitrated, session.value, round, beneficiary),
        ]);
        return contributions.map((contribution, listIndex) => ({
          dialect: "governor",
          session: session.value,
          round,
          listIndex: BigInt(listIndex),
          amount: contribution > 0n ? governorReward(info, contribution, listIndex, resolution.ruling) : 0n,
        }));
      }),
    );
    return settled(beneficiary, perRound.flat());
  } catch (error) {
    return unavailableState(readFailure("the withdrawable amount", error, binding.chainId));
  }
}

/**
 * Each of `rounds` starts at the block of the same index in `roundStartBlocks`. Never rejects: a failed read is
 * `unavailable`, never zero.
 */
export async function readWithdrawable(
  context: AppealContext,
  input: { readonly beneficiary: Address | undefined; readonly rounds: readonly bigint[]; readonly roundStartBlocks: readonly bigint[] },
): Promise<WithdrawState> {
  const { beneficiary, rounds, roundStartBlocks } = input;
  if (beneficiary === undefined) return { status: "no-account" };
  const checked = checkContext(context);
  if (!checked.ok) return unavailableState(checked.error);
  if (rounds.length !== roundStartBlocks.length) return unavailableState({ code: "invalid-data", message: "Every round needs its start block." });
  const withdraw = context.family.capabilities.withdraw.kind;
  if (withdraw !== "idr-v2" && withdraw !== "idr-v1" && withdraw !== "governor") {
    return unavailableState({ code: "unsupported", message: "Withdrawals are not supported through the resolver for this arbitrable." });
  }
  if (rounds.length === 0) return { status: "nothing" };
  const request = { beneficiary, rounds, roundStartBlocks };
  return withdraw === "governor" ? readGovernorWithdrawable(context, request) : readResolverWithdrawable(context, withdraw, request);
}
