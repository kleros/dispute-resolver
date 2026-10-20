import { getAbiItem } from "viem";
import { erc1497Abi } from "../abi";
import type { ChainConfig } from "../chains/types";
import { toRegistryAddress } from "../registry";
import { describeError, getLogsChunked } from "../rpc";
import type { Address, Outcome, ReadClient } from "../types";
import { fail, succeed } from "./outcome";
import type { DisputeEventResult, EvidenceLog, MetaEvidenceEventResult } from "./types";

const DISPUTE_EVENT = getAbiItem({ abi: erc1497Abi, name: "Dispute" });
const META_EVIDENCE_EVENT = getAbiItem({ abi: erc1497Abi, name: "MetaEvidence" });
const EVIDENCE_EVENT = getAbiItem({ abi: erc1497Abi, name: "Evidence" });

interface ScanRequest {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}

/** The Evidence logs of one evidence group, and how many matching logs could not be decoded. */
export interface EvidenceScan {
  readonly logs: readonly EvidenceLog[];
  readonly undecodable: number;
}

/**
 * First block of the Dispute-event and Evidence scans (MODULES.md choice 3, proposal P-01): the chain's arbitrator
 * deployment block, or 0, on every chain. Today's testnet scans start at `head − lookback` and miss older disputes.
 */
export function evidenceScanStart(chain: ChainConfig): bigint {
  return BigInt(chain.arbitratorDeployedAtBlock ?? 0);
}

/**
 * The ERC-1497 `Dispute(_arbitrator, _disputeID)` event of a dispute on its arbitrable, archon's `getDispute` (spec 6.3).
 * Scans `[fromBlock, head]` with both indexed arguments filtered, chunked where the RPC caps ranges. Zero or several
 * logs are reported, not thrown; the block timestamp is the creation time. Never rejects: a failed read is `rpc-error`,
 * a log whose data does not decode is `invalid-data` (D-36).
 */
export async function readDisputeEvent(request: {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly disputeId: bigint;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}): Promise<Outcome<DisputeEventResult>> {
  const { client, signal } = request;
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    const logs = await getLogsChunked(
      client,
      {
        address: request.arbitrable,
        event: DISPUTE_EVENT,
        args: { _arbitrator: request.arbitrator, _disputeID: request.disputeId },
        fromBlock: request.fromBlock,
        toBlock: head,
      },
      { signal },
    );
    const [log] = logs;
    if (log === undefined) return succeed({ status: "not-found" });
    if (logs.length > 1) return succeed({ status: "ambiguous", count: logs.length });
    const { _metaEvidenceID: metaEvidenceId, _evidenceGroupID: evidenceGroupId } = log.args;
    if (metaEvidenceId === undefined || evidenceGroupId === undefined) return fail("invalid-data", "The Dispute event's data does not decode.");
    signal?.throwIfAborted();
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    return succeed({
      status: "found",
      event: { metaEvidenceId, evidenceGroupId, blockNumber: log.blockNumber, createdAt: Number(block.timestamp), transactionHash: log.transactionHash },
    });
  } catch (error) {
    return fail("rpc-error", `Could not read the Dispute event: ${describeError(error)}`);
  }
}

/** Whether `log` was emitted after `other`: a later block, or a later log index in the same block. */
function isLater(log: { readonly blockNumber: bigint; readonly logIndex: number }, other: { readonly blockNumber: bigint; readonly logIndex: number }): boolean {
  return log.blockNumber === other.blockNumber ? log.logIndex > other.logIndex : log.blockNumber > other.blockNumber;
}

/**
 * The ERC-1497 `MetaEvidence(_metaEvidenceID)` event of an arbitrable (P-25): the URI the arbitrable recorded for the
 * dispute's meta-evidence ID. Two passes: `[fromBlock, head]`, then, only when that finds nothing and `fromBlock > 0`,
 * `[0, fromBlock - 1]`, because the emission carries no arbitrator and can precede the arbitrator's deployment. Both are
 * chunked where the RPC caps ranges. Several logs are not ambiguous: the latest by block and log index wins, and
 * `emissions` counts them; a latest log whose `_evidence` does not decode is `invalid-data`, with no fallback to an older
 * emission. Never rejects: a failed or aborted read is `rpc-error` (D-36).
 */
export async function readMetaEvidenceEvent(request: {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly metaEvidenceId: bigint;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}): Promise<Outcome<MetaEvidenceEventResult>> {
  const { client, signal } = request;
  const scan = (fromBlock: bigint, toBlock: bigint) =>
    getLogsChunked(client, { address: request.arbitrable, event: META_EVIDENCE_EVENT, args: { _metaEvidenceID: request.metaEvidenceId }, fromBlock, toBlock }, { signal });
  try {
    signal?.throwIfAborted();
    const head = await client.getBlockNumber();
    let logs = await scan(request.fromBlock, head);
    if (logs.length === 0 && request.fromBlock > 0n) logs = await scan(0n, request.fromBlock - 1n);
    const [first, ...rest] = logs;
    if (first === undefined) return succeed({ status: "not-found" });
    const latest = rest.reduce((current, log) => (isLater(log, current) ? log : current), first);
    const uri = latest.args._evidence;
    if (uri === undefined) return fail("invalid-data", "The latest MetaEvidence event's data does not decode.");
    return succeed({
      status: "found",
      event: { uri, blockNumber: latest.blockNumber, logIndex: latest.logIndex, transactionHash: latest.transactionHash, emissions: logs.length },
    });
  } catch (error) {
    return fail("rpc-error", `Could not read the MetaEvidence event: ${describeError(error)}`);
  }
}

/**
 * The ERC-1497 `Evidence(_arbitrator, _evidenceGroupID)` logs of an evidence group, archon's `getEvidence` without the
 * fetch (spec 6.3), in chain order. The scan starts at `fromBlock`, not at the dispute, because evidence can precede the
 * dispute. Logs whose URI or submitter does not decode are left out here; `loadEvidence` counts them as hidden (D-22).
 */
export async function readEvidenceLogs(request: {
  readonly client: ReadClient;
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly evidenceGroupId: bigint;
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}): Promise<Outcome<readonly EvidenceLog[]>> {
  try {
    const { logs } = await scanEvidenceLogs(request);
    return succeed(logs);
  } catch (error) {
    return fail("rpc-error", `Could not read the evidence: ${describeError(error)}`);
  }
}

/** The Evidence scan behind `readEvidenceLogs` and `loadEvidence`. Rejects when a read fails. */
export async function scanEvidenceLogs(request: ScanRequest & { readonly evidenceGroupId: bigint }): Promise<EvidenceScan> {
  const { client, signal } = request;
  signal?.throwIfAborted();
  const head = await client.getBlockNumber();
  const raw = await getLogsChunked(
    client,
    {
      address: request.arbitrable,
      event: EVIDENCE_EVENT,
      args: { _arbitrator: request.arbitrator, _evidenceGroupID: request.evidenceGroupId },
      fromBlock: request.fromBlock,
      toBlock: head,
    },
    { signal },
  );
  const logs: EvidenceLog[] = [];
  for (const log of raw) {
    const evidenceUri = log.args._evidence;
    const party = log.args._party;
    if (evidenceUri !== undefined && party !== undefined) {
      logs.push({ evidenceUri, submitter: toRegistryAddress(party), blockNumber: log.blockNumber, logIndex: log.logIndex, transactionHash: log.transactionHash });
    }
  }
  return { logs, undecodable: raw.length - logs.length };
}
