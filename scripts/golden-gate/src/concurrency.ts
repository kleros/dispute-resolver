/**
 * Maps `items` through `task` with at most `limit` tasks in flight, keeping the input order in the result. A rejected
 * task rejects the whole map once the tasks already in flight settle; callers that must not stop on one failure catch
 * inside `task`.
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`The concurrency limit must be a positive integer (got ${String(limit)}).`);
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
