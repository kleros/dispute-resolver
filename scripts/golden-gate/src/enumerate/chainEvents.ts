import { getAbiItem } from "viem";
import { erc1497Abi } from "../../../../packages/core/src/abi";
import { evidenceScanStart, readDisputeEvent } from "../../../../packages/core/src/evidence";
import { describeError, getLogsChunked } from "../../../../packages/core/src/rpc";
import type { Address } from "../../../../packages/core/src/types";
import type { ChainReader } from "../chains";
import type { LocatorResult } from "./locator";

const META_EVIDENCE_EVENT = getAbiItem({ abi: erc1497Abi, name: "MetaEvidence" });

/**
 * A dispute's meta-evidence URI read from the chain, for a chain the meta-evidence API does not serve (Chiado, where
 * the API answers 400): the arbitrable's ERC-1497 `Dispute` event names the meta-evidence ID, and the last
 * `MetaEvidence` event with that ID emitted up to the dispute's block holds the URI. This is how the Chiado allowlist was
 * built (packages/core/src/registry/scripts.ts).
 */
export async function locateFromChainEvents(reader: ChainReader, disputeId: bigint, arbitrable: Address): Promise<LocatorResult> {
  const { client, arbitrator, chain } = reader;
  const fromBlock = evidenceScanStart(chain);
  const dispute = await readDisputeEvent({ client, arbitrable, arbitrator, disputeId, fromBlock });
  if (!dispute.ok) return { status: "error", detail: dispute.error.message };
  if (dispute.value.status !== "found") return { status: "missing", detail: `the arbitrable's Dispute event is ${dispute.value.status}` };
  const { metaEvidenceId, blockNumber } = dispute.value.event;
  try {
    const logs = await getLogsChunked(client, { address: arbitrable, event: META_EVIDENCE_EVENT, args: { _metaEvidenceID: metaEvidenceId }, fromBlock, toBlock: blockNumber });
    const uri = logs.at(-1)?.args._evidence;
    return uri ? { status: "uri", uri } : { status: "missing", detail: `no MetaEvidence event with ID ${metaEvidenceId.toString()}` };
  } catch (error) {
    return { status: "error", detail: `Could not read the MetaEvidence events: ${describeError(error)}` };
  }
}
