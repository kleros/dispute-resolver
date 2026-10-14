/** The windows-1252 byte of each character the decoder maps to a code point outside Latin-1 (0x80–0x9F). */
const WINDOWS_1252_SPECIALS: ReadonlyMap<string, number> = new Map([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const LATIN_1_LIMIT = 0xff;

/** The windows-1252 bytes a string decodes from, or `null` when a character cannot come from that decoder. */
function windows1252Bytes(text: string): number[] | null {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const special = WINDOWS_1252_SPECIALS.get(character);
    if (special !== undefined) bytes.push(special);
    else if (code <= LATIN_1_LIMIT) bytes.push(code);
    else return null;
  }
  return bytes;
}

function isContinuation(byte: number | undefined): boolean {
  return byte !== undefined && byte >= 0x80 && byte <= 0xbf;
}

/** The length of the UTF-8 multi-byte sequence a lead byte starts, or 0 when it starts none. */
function sequenceLength(lead: number): number {
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

/**
 * Whether a string looks like UTF-8 text decoded as windows-1252, the fallback of a document without a charset in an
 * opaque-origin frame (ADR 0004): it contains U+FFFD, or every character maps back to a windows-1252 byte and those
 * bytes contain a complete UTF-8 multi-byte sequence (`␟` read as `â\u0090\u009f`, `é` as `Ã©`).
 */
export function looksGarbled(text: string): boolean {
  if (text.includes("�")) return true;
  const bytes = windows1252Bytes(text);
  if (bytes === null) return false;
  return bytes.some((lead, index) => {
    const length = sequenceLength(lead);
    if (length === 0) return false;
    for (let offset = 1; offset < length; offset += 1) if (!isContinuation(bytes[index + offset])) return false;
    return true;
  });
}

/** Every string of a structured value: object keys and values, array items, nested. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([key, item]) => [key, ...stringsOf(item)]);
  return [];
}

/** Whether any string of a script's output looks charset-garbled (04 §5: counts as a production failure). */
export function hasGarbledText(value: unknown): boolean {
  return stringsOf(value).some(looksGarbled);
}

/** Whether a script's text holds a literal non-ASCII character, which an opaque frame without a charset misreads. */
export function hasNonAsciiLiteral(scriptText: string): boolean {
  for (let index = 0; index < scriptText.length; index += 1) if (scriptText.charCodeAt(index) > 0x7f) return true;
  return false;
}
