import { metaEvidenceLocatorUrl } from "../../../../packages/core/src/metaEvidence";
import type { ChainId, Env } from "../../../../packages/core/src/types";
import { httpGet, type HttpGet, type RetryPolicy } from "../http";
import { isJsonObject } from "./gating";

/** The meta-evidence API's answer for one dispute (spec 9.1 step 1). */
export type LocatorResult =
  | { readonly status: "uri"; readonly uri: unknown }
  | { readonly status: "missing"; readonly detail: string }
  | { readonly status: "error"; readonly detail: string };

const DETAIL_LENGTH = 160;

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Asks the meta-evidence API named by `REACT_APP_METAEVIDENCE_URL` for a dispute's meta-evidence URI, read as core's
 * `loadMetaEvidence` reads it: the body is JSON whatever the HTTP status; a truthy `metaEvidenceUri` is the URI, any
 * other JSON object is `missing` (the API answers 400 for a dispute it cannot index), anything else is an `error`.
 */
export async function locateMetaEvidence(get: HttpGet, env: Env, chainId: ChainId, disputeId: bigint, retry?: RetryPolicy): Promise<LocatorResult> {
  const url = metaEvidenceLocatorUrl(env, chainId, disputeId);
  if (url === null) return { status: "error", detail: "REACT_APP_METAEVIDENCE_URL is not set." };
  const answer = await httpGet(get, url, retry);
  if (answer.kind === "failed") return { status: "error", detail: `The meta-evidence API did not answer: ${answer.detail}.` };
  const body = parse(answer.text);
  if (!isJsonObject(body)) return { status: "error", detail: `The meta-evidence API answered HTTP ${String(answer.status)} without a JSON object.` };
  const uri = body.metaEvidenceUri;
  if (uri) return { status: "uri", uri };
  const error = typeof body.error === "string" ? `: ${body.error.slice(0, DETAIL_LENGTH)}` : "";
  return { status: "missing", detail: `HTTP ${String(answer.status)}${error}` };
}
