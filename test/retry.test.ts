import { describe, it, expect, vi } from 'vitest';
import { withRetry, isTransientError } from '../src/shared/retry.js';

describe('isTransientError', () => {
  it('treats timeout errors as transient', () => {
    expect(isTransientError(new Error('Request timeout exceeded'))).toBe(true);
    expect(isTransientError(new Error('The operation was aborted'))).toBe(true);
  });

  it('treats 5xx HTTP errors as transient', () => {
    expect(isTransientError(new Error('HTTP 500: Internal Server Error'))).toBe(true);
    expect(isTransientError(new Error('HTTP 503: Service Unavailable'))).toBe(true);
  });

  it('treats 429 rate limit as transient', () => {
    expect(isTransientError(new Error('HTTP 429: Too Many Requests'))).toBe(true);
  });

  it('does not retry 4xx errors', () => {
    expect(isTransientError(new Error('HTTP 400: Bad Request'))).toBe(false);
    expect(isTransientError(new Error('HTTP 401: Unauthorized'))).toBe(false);
    expect(isTransientError(new Error('HTTP 404: Not Found'))).toBe(false);
  });

  it('does not retry logic errors', () => {
    expect(isTransientError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isTransientError(new Error('Invalid JSON schema'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const value = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2 });
    expect(value).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 503: unavailable'))
      .mockResolvedValue('ok');
    const value = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2 });
    expect(value).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 503: always fails'));
    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2 })
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 400: bad request'));
    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2 })
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clamps maxAttempts: 0 to 1 attempt (never skips all attempts)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 0, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
