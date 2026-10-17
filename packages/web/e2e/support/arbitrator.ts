import { encodeAbiParameters, encodeFunctionData, parseAbi } from "viem";
import { callData, callTarget, type RpcAnswer, type RpcCall, type RpcResult } from "./network";

// KlerosLiquid answers the specs build themselves, for disputes no recording holds. The addresses and the node messages
// are copied from packages/core (src/chains/table.ts, src/rpc/failures.ts); nothing of core is imported at runtime, since
// its module graph loads jsdom, which Playwright's loader cannot load under every Node version the engines field allows.

/** `CHAINS[1].klerosLiquid`. */
export const MAINNET_ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
/** `CHAINS[100].klerosLiquid`. */
export const GNOSIS_ARBITRATOR = "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002";

export const ARBITRATOR_ABI = parseAbi([
  "function disputes(uint256) view returns (uint96 subcourtID, address arbitrated, uint256 numberOfChoices, uint8 period, uint256 lastPeriodChange, uint256 drawsInRound, uint256 commitsInRound, bool ruled)",
  "event DisputeCreation(uint256 indexed _disputeID, address indexed _arbitrable)",
  "event NewPeriod(uint256 indexed _disputeID, uint8 indexed _period)",
]);

/** The fields of a `disputes(id)` struct a spec sets. */
export interface DisputeStruct {
  readonly arbitrated: `0x${string}`;
  readonly period: number;
  readonly lastPeriodChange: bigint;
}

/** Whether `call` is `disputes(id)` on `arbitrator`. */
export function isDisputesCall(call: RpcCall, arbitrator: string, id: bigint): boolean {
  return callTarget(call) === arbitrator && callData(call) === encodeFunctionData({ abi: ARBITRATOR_ABI, functionName: "disputes", args: [id] });
}

/** The `disputes(id)` answer of a dispute in court 0 with two options. */
export function disputeStruct({ arbitrated, period, lastPeriodChange }: DisputeStruct): RpcResult {
  const outputs = ARBITRATOR_ABI.find((item) => item.type === "function")?.outputs ?? [];
  return { result: encodeAbiParameters(outputs, [0n, arbitrated, 2n, period, lastPeriodChange, 3n, 0n, false]) };
}

/** Gnosis keeps disputes in a mapping: an ID that was never created reads as a zeroed struct (P-08). */
export const NEVER_CREATED_ON_GNOSIS: RpcResult = { result: `0x${"0".repeat(64 * 8)}` };

/** How mainnet's node answers `disputes(id)` past the last dispute (recorded, packages/core/src/rpc/failures.ts). */
export const OUT_OF_RANGE_ON_MAINNET: RpcAnswer = { error: { code: -32003, message: "EVM error: InvalidFEOpcode" } };
