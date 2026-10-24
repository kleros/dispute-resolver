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

export interface EvidenceScan {
  readonly logs: readonly EvidenceLog[];
  readonly undecodable: number;
}

/** The arbitrator deployment block on every chain, testnets included: a scan from `head − lookback` misses older disputes. */
export function evidenceScanStart(chain: ChainConfig): bigint {
  return BigInt(chain.arbitratorDeployedAtBlock ?? 0);
}

/**
 * Zero or several logs are reported, not thrown. Never rejects: a failed read is `rpc-error`, a log whose data does not
 * decode is `invalid-data`.
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

function isLater(log: { readonly blockNumber: bigint; readonly logIndex: number }, other: { readonly blockNumber: bigint; readonly logIndex: number }): boolean {
  return log.blockNumber === other.blockNumber ? log.logIndex > other.logIndex : log.blockNumber > other.blockNumber;
}

/**
 * Two passes: `[fromBlock, head]`, then, only when that finds nothing, `[0, fromBlock - 1]`, because the emission carries
 * no arbitrator and can precede the arbitrator's deployment. Several logs are not ambiguous: the latest wins and
 * `emissions` counts them; a latest log whose `_evidence` does not decode is `invalid-data`, with no fallback to an older
 * emission. Never rejects: a failed or aborted read is `rpc-error`.
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
 * The scan starts at `fromBlock`, not at the dispute, because evidence can precede the dispute. Logs whose URI or
 * submitter does not decode are left out and counted; `loadEvidence` shows them as hidden. Rejects when a read fails.
 */
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
