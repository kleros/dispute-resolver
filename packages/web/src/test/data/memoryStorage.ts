/** A Map-backed `Storage` subset for the persister and the Reality cache, with a switch that makes every call throw. */
export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly entries: Map<string, string>;
  /** When set, every call throws as a blocked or full browser storage does. */
  failing: boolean;
}

export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): MemoryStorage {
  const entries = new Map(Object.entries(initial));
  const storage: MemoryStorage = {
    entries,
    failing: false,
    getItem(key) {
      if (storage.failing) throw new Error("storage is blocked");
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      if (storage.failing) throw new Error("storage is full");
      entries.set(key, value);
    },
    removeItem(key) {
      if (storage.failing) throw new Error("storage is blocked");
      entries.delete(key);
    },
  };
  return storage;
}
