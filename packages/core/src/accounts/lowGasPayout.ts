import { isContractFailure } from "../rpc";
import type { Address, Hex, ReadClient } from "../types";
import type { LowGasPayout } from "./types";

const EIP7702_DELEGATION_PREFIX = "0xef0100";

/**
 * Exists only in the call's state override. Its code CALLs CALLER with 1 wei and gas 0, so the account runs on the
 * 2300-gas stipend alone, as with the appeal contracts' `send`, and REVERTs when that call failed.
 */
const PROBE: Address = "0x00000000000000000000000000000000000c0ffe";
const PROBE_CODE: Hex = "0x60006000600060006001336000f115601357005b60006000fd";
/** 100,000 gas: far above what the probe and the stipend need, so only the account's own code can fail the call. */
const PROBE_GAS: Hex = "0x186a0";

export function isEip7702Delegation(code: Hex): boolean {
  return code.toLowerCase().startsWith(EIP7702_DELEGATION_PREFIX);
}

/**
 * Whether a 2300-gas transfer reaches `account`, whose code is `code`. Only an EIP-7702 delegation is checked, since its
 * delegate's code runs on a plain transfer. Never rejects: a revert of the probe is a contract failure, so the account
 * cannot receive; any other failure or answer, a node that refuses state overrides included, leaves it unknown.
 */
export async function readLowGasPayout(request: { readonly client: ReadClient; readonly account: Address; readonly code: Hex }): Promise<LowGasPayout> {
  const { client, account, code } = request;
  if (!isEip7702Delegation(code)) return "not-checked";
  try {
    const result: unknown = await client.request({
      method: "eth_call",
      params: [{ from: account, to: PROBE, gas: PROBE_GAS }, "latest", { [PROBE]: { code: PROBE_CODE, balance: "0x1" } }],
    });
    // The probe STOPs without return data, so any other answer is not the probe's.
    return result === "0x" ? "receives" : "unknown";
  } catch (error) {
    return isContractFailure(error) ? "cannot-receive" : "unknown";
  }
}
