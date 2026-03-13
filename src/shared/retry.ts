export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryOn?: (err: Error) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
  retryOn: isTransientError,
};

export function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    // Retry on 5xx HTTP errors
    /http 5\d\d/.test(msg) ||
    msg.includes('http 429') // rate limit
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error = new Error('No attempts made');
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const shouldRetry = opts.retryOn?.(lastError) ?? isTransientError(lastError);
      if (!shouldRetry || attempt === opts.maxAttempts) {
        throw lastError;
      }

      process.stderr.write(
        `Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...\n`,
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
