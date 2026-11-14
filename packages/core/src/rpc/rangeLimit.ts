import { BaseError, HttpRequestError, ResponseBodyTooLargeError } from "viem";
import { causeChain, isLookupLimitError, isTooManyLogsError } from "./errors";

const RATE_LIMIT_ERROR = /rate[\s-]?limit|too many requests|\b429\b|capacity|throughput|request count|compute units/i;
const RANGE_LIMIT_ERROR = /range|limit|exceed|too many|too large|10[,_]?000|response size|size exceeded|more than|\b413\b|timeout|timed out/i;
const RANGE_LIMIT_CODES: ReadonlySet<number> = new Set([-32005, -32602, -32600, -32614, 413]);
const TOO_MANY_RESULTS_ERROR = /more than [\d,_]+ (?:results|logs)|exceeds? max(?:imum)? (?:results|logs)|too many (?:results|logs)|log response size exceeded/i;

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

/** The Gnosis read RPC answers a crowded `eth_getLogs` with "invalid params" and puts the reason in the error's data. */
function dataWording(error: unknown): string {
  return typeof error === "object" && error !== null && "data" in error && typeof error.data === "string" ? error.data : "";
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
 * `LookupLimitError` or a `TooManyLogsError` is never a range limit: both are the caller's own limits.
 */
export function isRangeLimitError(error: unknown): boolean {
  const chain = causeChain(error);
  if (chain.some((link) => isLookupLimitError(link) || isTooManyLogsError(link))) return false;
  const text = chain.map(wording).join("\n");
  if (RATE_LIMIT_ERROR.test(text)) return false;
  if (chain.some((link) => RANGE_LIMIT_CODES.has(numericCode(link) ?? 0))) return true;
  return RANGE_LIMIT_ERROR.test(text);
}

/**
 * Whether `eth_getLogs` failed because the answer holds more logs than the provider returns at once, or more bytes than
 * the read client accepts (viem's response body cap), whatever the block range. Narrower than
 * `isRangeLimitError`: timeouts, rate limits and block-range caps are not, and neither is a code alone, since the codes
 * providers use here are generic.
 */
export function isTooManyResultsError(error: unknown): boolean {
  const chain = causeChain(error);
  if (chain.some((link) => isLookupLimitError(link) || isTooManyLogsError(link))) return false;
  if (chain.some((link) => link instanceof ResponseBodyTooLargeError)) return true;
  const text = chain.flatMap((link) => [wording(link), dataWording(link)]).join("\n");
  return !RATE_LIMIT_ERROR.test(text) && TOO_MANY_RESULTS_ERROR.test(text);
}
