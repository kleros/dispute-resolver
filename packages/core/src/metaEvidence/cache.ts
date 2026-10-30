import { z } from "../zod";
import type { ScriptKind } from "../types";
import { normalizeIpfsPath, parseAbsoluteUrl } from "../uri";
import type { CanonicalIpfsPath } from "../uri/types";
import { metaEvidenceShape, oneOf } from "./schema";
import type { LocatorComparison, MetaEvidenceCachePolicy, MetaEvidenceResult, MetaEvidenceSource, ScriptOutcome } from "./types";

type NotRunReason = Extract<ScriptOutcome, { ran: false }>["reason"];
type LocatorDecidedReason = Extract<MetaEvidenceSource, { kind: "locator" }>["event"];

const NOT_RUN_REASONS: Readonly<Record<NotRunReason, true>> = {
  "no-script": true,
  "registered-reality-proxy": true,
  "script-fetch-failed": true,
  "script-chain-unavailable": true,
};
const SCRIPT_KINDS: Readonly<Record<ScriptKind, true>> = { reality: true, standard: true };
const LOCATOR_COMPARISONS: Readonly<Record<LocatorComparison, true>> = { agrees: true, disagrees: true, missing: true, unavailable: true };
const LOCATOR_DECIDED_REASONS: Readonly<Record<LocatorDecidedReason, true>> = {
  "not-read": true,
  "dispute-event-not-found": true,
  "dispute-event-ambiguous": true,
  "meta-evidence-event-not-found": true,
  unavailable: true,
};

const scriptOutcomeShape = z.discriminatedUnion("ran", [
  z.object({ ran: z.literal(false), reason: oneOf(NOT_RUN_REASONS) }),
  z.object({ ran: z.literal(true), kind: oneOf(SCRIPT_KINDS), jsonDuplicateKeys: z.boolean() }),
]);

const canonicalPath = z.custom<CanonicalIpfsPath>((value) => typeof value === "string" && normalizeIpfsPath(value) === value);

function isGatewayFileUrl(fileUrl: string, uri: string): boolean {
  const url = parseAbsoluteUrl(fileUrl);
  return url?.protocol === "https:" && `${url.origin}${uri}` === fileUrl;
}

/** An entry persisted without a source fails this shape and is fetched again. */
const sourceShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), locator: oneOf(LOCATOR_COMPARISONS), locatorPath: canonicalPath.nullable() }),
  z.object({ kind: z.literal("locator"), event: oneOf(LOCATOR_DECIDED_REASONS) }),
]);

const cachedOkShape = z
  .object({ status: z.literal("ok"), metaEvidence: metaEvidenceShape, uri: canonicalPath, fileUrl: z.string(), script: scriptOutcomeShape, source: sourceShape })
  .refine((result) => isGatewayFileUrl(result.fileUrl, result.uri));

/** A rejection is never cached: the pointer behind it is mutable and a re-emission can fix it. */
export function metaEvidenceCachePolicy(result: MetaEvidenceResult): MetaEvidenceCachePolicy {
  switch (result.status) {
    case "ok":
      return "persist";
    case "invalid":
      return "never";
    case "missing":
    case "failed":
      return "memory-brief";
  }
}

/**
 * Only an accepted result is ever persisted, so anything else, or an entry that fails the schema, is `null` and must be
 * fetched again. The value returned is a fresh object, never the stored one.
 */
export function parseCachedMetaEvidenceResult(value: unknown): MetaEvidenceResult | null {
  const parsed = cachedOkShape.safeParse(value);
  return parsed.success ? parsed.data : null;
}
