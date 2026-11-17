/** A JSON object read from untrusted meta-evidence or a dynamic script's result. Its values stay `unknown`. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Arrays, and the `Map`, `Date` or `RegExp` a script can hand back through structured cloning, are not plain objects. */
export function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function own(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}
