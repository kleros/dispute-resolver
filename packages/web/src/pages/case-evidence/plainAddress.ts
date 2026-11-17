const SHOWN_MAX = 200;
/** Tab, carriage return, line feed and the line and paragraph separators, in runs. */
const BREAKS = /[\t\r\n\u2028\u2029]+/gu;
/**
 * Controls (C0, C1), format characters (bidi overrides and isolates, zero-width marks, every other Cf), lone surrogates,
 * and line and paragraph separators.
 */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;
/** One run of line breaks and tabs from `lastIndex`, which becomes one space however long. */
const BREAK_RUN = /[\t\r\n\u2028\u2029]+/uy;
/** A character that is not a space once plain; a vertical tab, form feed or U+FEFF trims as raw text but becomes U+FFFD. */
const NOT_BLANK = /[^\t\r\n\u2028\u2029\p{Zs}]/u;

/**
 * An untrusted evidence address as plain text: each run of line breaks and tabs becomes one space, then each other
 * character that could hide, reorder or break the text around it becomes U+FFFD.
 */
export function plainAddress(address: string): string {
  return address.replaceAll(BREAKS, " ").replaceAll(UNSAFE, "\uFFFD");
}

/** The first 200 characters of `text` followed by "…", or `null` when it has no more; only those characters are read. */
export function shortened(text: string): string | null {
  let count = 0;
  let end = 0;
  for (const character of text) {
    if (count === SHOWN_MAX) return `${text.slice(0, end)}…`;
    count += 1;
    end += character.length;
  }
  return null;
}

/**
 * The shortest start of `address` whose plain text has more than 200 characters, or all of it when it has no more. Its
 * plain text is the start of the whole plain text, so the cut view reads no further.
 */
export function plainHead(address: string): string {
  let shown = 0;
  let index = 0;
  while (index < address.length && shown <= SHOWN_MAX) {
    shown += 1;
    BREAK_RUN.lastIndex = index;
    if (BREAK_RUN.test(address)) index = BREAK_RUN.lastIndex;
    else index += (address.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
  }
  return address.slice(0, index);
}

/** Whether the plain text of `address` is empty or only spaces, read only as far as its first other character. */
export function plainIsBlank(address: string): boolean {
  return !NOT_BLANK.test(address);
}
