import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failureMessage } from "./failureMessage";
import { rawRpcFor } from "./recordingRpc";

const KEY = "abc123SECRETxyz";
const KEYED_URL = `https://rpc.example/v2/${KEY}`;
const ENV = { REACT_APP_WEB3_PROVIDER_URL: KEYED_URL };
/** Shorter than the window of the source a JSON parse error quotes. */
const FRAGMENT_LENGTH = 6;

function answering(answer: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(answer));
}

async function printedFailureOf(pending: Promise<unknown>): Promise<string> {
  const error = await pending.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(Error);
  return failureMessage(error, ENV);
}

function expectNoPieceOfTheUrl(text: string): void {
  expect(text).not.toContain("rpc.example");
  for (let start = 0; start + FRAGMENT_LENGTH <= KEY.length; start += 1) expect(text).not.toContain(KEY.slice(start, start + FRAGMENT_LENGTH));
}

beforeEach(() => {
  vi.stubEnv("REACT_APP_WEB3_PROVIDER_URL", KEYED_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("what a recorder prints when the read RPC fails", () => {
  it("an answer that is not JSON is named without quoting it, so no piece of a key it echoes is printed", async () => {
    answering(() => Promise.resolve(new Response(`{"error": ${KEY}}`)));
    const text = await printedFailureOf(rawRpcFor(1).request("eth_blockNumber", []));
    expectNoPieceOfTheUrl(text);
    expect(text).toBe("eth_blockNumber on chain 1: the read RPC's answer is not JSON.");
  });

  it("an eth_call answer that is not JSON is named the same way", async () => {
    answering(() => Promise.resolve(new Response(`<html>key ${KEY} rejected</html>`)));
    const text = await printedFailureOf(rawRpcFor(1).call("0x0000000000000000000000000000000000000001", "0x", 1n));
    expectNoPieceOfTheUrl(text);
    expect(text).toBe("eth_call on chain 1: the read RPC's answer is not JSON.");
  });

  it("a node error that echoes the keyed URL keeps its reason and loses the URL and the key", async () => {
    answering(() => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32_000, message: `invalid key ${KEY} for ${KEYED_URL}` } })));
    const text = await printedFailureOf(rawRpcFor(1).request("eth_blockNumber", []));
    expectNoPieceOfTheUrl(text);
    expect(text).toContain("eth_blockNumber on chain 1: invalid key");
  });

  it("an HTTP error is named by its status, not by the body that may echo the key", async () => {
    answering(() => Promise.resolve(new Response(`unknown key ${KEY}`, { status: 401 })));
    const text = await printedFailureOf(rawRpcFor(1).request("eth_blockNumber", []));
    expect(text).toBe("eth_blockNumber on chain 1: the read RPC answered HTTP 401.");
  });

  it("an unreachable RPC is named without the URL the fetch error carries", async () => {
    answering(() => Promise.reject(new TypeError(`fetch failed: ${KEYED_URL}`)));
    const text = await printedFailureOf(rawRpcFor(1).request("eth_blockNumber", []));
    expect(text).toBe("eth_blockNumber on chain 1: the read RPC is unreachable.");
  });
});

describe("what a recorder writes into a fixture for an eth_call", () => {
  const GOVERNOR = "0x0000000000000000000000000000000000000001";

  function nodeAnswers(error: { code: number; message: string }): void {
    answering(() => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, error })));
  }

  it("a revert whose message repeats the key and the URL is recorded without either", async () => {
    nodeAnswers({ code: 3, message: `execution reverted: key ${KEY} for ${KEYED_URL}` });
    const reply = await rawRpcFor(1).call(GOVERNOR, "0x", 1n);
    const fixture = JSON.stringify({ calls: { "denominator()": reply } }, null, 2);
    expectNoPieceOfTheUrl(fixture);
    expect(reply).toEqual({ error: { code: 3, message: "execution reverted: key <redacted> for <url>" } });
  });

  it.each([
    { code: 3, message: "execution reverted" },
    { code: -32_000, message: "invalid opcode: INVALID" },
    { code: -32_003, message: "EVM error: InvalidFEOpcode" },
  ])("a contract failure ($message) is recorded as the node reported it", async (error) => {
    nodeAnswers(error);
    expect(await rawRpcFor(1).call(GOVERNOR, "0x", 1n)).toEqual({ error });
  });

  it.each([
    ["a rejected key", { code: -32_000, message: `invalid API key ${KEY}` }],
    ["a rate limit", { code: -32_005, message: `daily request count exceeded for ${KEYED_URL}` }],
    ["a server error", { code: -32_603, message: "Internal error" }],
    ["a node behind", { code: -32_000, message: "header not found" }],
  ])("%s fails the recording instead of being recorded as a revert, without the key", async (_, error) => {
    nodeAnswers(error);
    const rejection = await rawRpcFor(1)
      .call(GOVERNOR, "0x", 1n)
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(rejection).toBeInstanceOf(Error);
    const { message } = rejection as Error;
    expect(message).toMatch(/^eth_call on chain 1: /);
    expectNoPieceOfTheUrl(message);
    expectNoPieceOfTheUrl(failureMessage(rejection, ENV));
  });
});
