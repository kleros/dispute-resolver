import { z } from "../zod";
import type { Outcome } from "../types";
import { toAttachmentLink } from "../uri";
import type { GatewayOrigin } from "../uri/types";
import { fail, succeed } from "./outcome";
import type { EvidenceItem } from "./types";

type EvidenceDocumentFields = Pick<EvidenceItem, "title" | "description" | "attachment">;

/**
 * A value React renders as text: strings as they are, numbers as their decimal text, `true`, `false`, `null` and a
 * missing key as nothing. Objects and arrays, which would crash or garble the timeline, fail the schema.
 */
const displayText = z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]).transform((value) => {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : "";
});

/** A string, or a falsy value meaning none; a truthy non-string fails the schema because it would crash the link. */
const attachmentUri = z.union([z.string(), z.literal([false, 0]), z.null(), z.undefined()]).transform((value) => (typeof value === "string" ? value : null));

/**
 * Only the fields the timeline reads are validated, and only when it reads them: the heading is `title || name` and the
 * attachment is `fileURI || evidence` (the legacy key), so an unused `name` or `evidence` value never hides an entry.
 */
const evidenceJsonSchema = z
  .looseObject({
    title: z.unknown().optional(),
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    fileURI: z.unknown().optional(),
    evidence: z.unknown().optional(),
  })
  .transform(({ title, name, description, fileURI, evidence }) => {
    const hasTitle = Boolean(title);
    const hasFileUri = Boolean(fileURI);
    return { heading: hasTitle ? title : name, description, attachment: hasFileUri ? fileURI : evidence };
  })
  .pipe(z.object({ heading: displayText, description: displayText, attachment: attachmentUri }));

/** The attachment is never fetched. */
export function parseEvidenceDocument(value: unknown, gateway: GatewayOrigin): Outcome<EvidenceDocumentFields> {
  const parsed = evidenceJsonSchema.safeParse(value);
  if (!parsed.success) return fail<EvidenceDocumentFields>("invalid-data", "The evidence JSON does not match the evidence schema.");
  const { heading, description, attachment } = parsed.data;
  return succeed<EvidenceDocumentFields>({ title: heading, description, attachment: attachment === null ? null : toAttachmentLink(attachment, gateway) });
}
