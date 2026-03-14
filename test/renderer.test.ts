import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderText, renderError } from '../src/output/renderer.js';
import type { RunResult } from '../src/execution/runner.js';
import type { OutputOptions } from '../src/output/renderer.js';

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

describe('renderText — bool mode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes "true" to stdout for boolean true', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult({ parsedOutput: true }), { bool: true });
    expect(spy).toHaveBeenCalledWith('true\n');
  });

  it('writes "false" to stdout for boolean false', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult({ parsedOutput: false }), { bool: true });
    expect(spy).toHaveBeenCalledWith('false\n');
  });

  it('uses JSON envelope when bool + json combined', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult({ parsedOutput: true }), { bool: true, json: true });
    const written = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.mode).toBe('bool');
    expect(parsed.output).toBe(true);
  });
});

describe('renderText — JSONL mode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes compact single-line JSON', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult(), { jsonl: true });
    const written = spy.mock.calls[0]![0] as string;
    // Must be single line (no embedded newlines in JSON part)
    expect(written.trim().split('\n')).toHaveLength(1);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    expect(parsed.output).toBe('Hello, world!');
  });

  it('JSONL is more compact than JSON', () => {
    const spyJsonl = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult(), { jsonl: true });
    const jsonlLen = (spyJsonl.mock.calls[0]![0] as string).length;
    spyJsonl.mockRestore();

    const spyJson = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderText(makeResult(), { json: true });
    const jsonLen = (spyJson.mock.calls[0]![0] as string).length;

    expect(jsonlLen).toBeLessThan(jsonLen);
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
