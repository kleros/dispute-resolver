import { klerosLiquidAbi } from "../abi";
import { fail, readOutcome } from "../disputes/outcome";
import type { ArbitratedBinding } from "../disputes/types";
import type { Outcome, ReadClient } from "../types";

/**
 * The arbitrator's appeal cost, read again right before an appeal is built: the cost read with the page can change
 * before the user presses Appeal. Never rejects.
 */
export function readAppealCost(context: { readonly client: ReadClient | undefined; readonly signal?: AbortSignal }, binding: ArbitratedBinding): Promise<Outcome<bigint>> {
  const { client, signal } = context;
  if (client === undefined) return Promise.resolve(fail("no-rpc", "The appeal cost could not be read."));
  const { arbitrator, disputeId, chainId } = binding;
  return readOutcome(
    "the appeal cost",
    chainId,
    () => client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "appealCost", args: [disputeId, "0x"] }),
    signal,
  );
}
