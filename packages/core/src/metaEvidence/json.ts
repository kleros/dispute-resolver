/** A JSON object read from untrusted meta-evidence or a dynamic script's result. Its values stay `unknown`. */
export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * Today's `isPlainObject`, tightened to ordinary objects: a value whose prototype is `Object.prototype` or `null`. Arrays,
 * and the `Map`, `Date` or `RegExp` a script can hand back through structured cloning, are not plain objects.
 */
export function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** An own property of `value`, never one inherited from a prototype. */
export function own(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}

/** JavaScript truthiness: the `||` and `if (x)` tests today's pipeline applies to untrusted fields (spec 9.1). */
export function isTruthy(value: unknown): boolean {
  return Boolean(value);
}
