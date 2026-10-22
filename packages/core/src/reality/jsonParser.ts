/** A syntax error of the strict JSON parser. */
export class JsonSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonSyntaxError";
  }
}

/** Where a template placeholder sits in the JSON structure. */
export type PlaceholderContext = "key" | "string" | "value" | "array";

export interface PlaceholderUse {
  readonly index: number;
  readonly context: PlaceholderContext;
}

export interface ParsedJson {
  readonly value: unknown;
  readonly hasDuplicateKeys: boolean;
  readonly placeholders: readonly PlaceholderUse[];
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WHITESPACE = " \t\n\r";
const DIGITS = "0123456789";

/** Any `@@<nonce>#` prefix a placeholder token could start with, found in one pass over the template. */
const TOKEN_PREFIX = /@@kleros(\d+)#/g;

/**
 * Placeholder tokens a template's `%s` are replaced with before it is analyzed: `@@kleros<n>#<index>@@`. The template is
 * untrusted (anyone can create one), so `<n>` is the first counter whose prefix `@@kleros<n>#` does not occur in it,
 * found in a single pass: a template stuffed with prefixes cannot make the choice cost more than reading it once.
 */
export class Sentinels {
  private readonly prefix: string;

  constructor(templateText: string) {
    const taken = new Set<string>();
    for (const match of templateText.matchAll(TOKEN_PREFIX)) taken.add(match[1] ?? "");
    let counter = 0;
    while (taken.has(String(counter))) counter += 1;
    this.prefix = `@@kleros${String(counter)}#`;
  }

  token(index: number): string {
    return `${this.prefix}${String(index)}@@`;
  }

  /** The placeholder index and the token length when a token starts at `position`. */
  matchAt(text: string, position: number): { readonly index: number; readonly length: number } | null {
    if (!text.startsWith(this.prefix, position)) return null;
    const digitsStart = position + this.prefix.length;
    let digitsEnd = digitsStart;
    while (digitsEnd < text.length && DIGITS.includes(text.charAt(digitsEnd))) digitsEnd += 1;
    if (digitsEnd === digitsStart || !text.startsWith("@@", digitsEnd)) return null;
    return { index: Number(text.slice(digitsStart, digitsEnd)), length: digitsEnd + 2 - position };
  }

  /** The placeholder indexes of every token inside `text`, in order. */
  indexesIn(text: string): number[] {
    const indexes: number[] = [];
    let from = 0;
    for (;;) {
      const found = text.indexOf(this.prefix, from);
      if (found === -1) return indexes;
      const match = this.matchAt(text, found);
      if (match !== null) indexes.push(match.index);
      from = found + (match?.length ?? 1);
    }
  }
}

/**
 * Minimal strict JSON parser (RFC 8259 grammar, same as `JSON.parse`) that also:
 * - records whether an object has duplicate keys;
 * - optionally recognizes placeholder tokens and records their context.
 */
class JsonScanner {
  private position = 0;
  private duplicateKeys = false;
  private readonly placeholders: PlaceholderUse[] = [];

  constructor(
    private readonly text: string,
    private readonly sentinels: Sentinels | null,
  ) {}

  parse(): ParsedJson {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.text.length) this.fail("Unexpected trailing data");
    return { value, hasDuplicateKeys: this.duplicateKeys, placeholders: this.placeholders };
  }

  private fail(message: string): never {
    throw new JsonSyntaxError(`${message} at position ${String(this.position)}`);
  }

  private current(): string {
    return this.text.charAt(this.position);
  }

  private skipWhitespace(): void {
    while (this.position < this.text.length && WHITESPACE.includes(this.current())) this.position += 1;
  }

  private matchSentinel(): number | null {
    const match = this.sentinels?.matchAt(this.text, this.position) ?? null;
    if (match === null) return null;
    this.position += match.length;
    return match.index;
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const char = this.current();
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"') return this.parseString(false);
    if (char === "t") return this.parseLiteral("true", true);
    if (char === "f") return this.parseLiteral("false", false);
    if (char === "n") return this.parseLiteral("null", null);
    const index = this.matchSentinel();
    if (index !== null) {
      this.placeholders.push({ index, context: "value" });
      return null;
    }
    return this.parseNumber();
  }

  private parseString(isKey: boolean): string {
    const start = this.position;
    this.position += 1; // Opening quote.
    while (this.position < this.text.length && this.current() !== '"') {
      const code = this.text.codePointAt(this.position);
      if (code === undefined || code < 0x20) this.fail("Control character in string");
      this.position += this.current() === "\\" ? 2 : 1;
    }
    if (this.position >= this.text.length) this.fail("Unterminated string");
    this.position += 1; // Closing quote.
    const raw = this.text.slice(start, this.position);
    const value = this.validatedString(raw);
    for (const index of this.sentinels?.indexesIn(raw) ?? []) this.placeholders.push({ index, context: isKey ? "key" : "string" });
    return value;
  }

  /** The string a quoted token denotes; `JSON.parse` validates its escapes. */
  private validatedString(raw: string): string {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === "string") return value;
    } catch {
      // Reported below, with the position.
    }
    return this.fail("Invalid string");
  }

  private parseNumber(): number {
    NUMBER.lastIndex = this.position;
    const result = NUMBER.exec(this.text);
    if (result === null) this.fail("Unexpected token");
    this.position += result[0].length;
    return Number(result[0]);
  }

  private parseLiteral(literal: string, value: boolean | null): boolean | null {
    if (!this.text.startsWith(literal, this.position)) this.fail("Unexpected token");
    this.position += literal.length;
    return value;
  }

  private parseArray(): unknown[] {
    this.position += 1; // [
    this.skipWhitespace();
    if (this.parseWholeArrayPlaceholder()) return [];
    const array: unknown[] = [];
    if (this.current() === "]") {
      this.position += 1;
      return array;
    }
    for (;;) {
      array.push(this.parseValue());
      this.skipWhitespace();
      const separator = this.current();
      if (separator === "]") {
        this.position += 1;
        return array;
      }
      if (separator !== ",") this.fail("Expected ',' or ']'");
      this.position += 1;
    }
  }

  /** `[<placeholder>]`: the placeholder is the whole body of the array, recorded as an "array" context. */
  private parseWholeArrayPlaceholder(): boolean {
    const bodyStart = this.position;
    const index = this.matchSentinel();
    if (index === null) return false;
    this.skipWhitespace();
    if (this.current() === "]") {
      this.position += 1;
      this.placeholders.push({ index, context: "array" });
      return true;
    }
    this.position = bodyStart; // Not the whole array body: parseValue records it as a "value".
    return false;
  }

  private parseObject(): Record<string, unknown> {
    this.position += 1; // {
    const object: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.skipWhitespace();
    if (this.current() === "}") {
      this.position += 1;
      return object;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.current() !== '"') this.fail("Expected string key");
      const key = this.parseString(true);
      if (seen.has(key)) this.duplicateKeys = true;
      seen.add(key);
      this.skipWhitespace();
      if (this.current() !== ":") this.fail("Expected ':'");
      this.position += 1;
      // defineProperty so that e.g. "__proto__" is an own property, like with JSON.parse, and never changes the prototype.
      Object.defineProperty(object, key, { value: this.parseValue(), enumerable: true, writable: true, configurable: true });
      this.skipWhitespace();
      const separator = this.current();
      if (separator === "}") {
        this.position += 1;
        return object;
      }
      if (separator !== ",") this.fail("Expected ',' or '}'");
      this.position += 1;
    }
  }
}

/** Parses `text`; throws `JsonSyntaxError` for anything `JSON.parse` would reject. */
export function parseJson(text: string, sentinels: Sentinels | null = null): ParsedJson {
  return new JsonScanner(text, sentinels).parse();
}
