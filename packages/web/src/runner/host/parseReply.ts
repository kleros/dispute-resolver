import { z, type ScriptResult } from "@dispute-resolver/core";
import { ACCEPTED_MESSAGE_TYPE, ERROR_MESSAGE_TYPE, RESULT_MESSAGE_TYPE } from "../protocol";

/** Untrusted text from a script is bounded before it becomes part of a message. */
const MAX_SCRIPT_MESSAGE_LENGTH = 300;

export type FailureReason = Extract<ScriptResult, { status: "failed" }>["reason"];

export function okResult(value: unknown, jsonDuplicateKeys: boolean): ScriptResult {
  return { status: "ok", value, jsonDuplicateKeys };
}

export function failedResult(reason: FailureReason, message: string): ScriptResult {
  return { status: "failed", reason, message };
}

// The acknowledgement's schema reads no field but its type: anything else it carries is dropped here (P-16, B1).
const portMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ACCEPTED_MESSAGE_TYPE) }),
  z.object({ type: z.literal(RESULT_MESSAGE_TYPE), value: z.unknown(), jsonDuplicateKeys: z.boolean() }),
  z.object({ type: z.literal(ERROR_MESSAGE_TYPE), message: z.string() }),
]);

/** One message from a run's port: the page's acknowledgement, which settles nothing, or the run's outcome (P-16). */
export type PortMessage = { readonly kind: "acknowledged" } | { readonly kind: "settled"; readonly result: ScriptResult };

/** A port message that is not one of the three the page sends, or one the port could not deserialize. */
export const MALFORMED_REPLY = failedResult("runner-error", "The script runner sent a malformed reply.");

const MALFORMED: PortMessage = { kind: "settled", result: MALFORMED_REPLY };

/**
 * What one message from a run's port means (ARCHITECTURE.md §7.3 step 5). A result's value stays `unknown`: core
 * validates it after the merge (A23, C13).
 */
export function parsePortMessage(data: unknown): PortMessage {
  const parsed = portMessageSchema.safeParse(data);
  if (!parsed.success) return MALFORMED;
  const message = parsed.data;
  if (message.type === ACCEPTED_MESSAGE_TYPE) return { kind: "acknowledged" };
  if (message.type === RESULT_MESSAGE_TYPE) return { kind: "settled", result: okResult(message.value, message.jsonDuplicateKeys) };
  return { kind: "settled", result: failedResult("script-error", `The dynamic script failed: ${message.message.slice(0, MAX_SCRIPT_MESSAGE_LENGTH)}`) };
}
