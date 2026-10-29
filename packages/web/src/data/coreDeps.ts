import { REGISTRY, createFamilyCache, createReadClients, simulateWrite } from "@dispute-resolver/core";
import type { AppConfig } from "../env";
import { RUNNER_PATH, buildRpcRedirects, createIframeScriptRunner } from "../runner";
import { createFetcher } from "./fetcher";
import type { PersistStorage } from "./persistence";
import { createRealityQuestionCache } from "./realityCache";
import { createReceiptWaiter } from "./receipts";
import type { CoreDeps } from "./types";

const MAX_CONCURRENT_SCRIPTS = 4;

interface CoreDepsEnvironment {
  readonly document: Document;
  readonly fetch: typeof fetch;
  readonly storage: PersistStorage | undefined;
}

/** Creates no network request. */
export function createCoreDeps(config: AppConfig, environment: CoreDepsEnvironment): CoreDeps {
  const getReadClient = createReadClients(config.env);
  return {
    env: config.env,
    getReadClient,
    fetcher: createFetcher((url, init) => environment.fetch(url, init)),
    runner: createIframeScriptRunner({
      document: environment.document,
      runnerUrl: RUNNER_PATH,
      maxConcurrent: MAX_CONCURRENT_SCRIPTS,
      rpcRedirects: buildRpcRedirects(config.env),
    }),
    familyCache: createFamilyCache(),
    realityCache: createRealityQuestionCache(environment.storage),
    gateway: config.gateway,
    registry: REGISTRY,
    waitForReceipt: createReceiptWaiter(config.env),
    simulate: (call, from) => simulateWrite(getReadClient(call.chainId), call, from),
  };
}
