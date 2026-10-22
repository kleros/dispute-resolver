import { BaseError, HttpRequestError } from "viem";
import { isLookupLimitError } from "./errors";

const RATE_LIMIT_ERROR = /rate[\s-]?limit|too many requests|\b429\b|capacity|throughput|request count|compute units/i;
const RANGE_LIMIT_ERROR = /range|limit|exceed|too many|too large|10[,_]?000|response size|size exceeded|more than|\b413\b|timeout|timed out/i;
const RANGE_LIMIT_CODES: ReadonlySet<number> = new Set([-32005, -32602, -32600, -32614, 413]);

/** How deep a chain of `cause`s is followed; viem wraps a provider error at most a few times. */
const MAX_CAUSE_DEPTH = 8;

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (current !== undefined && current !== null && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current);
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return chain;
}

/**
 * Never a viem error's full message: it repeats the request body, whose topics and block numbers could match the range
 * wording.
 */
function wording(error: unknown): string {
  if (error instanceof BaseError) return `${error.shortMessage}\n${error.details}`;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return typeof error === "string" ? error : "";
}

function numericCode(error: unknown): number | undefined {
  if (error instanceof HttpRequestError) return error.status;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Number(error.code);
    return Number.isFinite(code) ? code : undefined;
  }
  return undefined;
}

/**
 * Whether `eth_getLogs` failed because the range or the result is too large for the provider, as opposed to a transient
 * or unrelated failure. Rate limiting reuses some of the same wording and codes, so it is excluded first.
 * Timeouts count as range limits: retrying a request too heavy to answer in time would only burn the deadline. A
 * `LookupLimitError` is never a range limit.
 */
export function isRangeLimitError(error: unknown): boolean {
  const chain = causeChain(error);
  if (chain.some(isLookupLimitError)) return false;
  const text = chain.map(wording).join("\n");
  if (RATE_LIMIT_ERROR.test(text)) return false;
  if (chain.some((link) => RANGE_LIMIT_CODES.has(numericCode(link) ?? 0))) return true;
  return RANGE_LIMIT_ERROR.test(text);
}
