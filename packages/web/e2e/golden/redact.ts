import { createHash } from "node:crypto";

// How the golden suite and the golden gate (scripts/golden-gate) write a URL that could carry an API key: RPC URLs from
// `.env` or from production put the key in the path or the query, so such a URL is written as its host plus a short
// SHA-256 fingerprint of the whole URL. Two equal URLs keep equal values, so the comparison still sees whether two runs
// used the same endpoint, and neither the key nor the full URL reaches a snapshot, a report or a log.

const FINGERPRINT_LENGTH = 12;
const NOT_A_URL = "not-a-url";
/** The written form: a host (or `not-a-url`) and the fingerprint. */
const REDACTED = /^\S+ sha256:[\da-f]{12}$/;
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;
/** An absolute URL inside a text: the scheme is bounded so a long word without `://` is scanned once. */
const URL_IN_TEXT = /\b[a-z][a-z\d+.-]{0,31}:\/\/[^\s"'`<>]+/gi;
/** A parameter or field name that holds an RPC URL (`jsonRpcUrl`, `arbitratorJsonRpcUrl`, the D-35 rule key). */
const RPC_NAME = /rpc/i;

function fingerprintOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, FINGERPRINT_LENGTH);
}

/**
 * A URL as `<host> sha256:<fingerprint>`. A value that is not an absolute URL keeps only the fingerprint (`not-a-url`),
 * since a scheme-less `host/v3/<key>` would still carry the key. A value already in the written form is returned as
 * is, so a record can be redacted again on its way to a file.
 */
export function redactUrl(value: string): string {
  if (REDACTED.test(value)) return value;
  const host = ABSOLUTE_URL.test(value) && URL.canParse(value) ? new URL(value).host : "";
  return `${host === "" ? NOT_A_URL : host} sha256:${fingerprintOf(value)}`;
}

/** A text with every absolute URL in it (a request URL in a console line or an error message) redacted. */
export function redactUrlsIn(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => redactUrl(url));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A mismatch of an RPC rule (`{ key: "evidenceDisplay.params.rpc", production, next }`), whose values are RPC URLs. */
function isRpcMismatch(value: Readonly<Record<string, unknown>>): boolean {
  return typeof value.key === "string" && RPC_NAME.test(value.key);
}

/** Every string under an RPC name, nested ones included, redacted as a URL. */
function redactRpcValue(value: unknown): unknown {
  if (typeof value === "string") return redactUrl(value);
  if (Array.isArray(value)) return value.map(redactRpcValue);
  return isRecord(value) ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactRpcValue(item)])) : value;
}

/**
 * A structured record with every RPC URL redacted: the string value of any property whose name names an RPC
 * (`arbitratorJsonRpcUrl`, `jsonRpcUrl`), and the compared values of a mismatch under an RPC rule key. Everything else
 * is copied as it is.
 */
export function redactRpcFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRpcFields);
  if (!isRecord(value)) return value;
  const rpcMismatch = isRpcMismatch(value);
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => {
      const holdsRpc = RPC_NAME.test(name) || (rpcMismatch && (name === "production" || name === "next"));
      return [name, holdsRpc ? redactRpcValue(item) : redactRpcFields(item)];
    }),
  );
}
