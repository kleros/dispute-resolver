/**
 * `String(value)`, the coercion of option titles and descriptions, made total:
 * a value whose `toString` and `valueOf` are not callable (`{"toString": 1}`) makes `String` throw, and is named by its
 * class instead. Both producers of ruling options, the meta-evidence schema and the Reality derivation, title untrusted
 * values with it, so the same value gets the same title from either.
 */
export function toText(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
