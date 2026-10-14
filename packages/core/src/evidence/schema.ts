import { z } from "zod";
import type { Outcome } from "../types";
import { toAttachmentLink } from "../uri";
import type { GatewayOrigin } from "../uri/types";
import { fail, succeed } from "./outcome";
import type { EvidenceItem } from "./types";

type EvidenceDocumentFields = Pick<EvidenceItem, "title" | "description" | "attachment">;

/**
 * A value React renders as text today: strings as they are, numbers as their decimal text, `true`, `false`, `null` and
 * a missing key as nothing. Objects and arrays, which crash or garble today's timeline, fail the schema (A17, D-22).
 */
const displayText = z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]).transform((value) => {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : "";
});

/** An attachment reference: a string, or a falsy value meaning none. Today a truthy non-string crashes the link. */
const attachmentUri = z.union([z.string(), z.literal([false, 0]), z.null(), z.undefined()]).transform((value) => (typeof value === "string" ? value : null));

/**
 * The evidence JSON of spec 9.3. Only the fields today's timeline reads are validated, and only when it reads them:
 * the heading is `title || name`, and the attachment is `fileURI || evidence` (the legacy key), so an unused `name` or
 * `evidence` value never hides an entry that renders today.
 */
const evidenceJsonSchema = z
  .looseObject({
    title: z.unknown().optional(),
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    fileURI: z.unknown().optional(),
    evidence: z.unknown().optional(),
  })
  .transform(({ title, name, description, fileURI, evidence }) => ({
    heading: isTruthy(title) ? title : name,
    description,
    attachment: isTruthy(fileURI) ? fileURI : evidence,
  }))
  .pipe(z.object({ heading: displayText, description: displayText, attachment: attachmentUri }));

/**
 * Validates one evidence JSON document (spec 9.3, A17). The title is `title`, or `name` when `title` is empty; the
 * description is plain text; the attachment comes from `fileURI`, else the legacy `evidence` key, through
 * `toAttachmentLink`, and is never fetched (B7). A document that fails is `invalid-data`.
 */
export function parseEvidenceDocument(value: unknown, gateway: GatewayOrigin): Outcome<EvidenceDocumentFields> {
  const parsed = evidenceJsonSchema.safeParse(value);
  if (!parsed.success) return fail<EvidenceDocumentFields>("invalid-data", "The evidence JSON does not match the evidence schema.");
  const { heading, description, attachment } = parsed.data;
  return succeed<EvidenceDocumentFields>({ title: heading, description, attachment: attachment === null ? null : toAttachmentLink(attachment, gateway) });
}

/** JavaScript truthiness, the `||` test today's timeline applies to the untrusted fields. */
function isTruthy(value: unknown): boolean {
  return Boolean(value);
}
