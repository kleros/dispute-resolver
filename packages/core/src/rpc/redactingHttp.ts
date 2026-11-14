import { http, type EIP1193RequestOptions, type HttpTransportConfig, type Transport } from "viem";
import { causeChain } from "./errors";
import { urlPieces } from "./urlPieces";

/** How deep an answer's values are followed; a node's error data nests a revert one level down at most. */
const MAX_VALUE_DEPTH = 8;

/** The fields in which viem's errors, and the errors they wrap, quote the URL, the RPC's answer or its headers. */
const ERROR_FIELDS = ["message", "stack", "details", "shortMessage", "url", "metaMessages", "data", "headers"] as const;

const REDACTED = "<redacted>";

/** What a header name carries in place of a piece of the URL: a header name cannot hold `<` or `>`. */
const REDACTED_NAME = "redacted";

const NOT_JSON = "The RPC's answer is not JSON.";

/** Revert data, which viem decodes into the contract's error. */
const HEX = /^0x[\da-f]*$/i;

export interface JsonRpcRequest {
  readonly method: string;
  readonly params?: unknown;
}

interface Redactor {
  readonly text: (text: string) => string;
  /** For a name `Headers` gives, which it has lowercased. */
  readonly headerName: (name: string) => string;
}

interface UrlParts {
  readonly origin: string;
  readonly spellings: readonly string[];
  readonly pieces: readonly string[];
}

/**
 * The spellings of `url` an error can carry: as configured, as parsed, and without credentials, which is how viem prints
 * a URL that has them. Then every other piece of it, which an RPC's answer can repeat without the URL (a key it rejects,
 * say); the origin is what the errors show, so its own pieces stay.
 */
function urlParts(url: string): UrlParts {
  if (!URL.canParse(url)) return { origin: "the configured RPC", spellings: [url], pieces: [] };
  const parsed = new URL(url);
  const href = parsed.href;
  parsed.username = "";
  parsed.password = "";
  const { origin } = parsed;
  const spellings = [...new Set([url, href, parsed.href])].filter((spelling) => spelling !== origin).sort((left, right) => right.length - left.length);
  return { origin, spellings, pieces: urlPieces(url).filter((piece) => !origin.includes(piece)) };
}

/**
 * Replaces every spelling of `url` with its origin and every other piece of it with a marker. Hex is matched in any
 * letter case, and only rewritten when it holds a piece: revert data never does, so viem still decodes it.
 */
function urlRedactor(url: string): Redactor {
  const { origin, spellings, pieces } = urlParts(url);
  const lowered = pieces.map((piece) => piece.toLowerCase());
  const ignoringCase = (text: string, marker: string): string => lowered.reduce((redacted, piece) => redacted.replaceAll(piece, marker), text.toLowerCase());
  const hex = (text: string): string => {
    const lower = text.toLowerCase();
    return lowered.some((piece) => lower.includes(piece)) ? ignoringCase(lower, REDACTED) : text;
  };
  const text = (value: string): string => {
    if (HEX.test(value)) return hex(value);
    const named = spellings.reduce((redacted, spelling) => redacted.replaceAll(spelling, origin), value);
    return pieces.reduce((redacted, piece) => redacted.replaceAll(piece, REDACTED), named);
  };
  return { text, headerName: (name) => ignoringCase(name, REDACTED_NAME) };
}

interface Walk extends Redactor {
  readonly seen: WeakSet<object>;
}

function isJsonContainer(value: object): boolean {
  return Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;
}

/** A copy, since a response's own headers cannot be changed. */
function redactHeaders(headers: Headers, walk: Walk): Headers {
  const copy = new Headers();
  headers.forEach((value, name) => {
    copy.append(walk.headerName(name), walk.text(value));
  });
  return copy;
}

/**
 * The `keys` of `object` rewritten in place, a property whose name carries a piece of the URL renamed, since the object
 * can be held elsewhere too.
 */
function redactProperties(object: object, keys: readonly string[], walk: Walk, depth: number): void {
  const named = !Array.isArray(object);
  for (const key of keys) {
    const name = named ? walk.text(key) : key;
    const value = redactValue(Reflect.get(object, key), walk, depth);
    if (name !== key) Reflect.deleteProperty(object, key);
    Reflect.set(object, name, value);
  }
}

/**
 * `value` with every string in it redacted, arrays and plain objects rewritten in place and headers copied. An object met
 * again is left as it is: the data of viem's `RpcRequestError` is the very object of the node's error it wraps. What
 * lies deeper than anyone needs is dropped rather than walked.
 */
function redactValue(value: unknown, walk: Walk, depth: number): unknown {
  if (typeof value === "string") return walk.text(value);
  if (value instanceof Headers) return redactHeaders(value, walk);
  if (typeof value !== "object" || value === null || walk.seen.has(value) || !isJsonContainer(value)) return value;
  if (depth >= MAX_VALUE_DEPTH) return REDACTED;
  walk.seen.add(value);
  redactProperties(value, Object.keys(value), walk, depth + 1);
  return value;
}

/** An error class quotes the URL and the answer in known fields only. */
function redactFields(link: Error, walk: Walk): void {
  for (const field of ERROR_FIELDS) {
    const value: unknown = Reflect.get(link, field);
    const redacted = redactValue(value, walk, 0);
    // Never adds a field: viem finds a revert's data on the first error in the chain that has a `data` field at all.
    if (redacted !== value) Reflect.set(link, field, redacted);
  }
}

/**
 * Rewritten in place, so the class, code, status and causes are the ones viem gave the error. `Reflect` never throws,
 * so a field that cannot be written can never replace the request's own error.
 */
function redactError(error: unknown, redactor: Redactor): unknown {
  const links = causeChain(error).filter((link): link is object => typeof link === "object" && link !== null);
  // A parse error quotes the start of the answer, which can stop partway through a key no redaction can recognise, and
  // viem copies its message into the details and message of every error that wraps it.
  const parseMessages = links.filter((link): link is SyntaxError => link instanceof SyntaxError && link.message !== "").map((link) => link.message);
  const text = (value: string): string => redactor.text(parseMessages.reduce((redacted, message) => redacted.replaceAll(message, NOT_JSON), value));
  const walk: Walk = { text, headerName: redactor.headerName, seen: new WeakSet() };
  for (const link of links) {
    if (link instanceof Error) {
      redactFields(link, walk);
    } else {
      // A node's own error object is all answer.
      const fields = Object.keys(link).filter((key) => key !== "cause");
      redactProperties(link, fields, walk, 0);
    }
  }
  return error;
}

export function rethrowMapped<TTransport extends ReturnType<Transport>>(transport: TTransport, map: (error: unknown) => unknown): TTransport {
  const request = async (call: JsonRpcRequest, options?: EIP1193RequestOptions): Promise<unknown> => {
    try {
      return await transport.request(call, options);
    } catch (error) {
      throw map(error);
    }
  };
  return { ...transport, request: request as TTransport["request"] };
}

/**
 * viem's `http` transport whose errors name the RPC by its origin only. viem writes the full URL, and with it the API key
 * in its path or query, into the message, stack and `url` of every request error, and the RPC's answer into its details
 * and data, where a console, a log or the screen would show them. Requests still go to the full URL.
 */
export function redactingHttp(url: string, config?: HttpTransportConfig): Transport {
  const redactor = urlRedactor(url);
  return (parameters) => rethrowMapped(http(url, config)(parameters), (error) => redactError(error, redactor));
}
