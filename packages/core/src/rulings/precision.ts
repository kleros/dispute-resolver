/** A `0x` or `0X` prefix after optional leading whitespace and sign: where `parseInt` without a radix reads base 16. */
const HEX_PREFIX = /^\s*[+-]?0x/i;

/**
 * The decimals reality-eth-lib reads from a `decimals` field, for display (`bytes32ToString`) and for encoding
 * (`answerToBytes32`): `parseInt(String(value))` with no radix, so base 16 after a `0x` prefix (`"0x12"` is 18) and
 * base 10 otherwise; 0 when that is not a positive number.
 */
export function libDecimals(value: unknown): number {
  const text = String(value);
  const parsed = Number.parseInt(text, HEX_PREFIX.test(text) ? 16 : 10);
  return parsed > 0 ? parsed : 0;
}

/** `Number(value)`, made total: a value that cannot be converted (a symbol, a throwing `valueOf`) is `NaN`. */
function numberOf(value: unknown): number {
  try {
    return Number(value);
  } catch {
    return Number.NaN;
  }
}

/**
 * An untrusted `precision` (meta-evidence) or `decimals` (Reality.eth question) as the precision a `RulingOptions`
 * carries, read the way today's app ends up using it, so the precision shown and the precision encoded are one value:
 * - absent when `Number(value)` is not finite (today's `sanitizeRulingOptions` removes it);
 * - absent for a falsy value other than the number 0 (`null`, `false`, `""`): today encodes those with
 *   `precision || 18`, the default for an absent precision, and displays them with 0 decimals, as an absent one;
 * - otherwise reality-eth-lib's reading, `parseInt(String(value))` with its radix inference, 0 when not positive: `true`
 *   is 0, `"1e2"` is 1, `"6"` is 6, `2.7` is 2, `"0x12"` is 18.
 */
export function parsePrecision(value: unknown): number | undefined {
  if (value === undefined || !Number.isFinite(numberOf(value))) return undefined;
  if (!value && value !== 0) return undefined;
  try {
    return libDecimals(value);
  } catch {
    return undefined;
  }
}
