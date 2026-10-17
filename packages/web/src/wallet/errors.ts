import { BaseError, ChainMismatchError, UserRejectedRequestError } from "viem";

/** EIP-1193's "user rejected the request". */
const USER_REJECTED_CODE = 4001;

function hasCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Every error in the cause chain, outermost first (viem and wagmi wrap the wallet's error). */
function causes(error: unknown): unknown[] {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return [...seen];
}

/** The user declined in the wallet: viem's `UserRejectedRequestError` or EIP-1193 code 4001 anywhere in the chain (D-07). */
export function isUserRejection(error: unknown): boolean {
  return causes(error).some((cause) => cause instanceof UserRejectedRequestError || hasCode(cause, USER_REJECTED_CODE));
}

/** viem's own chain check rejected the signature: the wallet changed chain after the app's guard ran (B3). */
export function isChainMismatch(error: unknown): boolean {
  return causes(error).some((cause) => cause instanceof ChainMismatchError);
}

/** A short, human-readable reason: viem's `shortMessage` when there is one, else the error's message. */
export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "Unknown error.";
}
