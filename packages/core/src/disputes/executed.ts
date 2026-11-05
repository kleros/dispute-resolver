import { getAbiItem } from "viem";
import { erc792Abi } from "../abi";
import { NETWORK_DATA_UNAVAILABLE } from "../outcome";
import { describeError, getLogsChunked, isTooManyLogsError } from "../rpc";
import { z } from "../zod";
import type { ArbitratedBinding, ArbitratorDispute, DisputeReadContext, ExecutedRuling } from "./types";

const RULING_EVENT = getAbiItem({ abi: erc792Abi, name: "Ruling" });

/** A contract emits one Ruling event per executed dispute; past this many the reports are not trusted at all. */
const MAX_RULING_LOGS = 8;

const rulingLogSchema = z.object({
  address: z.string(),
  args: z.object({ _arbitrator: z.string(), _disputeID: z.bigint(), _ruling: z.bigint() }),
});

/**
 * Whether the dispute's choices can hold `ruling`. Jurors vote at most the choice count, and the Reality.eth proxies that
 * take appeals open their disputes with the whole uint256 range, so their reserved answers stay in range.
 */
function withinChoices(ruling: bigint, dispute: ArbitratorDispute): boolean {
  return ruling <= dispute.numberOfChoices;
}

function fromLogs(logs: readonly unknown[], binding: ArbitratedBinding, dispute: ArbitratorDispute): ExecutedRuling {
  const rulings = new Set<bigint>();
  for (const log of logs) {
    const parsed = rulingLogSchema.safeParse(log);
    if (!parsed.success) return { status: "inconsistent" };
    const { address, args } = parsed.data;
    const matches = address.toLowerCase() === binding.arbitrated && args._arbitrator.toLowerCase() === binding.arbitrator && args._disputeID === binding.disputeId;
    if (matches) rulings.add(args._ruling);
  }
  const [ruling] = rulings;
  if (ruling === undefined) return { status: "none-reported" };
  if (rulings.size > 1) return { status: "inconsistent" };
  return withinChoices(ruling, dispute) ? { status: "executed", ruling } : { status: "out-of-range", ruling };
}

/**
 * The ruling the arbitrable reports it executed: its ERC-792 `Ruling` events for this arbitrator and dispute, from
 * `fromBlock` (the last round's start) to the head. Read only in execution once the arbitrator has executed the ruling,
 * and only from the arbitrable the arbitrator names. Never rejects: a failed scan is `unread`, never "none reported".
 */
export async function readExecutedRuling(
  context: DisputeReadContext,
  input: { readonly binding: ArbitratedBinding; readonly dispute: ArbitratorDispute; readonly fromBlock: bigint },
): Promise<ExecutedRuling> {
  const { binding, dispute, fromBlock } = input;
  if (dispute.period !== 4 || !dispute.ruled) return { status: "not-executed" };
  const { client, signal } = context;
  if (client === undefined) return { status: "unread", error: { code: "no-rpc", message: NETWORK_DATA_UNAVAILABLE } };
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    const logs = await getLogsChunked(
      client,
      { address: binding.arbitrated, event: RULING_EVENT, args: { _arbitrator: binding.arbitrator, _disputeID: binding.disputeId }, fromBlock, toBlock: head },
      { signal, maxLogs: MAX_RULING_LOGS },
    );
    return fromLogs(logs, binding, dispute);
  } catch (error) {
    if (isTooManyLogsError(error)) return { status: "inconsistent" };
    return { status: "unread", error: { code: "rpc-error", message: `Could not read the executed ruling: ${describeError(error)}` } };
  }
}
