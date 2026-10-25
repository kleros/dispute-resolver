import { createPublicClient, custom, type Transport } from "viem";
import { getChain, resolveReadRpcUrl } from "../chains";
import type { ChainConfig } from "../chains/types";
import type { ChainId, Env, GetReadClient, ReadClient } from "../types";
import { causeChain, isLookupLimitError } from "./errors";
import { isRangeLimitError } from "./rangeLimit";
import { redactingHttp, rethrowMapped, type JsonRpcRequest } from "./redactingHttp";
import type { BudgetedReadClientOptions, ReadClientOptions, ReadClientResolution, RequestBudget } from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_COUNT = 2;
const FIRST_RETRY_DELAY_MS = 500;
const RETRY_BACKOFF_FACTOR = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TransportPolicy extends Required<ReadClientOptions> {
  readonly budget: RequestBudget | undefined;
}

/**
 * Range-limit refusals of `eth_getLogs` go straight back to the caller, which narrows the range (`getLogsChunked`);
 * retrying them would only repeat the refusal.
 */
function isRetryable(method: string, error: unknown): boolean {
  return !(method === "eth_getLogs" && isRangeLimitError(error));
}

/**
 * Batching is off so each request has its own timeout. viem's own retries are off because they retry range refusals
 * (-32005, HTTP 413, timeouts) and use a different backoff. Each attempt, retries included, spends the budget first, so
 * its `LookupLimitError` is thrown before the request and never retried.
 */
function readTransport(url: string, options: TransportPolicy): Transport {
  return (parameters) => {
    const base = redactingHttp(url, { timeout: options.timeoutMs, batch: false, retryCount: 0 })(parameters);
    const attempt = async (call: JsonRpcRequest, attempted: number): Promise<unknown> => {
      options.budget?.spend();
      try {
        return await base.request({ method: call.method, params: call.params });
      } catch (error) {
        if (attempted >= options.retryCount || !isRetryable(call.method, error)) throw error;
        await delay(FIRST_RETRY_DELAY_MS * RETRY_BACKOFF_FACTOR ** attempted);
        return attempt(call, attempted + 1);
      }
    };
    const request = (call: JsonRpcRequest): Promise<unknown> => attempt(call, 0);
    return rethrowMapped(custom({ request }, { key: "read-rpc", name: "Read RPC", retryCount: 0 })(parameters), unwrapLookupLimit);
  };
}

/**
 * viem wraps every error a transport throws that is not its own in an `UnknownRpcError`, so the budget's error is
 * unwrapped for callers to recognise with `isLookupLimitError`.
 */
function unwrapLookupLimit(error: unknown): unknown {
  return causeChain(error).find(isLookupLimitError) ?? error;
}

function withDefaults(options: BudgetedReadClientOptions | undefined): TransportPolicy {
  return {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retryCount: options?.retryCount ?? DEFAULT_RETRY_COUNT,
    budget: options?.budget,
  };
}

/**
 * Built only from the chain's configured read RPC, never from a wallet. A lookup with a request budget builds its own
 * client so that every attempt it sends is counted.
 */
export function createReadClient(chain: ChainConfig, env: Env, options?: BudgetedReadClientOptions): ReadClientResolution {
  const rpc = resolveReadRpcUrl(chain, env);
  return rpc.status === "configured"
    ? { status: "ok", client: createPublicClient({ transport: readTransport(rpc.url, withDefaults(options)) }) }
    : { status: "unconfigured", chainId: chain.id };
}

/** One client per chain, built on first use. A budget in `options` is spent by every client, so shared callers pass none. */
export function createReadClients(env: Env, options?: BudgetedReadClientOptions): GetReadClient {
  const clients = new Map<ChainId, ReadClient | undefined>();
  return (chainId) => {
    if (clients.has(chainId)) return clients.get(chainId);
    const chain = getChain(chainId);
    const resolution = chain === undefined ? undefined : createReadClient(chain, env, options);
    const client = resolution?.status === "ok" ? resolution.client : undefined;
    clients.set(chainId, client);
    return client;
  };
}
