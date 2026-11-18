/** Run a job over a list one item at a time, with progress, a stop button and early exit. */

export type ItemResult = 'ok' | 'skipped' | 'failed' | 'stop';

export interface BatchProgress {
  done: number;
  total: number;
  ok: number;
  skipped: number;
  failed: number;
}

export interface BatchOutcome extends BatchProgress {
  /** True when the run ended before the last item. */
  stopped: boolean;
}

export async function runBatch<T>(
  items: T[],
  work: (item: T, index: number) => Promise<ItemResult>,
  options: { onProgress?: (progress: BatchProgress) => void; signal?: AbortSignal } = {},
): Promise<BatchOutcome> {
  const progress: BatchProgress = { done: 0, total: items.length, ok: 0, skipped: 0, failed: 0 };
  let stopped = false;
  for (const [index, item] of items.entries()) {
    if (options.signal?.aborted) {
      stopped = true;
      break;
    }
    let result: ItemResult;
    try {
      result = await work(item, index);
    } catch {
      result = 'failed';
    }
    if (result === 'stop') {
      stopped = true;
      break;
    }
    progress.done += 1;
    progress[result] += 1;
    options.onProgress?.({ ...progress });
  }
  return { ...progress, stopped };
}
