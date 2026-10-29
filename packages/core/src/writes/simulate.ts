import { BaseError, InsufficientFundsError, type Abi } from "viem";
import { NETWORK_DATA_UNAVAILABLE, callFailure, rejectionReason } from "../outcome";
import type { Address, ReadClient, WriteCall } from "../types";
import type { SimulationResult } from "./types";

/**
 * The call's ABI with the called function's outputs dropped. A deployed contract that returns nothing where the
 * interface declares a value would otherwise fail decoding, and that failure reads as a contract failure.
 */
function withoutOutputs(call: WriteCall): Abi {
  return call.abi.map((item) => (item.type === "function" && item.name === call.functionName ? { ...item, outputs: [] } : item));
}

function namesInsufficientFunds(error: unknown): boolean {
  return error instanceof BaseError && error.walk((cause) => cause instanceof InsufficientFundsError) !== null;
}

/**
 * Checks `call` against the contract through the read RPC, as `from` would send it, before the wallet opens. The
 * balance is read first when the call carries value, because nodes word a short balance differently and some only as an
 * EVM failure. Never rejects. A rejection or a short balance means nothing is sent; a check that could not run stops
 * nothing, since the wallet checks the call again.
 */
export async function simulateWrite(client: ReadClient | undefined, call: WriteCall, from: Address): Promise<SimulationResult> {
  if (client === undefined) return { status: "unavailable", error: { code: "no-rpc", message: NETWORK_DATA_UNAVAILABLE } };
  try {
    if (call.value > 0n && (await client.getBalance({ address: from })) < call.value) return { status: "insufficient-funds" };
  } catch (error) {
    return { status: "unavailable", error: callFailure(error, call.chainId) };
  }
  try {
    await client.simulateContract({ address: call.address, abi: withoutOutputs(call), functionName: call.functionName, args: call.args, account: from, value: call.value });
    return { status: "ok" };
  } catch (error) {
    if (namesInsufficientFunds(error)) return { status: "insufficient-funds" };
    const failure = callFailure(error, call.chainId);
    return failure.code === "reverted" ? { status: "reverted", reason: rejectionReason(error, call.chainId) } : { status: "unavailable", error: failure };
  }
}
