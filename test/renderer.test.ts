import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderText, renderError } from '../src/output/renderer.js';
import type { RunResult } from '../src/execution/runner.js';

const makeResult = (overrides: Partial<RunResult> = {}): RunResult => ({
  ok: true,
  provider: 'test-provider',
  model: 'test-model',
  output: 'Hello, world!',
  ...overrides,
});

describe('renderText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes plain text output to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult());
    expect(spy).toHaveBeenCalledWith('Hello, world!\n');
  });

  it('writes JSON envelope when json=true', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult(), { json: true });
    const written = (spy.mock.calls[0]![0] as string);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    expect(parsed.provider).toBe('test-provider');
    expect(parsed.output).toBe('Hello, world!');
  });

  it('uses parsedOutput in JSON envelope when available', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult({ parsedOutput: { key: 'value' } }), { json: true });
    const written = (spy.mock.calls[0]![0] as string);
    const parsed = JSON.parse(written);
    expect(parsed.output).toEqual({ key: 'value' });
  });
});

describe('renderError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes error to stderr as plain text', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    renderError('Something went wrong');
    expect(spy).toHaveBeenCalledWith('Error: Something went wrong\n');
  });

  it('writes error as JSON when json=true', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    renderError('Something went wrong', true);
    const written = (spy.mock.calls[0]![0] as string);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('Something went wrong');
  });
});
