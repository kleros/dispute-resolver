import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** JSON with bigints written as decimal strings (block numbers and wei amounts exceed the safe integers). */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`;
}

/** Writes `text` to `path` through a temporary file, so a reader never sees a half-written output. */
export function writeTextAtomically(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

/** The parsed JSON of a file, `unknown` until a schema accepts it. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
