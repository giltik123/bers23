/** Creates a UUID without introducing a third-party dependency. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Resolves after the supplied delay and supports cancellation. */
export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/** Returns a function that runs only after calls have stopped for the delay. */
export function debounce<Args extends unknown[]>(callback: (...args: Args) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args): void => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delayMs);
  };
}

/** Returns a function that runs at most once per interval. */
export function throttle<Args extends unknown[]>(callback: (...args: Args) => void, intervalMs: number) {
  let lastRun = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args): void => {
    const remaining = intervalMs - (Date.now() - lastRun);
    if (remaining <= 0) {
      clearTimeout(trailingTimer);
      lastRun = Date.now();
      callback(...args);
      return;
    }
    clearTimeout(trailingTimer);
    trailingTimer = setTimeout(() => {
      lastRun = Date.now();
      callback(...args);
    }, remaining);
  };
}

/** Options for retrying an asynchronous operation. */
export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  backoff?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/** Retries an asynchronous operation with optional exponential backoff. */
export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoff = options.backoff ?? 2;
  let delayMs = Math.max(0, options.delayMs ?? 250);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason;
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || options.shouldRetry?.(error, attempt) === false) throw error;
      await sleep(delayMs, options.signal);
      delayMs *= backoff;
    }
  }
  throw lastError;
}

/** Creates a structured clone of supported platform values. */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Compares arrays, plain objects, dates, and primitive values by content. */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && deepEqual(leftRecord[key], rightRecord[key]));
}

