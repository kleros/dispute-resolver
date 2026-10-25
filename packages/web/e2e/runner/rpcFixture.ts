import { readFileSync } from "node:fs";
import type { Route } from "@playwright/test";
import { z } from "zod";
import { callKey, fulfillJson, latestBlockAnswer, RecordedCallSchema, type JsonRpcRequest, type RpcAnswer, type RpcCall } from "../support/network";

// A fixture under e2e/runner/fixtures holds the JSON-RPC answers one page or script read, keyed by method and params,
// with the block they were read at.

const FixtureSchema = z.object({ readAtBlock: z.number(), calls: z.array(RecordedCallSchema) });

export interface RpcFixture {
  answer(call: RpcCall): RpcAnswer | undefined;
}

export function loadRpcFixture(fileName: string): RpcFixture {
  const parsed: unknown = JSON.parse(readFileSync(new URL(`fixtures/${fileName}`, import.meta.url), "utf8"));
  const fixture = FixtureSchema.parse(parsed);
  const answers = new Map<string, RpcAnswer>();
  for (const call of fixture.calls) answers.set(callKey(call.method, call.params), call.error === undefined ? { result: call.result } : { error: call.error });
  return { answer: (call) => answers.get(callKey(call.method, call.params)) ?? latestBlockAnswer(call) };
}

/** Answers with a node error when the fixture has no answer; returns whether it had one. */
export async function answerFromFixture(route: Route, fixture: RpcFixture, call: JsonRpcRequest): Promise<boolean> {
  const answer = fixture.answer({ method: call.method, params: call.params ?? [] });
  if (answer === undefined) {
    await fulfillJson(route, { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "Not in the test's recorded fixtures." } });
    return false;
  }
  await fulfillJson(route, { jsonrpc: "2.0", id: call.id, ...answer });
  return true;
}
