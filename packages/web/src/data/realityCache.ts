import type { RealityQuestion, RealityQuestionCache } from "@dispute-resolver/core";
import type { PersistStorage } from "./persistence";

/**
 * Values come back as `unknown` and core validates them before use. Every storage access is guarded: a blocked or full
 * storage only means the question is looked up again.
 */
export function createRealityQuestionCache(storage: PersistStorage | undefined): RealityQuestionCache {
  return {
    get(key: string): unknown {
      try {
        const text = storage?.getItem(key) ?? null;
        return text === null ? undefined : (JSON.parse(text) as unknown);
      } catch {
        return undefined;
      }
    },
    set(key: string, question: RealityQuestion): void {
      try {
        storage?.setItem(key, JSON.stringify(question));
      } catch {
        // A full or blocked storage leaves the question uncached; the next load looks it up again.
      }
    },
    remove(key: string): void {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to undo: an entry that cannot be removed is validated again, and rejected, on its next read.
      }
    },
  };
}
