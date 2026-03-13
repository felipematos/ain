import type { RunResult } from '../execution/runner.js';

export interface OutputOptions {
  json?: boolean;
  verbose?: boolean;
}

export function renderText(result: RunResult, options: OutputOptions = {}): void {
  if (options.json) {
    const envelope = {
      ok: result.ok,
      provider: result.provider,
      model: result.model,
      mode: result.parsedOutput !== undefined ? 'json' : 'text',
      output: result.parsedOutput ?? result.output,
      usage: result.usage ?? null,
    };
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
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
