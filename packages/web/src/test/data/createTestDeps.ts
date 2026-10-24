import {
  REGISTRY,
  createFamilyCache,
  resolveGateway,
  type ChainId,
  type FetchResponse,
  type Fetcher,
  type RealityQuestion,
  type RealityQuestionCache,
  type ReadClient,
  type ScriptResult,
  type ScriptRunRequest,
} from "@dispute-resolver/core";
import { createPublicClient, custom } from "viem";
import type { CoreDeps } from "../../data";

/** One JSON-RPC request a test client received, with the chain it was sent to. */
export interface RpcRequest {
  readonly chainId: ChainId;
  readonly method: string;
  readonly params: unknown;
}

/** Answers a JSON-RPC request from fixtures; a thrown error or a rejection is the transport failing. */
export type RpcHandler = (request: RpcRequest) => unknown;

/** A stubbed HTTP answer: a JSON body, a text body, or a status without a body. */
export type FetchStub = { readonly json: unknown } | { readonly text: string } | { readonly status: number };

export interface TestDepsOptions extends Partial<CoreDeps> {
  /** JSON-RPC answers of every chain's read client; without it every RPC request fails. */
  readonly rpc?: RpcHandler;
  /** Chains whose read client is missing, as with an unset RPC variable. */
  readonly unconfiguredChains?: readonly ChainId[];
  /** HTTP answers by exact URL for the stub fetcher; any other URL answers 404. */
  readonly responses?: Readonly<Record<string, FetchStub>>;
  /** The fake script runner's answer; without it every run fails with `runner-error`. */
  readonly runScript?: (request: ScriptRunRequest) => ScriptResult | Promise<ScriptResult>;
}

function stubResponse(stub: FetchStub | undefined): FetchResponse {
  if (stub === undefined || "status" in stub) {
    const status = stub?.status ?? 404;
    return { ok: status >= 200 && status < 300, status, json: () => Promise.reject(new Error("no body")), text: () => Promise.resolve("") };
  }
  if ("text" in stub) {
    return { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(stub.text) as unknown), text: () => Promise.resolve(stub.text) };
  }
  return { ok: true, status: 200, json: () => Promise.resolve(stub.json), text: () => Promise.resolve(JSON.stringify(stub.json)) };
}

function createMemoryRealityCache(): RealityQuestionCache {
  const entries = new Map<string, RealityQuestion>();
  return {
    get: (key) => entries.get(key),
    set: (key, question) => entries.set(key, question),
    remove: (key) => entries.delete(key),
  };
}

const failedRun: ScriptResult = { status: "failed", reason: "runner-error", message: "This test runs no dynamic script." };

/**
 * A `CoreDeps` for tests: read clients over a viem custom transport answering from `rpc`, a stub fetcher answering
 * from `responses`, a fake script runner, in-memory caches, and receipts that never arrive unless `waitForReceipt` is
 * given. Any `CoreDeps` field can be replaced directly.
 */
export function createTestDeps(options: TestDepsOptions = {}): CoreDeps {
  const { rpc, unconfiguredChains = [], responses = {}, runScript, ...overrides } = options;
  const clients = new Map<ChainId, ReadClient>();
  const getReadClient = (chainId: ChainId): ReadClient | undefined => {
    if (unconfiguredChains.includes(chainId)) return undefined;
    const existing = clients.get(chainId);
    if (existing !== undefined) return existing;
    const client = createPublicClient({
      transport: custom(
        {
          request: ({ method, params }: { method: string; params?: unknown }) => {
            if (rpc === undefined) return Promise.reject(new Error(`Unexpected RPC request ${method} on chain ${String(chainId)}.`));
            return Promise.resolve().then(() => rpc({ chainId, method, params }));
          },
        },
        { retryCount: 0 },
      ),
    });
    clients.set(chainId, client);
    return client;
  };
  const fetcher: Fetcher = (url) => Promise.resolve(stubResponse(responses[url]));
  return {
    env: {},
    getReadClient,
    fetcher,
    runner: { run: (request) => Promise.resolve(runScript === undefined ? failedRun : runScript(request)) },
    familyCache: createFamilyCache(),
    realityCache: createMemoryRealityCache(),
    gateway: resolveGateway({}),
    registry: REGISTRY,
    waitForReceipt: () => new Promise(() => undefined),
    ...overrides,
  };
}
