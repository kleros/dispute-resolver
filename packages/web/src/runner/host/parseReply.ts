import { z, type ScriptResult } from "@dispute-resolver/core";
import { ACCEPTED_MESSAGE_TYPE, ERROR_MESSAGE_TYPE, RESULT_MESSAGE_TYPE } from "../protocol";

/** Untrusted text from a script is bounded before it becomes part of a message. */
const MAX_SCRIPT_MESSAGE_LENGTH = 300;

type FailureReason = Extract<ScriptResult, { status: "failed" }>["reason"];

function okResult(value: unknown, jsonDuplicateKeys: boolean): ScriptResult {
  return { status: "ok", value, jsonDuplicateKeys };
}

export function failedResult(reason: FailureReason, message: string): ScriptResult {
  return { status: "failed", reason, message };
}

// The acknowledgement's schema reads no field but its type: anything else it carries is dropped here.
const portMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ACCEPTED_MESSAGE_TYPE) }),
  z.object({ type: z.literal(RESULT_MESSAGE_TYPE), value: z.unknown(), jsonDuplicateKeys: z.boolean() }),
  z.object({ type: z.literal(ERROR_MESSAGE_TYPE), message: z.string() }),
]);

/** The page's acknowledgement settles nothing; only a result or an error settles the run. */
type PortMessage = { readonly kind: "acknowledged" } | { readonly kind: "settled"; readonly result: ScriptResult };

export const MALFORMED_REPLY = failedResult("runner-error", "The script runner sent a malformed reply.");

const MALFORMED: PortMessage = { kind: "settled", result: MALFORMED_REPLY };

/** A result's value stays `unknown`: core validates it once it is merged into the meta-evidence. */
export function parsePortMessage(data: unknown): PortMessage {
  const parsed = portMessageSchema.safeParse(data);
  if (!parsed.success) return MALFORMED;
  const message = parsed.data;
  if (message.type === ACCEPTED_MESSAGE_TYPE) return { kind: "acknowledged" };
  if (message.type === RESULT_MESSAGE_TYPE) return { kind: "settled", result: okResult(message.value, message.jsonDuplicateKeys) };
  return { kind: "settled", result: failedResult("script-error", `The dynamic script failed: ${message.message.slice(0, MAX_SCRIPT_MESSAGE_LENGTH)}`) };
}
