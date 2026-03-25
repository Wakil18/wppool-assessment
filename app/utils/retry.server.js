/**
 * withRetry — Calls fn() up to maxAttempts times with exponential backoff.
 *
 * Attempt 1: immediate
 * Attempt N (N > 1): waits 2^(N-2) * baseDelayMs milliseconds before retrying
 *
 * Designed for in-process retries (e.g. BirdEye review requests).
 * HoodslyHub uses DB-tracked retries via syncOrderToHoodslyHub().
 *
 * @param {Function} fn          - Async function; should throw on failure.
 * @param {number}   maxAttempts - Maximum attempts (default: 3)
 * @param {number}   baseDelayMs - Base delay in ms for backoff (default: 120_000 = 2 min)
 * @returns {{ success: boolean, result: any, attempts: number, error: Error|null }}
 */
export async function withRetry(fn, maxAttempts = 3, baseDelayMs = 120_000) {
  let attempts = 0;
  let lastError = null;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;

    if (i > 0) {
      const delayMs = Math.pow(2, i - 1) * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const result = await fn();
      return { success: true, result, attempts, error: null };
    } catch (err) {
      lastError = err;
    }
  }

  return { success: false, result: null, attempts, error: lastError };
}
