import type { RunResult } from '../execution/runner.js';

export interface OutputOptions {
  json?: boolean;
  jsonl?: boolean;
  bool?: boolean;
  verbose?: boolean;
}

function buildEnvelope(result: RunResult) {
  return {
    ok: result.ok,
    provider: result.provider,
    model: result.model,
    mode: typeof result.parsedOutput === 'boolean' ? 'bool' : result.parsedOutput !== undefined ? 'json' : 'text',
    output: result.parsedOutput ?? result.output,
    usage: result.usage ?? null,
  };
}

export function renderText(result: RunResult, options: OutputOptions = {}): void {
  if (options.bool && !options.json && !options.jsonl) {
    process.stdout.write(String(result.parsedOutput) + '\n');
  } else if (options.jsonl) {
    // Compact single-line JSON (JSONL format) — ideal for piping and batch processing
    process.stdout.write(JSON.stringify(buildEnvelope(result)) + '\n');
  } else if (options.json) {
    process.stdout.write(JSON.stringify(buildEnvelope(result), null, 2) + '\n');
  } else {
    process.stdout.write(result.output + '\n');
  }
}

export function renderError(error: Error | string, json?: boolean): void {
  const message = error instanceof Error ? error.message : error;
  if (json) {
    process.stderr.write(JSON.stringify({ ok: false, error: message }) + '\n');
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
}
