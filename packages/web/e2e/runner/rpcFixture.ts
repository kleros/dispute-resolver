import { readFileSync } from "node:fs";
import type { Request, Route } from "@playwright/test";
import { z } from "zod";

// Recorded chain reads for the runner specs (C9: the doubles live in e2e only). A fixture under e2e/runner/fixtures holds
// the JSON-RPC answers one page or script read, keyed by method and params, with the block they were read at.

export const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "*" };

const FixtureSchema = z.object({
  readAtBlock: z.number(),
  calls: z.array(
    z.object({
      method: z.string(),
      params: z.array(z.unknown()),
      result: z.unknown().optional(),
      error: z.object({ code: z.number(), message: z.string() }).optional(),
    }),
  ),
});

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.array(z.unknown()).optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcAnswer = { readonly result: unknown } | { readonly error: { readonly code: number; readonly message: string } };

/** The recorded answers of one fixture file. */
export interface RpcFixture {
  /** The recorded answer to `call`, or `undefined` when the recording has none. */
  answer(call: JsonRpcRequest): JsonRpcAnswer | undefined;
}

/** `value` as JSON with object keys sorted, so a fixture matches a request whatever order its keys were written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const members = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

function rpcKey(method: string, params: readonly unknown[]): string {
  return canonical([method, params]);
}

/** Loads `fileName` from e2e/runner/fixtures. */
export function loadRpcFixture(fileName: string): RpcFixture {
  const parsed: unknown = JSON.parse(readFileSync(new URL(`fixtures/${fileName}`, import.meta.url), "utf8"));
  const fixture = FixtureSchema.parse(parsed);
  const answers = new Map<string, JsonRpcAnswer>();
  for (const call of fixture.calls) answers.set(rpcKey(call.method, call.params), call.error === undefined ? { result: call.result } : { error: call.error });
  return { answer: (call) => answers.get(rpcKey(call.method, call.params ?? [])) };
}

/** The JSON-RPC call a request carries, or `undefined` when it carries none. */
export function jsonRpcCall(request: Request): JsonRpcRequest | undefined {
  if (request.method() !== "POST") return undefined;
  let body: unknown;
  try {
    body = JSON.parse(request.postData() ?? "");
  } catch {
    return undefined;
  }
  const parsed = JsonRpcRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

export async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ headers: CORS_HEADERS, contentType: "application/json", body: JSON.stringify(body) });
}

/** Answers `call` from `fixture`, or with a node error when the fixture has no answer; says whether it was answered. */
export async function answerFromFixture(route: Route, fixture: RpcFixture, call: JsonRpcRequest): Promise<boolean> {
  const answer = fixture.answer(call);
  if (answer === undefined) {
    await fulfillJson(route, { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "Not in the test's recorded fixtures." } });
    return false;
  }
  await fulfillJson(route, { jsonrpc: "2.0", id: call.id, ...answer });
  return true;
}
