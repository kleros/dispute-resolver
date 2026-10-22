import { getChain } from "../chains";
import { describeError, isContractFailure } from "../rpc";
import type { Address, ChainId } from "../types";
import { NETWORK_DATA_UNAVAILABLE } from "./outcome";
import { readDisputeStruct, toArbitratorDispute } from "./struct";
import type { ArbitratedBinding, ArbitratorDispute, DisputeLookup, DisputeReadContext } from "./types";

const UINT256_MAX = 2n ** 256n - 1n;

/** The brand cannot be named outside its type declaration, so the object is asserted to the branded type here and nowhere else. */
function bindDispute(chainId: ChainId, arbitrator: Address, dispute: ArbitratorDispute): ArbitratedBinding {
  return { chainId, disputeId: dispute.id, arbitrator, arbitrated: dispute.arbitrated } as ArbitratedBinding;
}

/**
 * A contract failure of `disputes(id)` (out of range) or a struct without an arbitrated contract is `not-found`; a
 * transport failure is `unavailable`, never "does not exist".
 */
export async function lookupDispute(context: DisputeReadContext, disputeId: bigint): Promise<DisputeLookup> {
  const arbitrator = getChain(context.chainId)?.klerosLiquid;
  if (arbitrator === undefined) return { status: "no-arbitrator" };
  const { client, signal } = context;
  if (client === undefined) return { status: "unavailable", error: { code: "no-rpc", message: NETWORK_DATA_UNAVAILABLE } };
  if (disputeId < 0n || disputeId > UINT256_MAX) return { status: "not-found" };
  let tuple;
  try {
    signal?.throwIfAborted();
    tuple = await readDisputeStruct(client, arbitrator, disputeId);
  } catch (error) {
    if (isContractFailure(error)) return { status: "not-found" };
    return { status: "unavailable", error: { code: "rpc-error", message: `Could not read the dispute: ${describeError(error)}` } };
  }
  const dispute = toArbitratorDispute(disputeId, tuple);
  if (!dispute.ok) return { status: "unavailable", error: dispute.error };
  if (dispute.value === null) return { status: "not-found" };
  return { status: "found", dispute: dispute.value, binding: bindDispute(context.chainId, arbitrator, dispute.value) };
}
