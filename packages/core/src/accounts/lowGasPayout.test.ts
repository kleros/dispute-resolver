import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadClient } from "../rpc";
import { chainOf } from "../test/chains/testHelpers";
import { rpcCalls, stubEndpoint, type Reply } from "../test/rpc/testHelpers";
import type { Hex, ReadClient } from "../types";
import { isEip7702Delegation, readLowGasPayout } from "./index";

const READ_URL = "https://read.rpc.example/";
const ACCOUNT = "0x00000000000000000000000000000000000a11ce";
/** An account delegated to Coinbase's EIP7702Proxy. */
const COINBASE_DELEGATION: Hex = "0xef01007702cb554e6bfb442cb743a7df23154544a7176c";

/** The client `createReadClient` builds for mainnet's configured read RPC, without retries, over a node answering `reply`. */
function nodeAnswering(reply: Reply) {
  const endpoint = stubEndpoint(() => reply);
  const resolution = createReadClient(chainOf(1), { REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { retryCount: 0, timeoutMs: 20 });
  if (resolution.status !== "ok") throw new Error("expected a configured client");
  const client: ReadClient = resolution.client;
  return { client, endpoint };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readLowGasPayout", () => {
  it("checks a delegated account with one eth_call from the account to the probe at the latest block, the probe's code and balance given as a state override", async () => {
    const { client, endpoint } = nodeAnswering({ result: "0x" });
    await readLowGasPayout({ client, account: ACCOUNT, code: COINBASE_DELEGATION });
    expect(rpcCalls(endpoint).map(({ method, params }) => ({ method, params }))).toEqual([
      {
        method: "eth_call",
        params: [
          { from: ACCOUNT, to: "0x00000000000000000000000000000000000c0ffe", gas: "0x186a0" },
          "latest",
          { "0x00000000000000000000000000000000000c0ffe": { code: "0x60006000600060006001336000f115601357005b60006000fd", balance: "0x1" } },
        ],
      },
    ]);
  });

  it("an account whose probe call succeeds receives the transfer", async () => {
    const { client } = nodeAnswering({ result: "0x" });
    expect(await readLowGasPayout({ client, account: ACCOUNT, code: COINBASE_DELEGATION })).toBe("receives");
  });

  it.each([
    ["code 3", { code: 3, message: "execution reverted" }],
    ["code -32000", { code: -32000, message: "execution reverted" }],
  ])("an account whose probe call reverts (%s) cannot receive the transfer", async (_case, error) => {
    const { client } = nodeAnswering({ error });
    expect(await readLowGasPayout({ client, account: ACCOUNT, code: COINBASE_DELEGATION })).toBe("cannot-receive");
  });

  it.each<[string, Reply]>([
    ["the node does not answer in time", "hang"],
    ["the endpoint fails", { status: 503 }],
    ["the node refuses state overrides", { error: { code: -32602, message: "invalid argument 2: too many arguments, want at most 2" } }],
    ["the node has no eth_call", { error: { code: -32601, message: "the method eth_call does not exist/is not available" } }],
    ["the node fails for its own reason", { error: { code: -32000, message: "header not found" } }],
    ["the node answers without a result", { result: undefined }],
    ["the node answers with a null result", { result: null }],
    ["the node answers with return data the probe never gives", { result: "0x01" }],
    ["the node answers with something other than hex", { result: 1 }],
  ])("when %s, whether the account receives is unknown", async (_case, reply) => {
    const { client } = nodeAnswering(reply);
    expect(await readLowGasPayout({ client, account: ACCOUNT, code: COINBASE_DELEGATION })).toBe("unknown");
  });

  it("checks a delegation written in upper case", async () => {
    const { client, endpoint } = nodeAnswering({ result: "0x" });
    expect(await readLowGasPayout({ client, account: ACCOUNT, code: "0xEF01007702CB554E6BFB442CB743A7DF23154544A7176C" })).toBe("receives");
    expect(rpcCalls(endpoint)).toHaveLength(1);
  });

  it.each<[string, Hex]>([
    ["an account without code", "0x"],
    ["a contract account", "0x6080604052"],
  ])("never checks %s and sends nothing", async (_case, code) => {
    const { client, endpoint } = nodeAnswering({ result: "0x" });
    expect(await readLowGasPayout({ client, account: ACCOUNT, code })).toBe("not-checked");
    expect(rpcCalls(endpoint)).toEqual([]);
  });
});

describe("isEip7702Delegation", () => {
  it.each<[Hex, boolean]>([
    [COINBASE_DELEGATION, true],
    ["0xEF01007702CB554E6BFB442CB743A7DF23154544A7176C", true],
    ["0x", false],
    ["0x6080604052", false],
    ["0xef01", false],
  ])("code %s is an EIP-7702 delegation: %s", (code, delegated) => {
    expect(isEip7702Delegation(code)).toBe(delegated);
  });
});
