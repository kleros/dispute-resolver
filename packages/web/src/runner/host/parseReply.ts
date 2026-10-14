import type { ScriptResult } from "@dispute-resolver/core";
import { z } from "zod";
import { ERROR_MESSAGE_TYPE, RESULT_MESSAGE_TYPE } from "../protocol";

/** Untrusted text from a script is bounded before it becomes part of a message. */
const MAX_SCRIPT_MESSAGE_LENGTH = 300;

export type FailureReason = Extract<ScriptResult, { status: "failed" }>["reason"];

export function okResult(value: unknown, jsonDuplicateKeys: boolean): ScriptResult {
  return { status: "ok", value, jsonDuplicateKeys };
}

export function failedResult(reason: FailureReason, message: string): ScriptResult {
  return { status: "failed", reason, message };
}

const replySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(RESULT_MESSAGE_TYPE), value: z.unknown(), jsonDuplicateKeys: z.boolean() }),
  z.object({ type: z.literal(ERROR_MESSAGE_TYPE), message: z.string() }),
]);

/**
 * What one reply from a run's port means (ARCHITECTURE.md §7.3 step 5). The value stays `unknown`: core validates it
 * after the merge (A23, C13).
 */
export function parseReply(data: unknown): ScriptResult {
  const parsed = replySchema.safeParse(data);
  if (!parsed.success) return failedResult("runner-error", "The script runner sent a malformed reply.");
  const reply = parsed.data;
  if (reply.type === RESULT_MESSAGE_TYPE) return okResult(reply.value, reply.jsonDuplicateKeys);
  return failedResult("script-error", `The dynamic script failed: ${reply.message.slice(0, MAX_SCRIPT_MESSAGE_LENGTH)}`);
}
