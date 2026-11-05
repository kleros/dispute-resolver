import { zeroAddress } from "viem";
import { klerosLiquidAbi } from "../abi";
import { toRegistryAddress } from "../registry";
import type { Address, Outcome, Period, ReadClient } from "../types";
import { fail, succeed } from "../outcome";
import type { ArbitratorDispute } from "./types";

type DisputeTuple = readonly [bigint, `0x${string}`, bigint, number, bigint, bigint, bigint, boolean];

export function readDisputeStruct(client: ReadClient, arbitrator: Address, disputeId: bigint): Promise<DisputeTuple> {
  return client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "disputes", args: [disputeId] });
}

function isPeriod(value: number): value is Period {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

/**
 * `null` when the struct names no arbitrated contract: KlerosLiquid on Gnosis and Chiado keeps disputes in a mapping, so
 * an ID that was never created reads as a zeroed struct instead of reverting.
 */
export function toArbitratorDispute(disputeId: bigint, tuple: DisputeTuple): Outcome<ArbitratorDispute | null> {
  const [subcourtId, arbitrated, numberOfChoices, period, lastPeriodChange, , , ruled] = tuple;
  if (arbitrated.toLowerCase() === zeroAddress) return succeed(null);
  if (!isPeriod(period)) return fail("invalid-data", `Dispute ${disputeId.toString()} has an unknown period ${String(period)}.`);
  if (lastPeriodChange > BigInt(Number.MAX_SAFE_INTEGER)) return fail("invalid-data", `Dispute ${disputeId.toString()} has an invalid period change time.`);
  return succeed({
    id: disputeId,
    subcourtId,
    arbitrated: toRegistryAddress(arbitrated),
    numberOfChoices,
    period,
    lastPeriodChange: Number(lastPeriodChange),
    ruled,
  });
}
