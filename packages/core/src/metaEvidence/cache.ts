import { z } from "zod";
import type { ScriptKind } from "../types";
import { normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath } from "../uri/types";
import { metaEvidenceShape, oneOf } from "./schema";
import type { MetaEvidenceCachePolicy, MetaEvidenceResult, ScriptOutcome } from "./types";

type NotRunReason = Extract<ScriptOutcome, { ran: false }>["reason"];

const NOT_RUN_REASONS: Readonly<Record<NotRunReason, true>> = { "no-script": true, "registered-reality-proxy": true, "script-fetch-failed": true };
const SCRIPT_KINDS: Readonly<Record<ScriptKind, true>> = { reality: true, standard: true };

const scriptOutcomeShape = z.discriminatedUnion("ran", [
  z.object({ ran: z.literal(false), reason: oneOf(NOT_RUN_REASONS) }),
  z.object({ ran: z.literal(true), kind: oneOf(SCRIPT_KINDS), jsonDuplicateKeys: z.boolean() }),
]);

/** A canonical IPFS path is a fixed point of `normalizeIpfsPath` (uri/types.ts). */
const canonicalPath = z.custom<CanonicalIpfsPath>((value) => typeof value === "string" && normalizeIpfsPath(value) === value);

/** Whether `fileUrl` is the https gateway URL of `uri`: a bare https origin followed by the canonical path. */
function isGatewayFileUrl(fileUrl: string, uri: string): boolean {
  try {
    const url = new URL(fileUrl);
    return url.protocol === "https:" && `${url.origin}${uri}` === fileUrl;
  } catch {
    return false;
  }
}

const cachedOkShape = z
  .object({ status: z.literal("ok"), metaEvidence: metaEvidenceShape, uri: canonicalPath, fileUrl: z.string(), script: scriptOutcomeShape })
  .refine((result) => isGatewayFileUrl(result.fileUrl, result.uri));

/**
 * How a result may be cached (A2, B15, D-13, D-38): an accepted meta-evidence is persisted; a failure or a missing
 * meta-evidence is kept briefly in memory; a rejection is never cached, because the pointer behind it is mutable and a
 * re-emission can fix it.
 */
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
 * Re-validates a persisted meta-evidence result read back from storage (B15, D-13) with the schema the pipeline's output
 * satisfies. Only an accepted (`ok`) result is ever persisted, so anything else, or any entry that fails the schema, is
 * `null` and must be fetched again. The value returned is a fresh object, never the stored one.
 */
export function parseCachedMetaEvidenceResult(value: unknown): MetaEvidenceResult | null {
  const parsed = cachedOkShape.safeParse(value);
  return parsed.success ? parsed.data : null;
}
