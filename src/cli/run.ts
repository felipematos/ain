import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { run, stream } from '../execution/runner.js';
import { renderText, renderError } from '../output/renderer.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Machine-oriented prompt execution with structured output')
    .option('--prompt <text>', 'Prompt text')
    .option('-f, --file <path>', 'Read prompt from file')
    .option('-p, --provider <name>', 'Provider to use')
    .option('-m, --model <id>', 'Model to use (accepts alias)')
    .option('-s, --system <text>', 'System prompt')
    .option('--json', 'Output JSON envelope (pretty-printed)')
    .option('--jsonl', 'Output compact single-line JSON (JSONL format)')
    .option('--schema <path>', 'Path to JSON schema file for structured output')
    .option('--field <key>', 'Extract a single field from JSON output (implies --json)')
    .option('--temperature <n>', 'Temperature (0-2)', parseFloat)
    .option('--max-tokens <n>', 'Max tokens', parseInt)
    .option('--retry <n>', 'Total request attempts on transient errors (default: 3)', parseInt)
    .option('--timeout <ms>', 'Request timeout in milliseconds', parseInt)
    .option('--system-file <path>', 'Read system prompt from file')
    .option('--dry-run', 'Show routing decision without executing')
    .option('--policy <name>', 'Routing policy name')
    .option('--stream', 'Stream output token by token')
    .option('--skip-think', 'Disable thinking mode (Qwen3/DeepSeek reasoning models)')
    .option('-v, --verbose', 'Print provider/model/token info to stderr')
    .action(async (opts) => {
      // useJson = ask the model to return JSON (affects system prompt)
      // useEnvelope = wrap output in JSON envelope (affects rendering only)
      const useJson = opts.json || !!opts.schema || !!opts.field;
      const useEnvelope = useJson || opts.jsonl;
      try {
        let prompt = opts.prompt as string | undefined;

        if (opts.file) {
          prompt = readFileSync(opts.file as string, 'utf-8').trim();
        }

        if (!prompt && !process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.from(chunk));
          }
          prompt = Buffer.concat(chunks).toString('utf-8').trim();
        }

        if (!prompt) {
          process.stderr.write('Error: No prompt provided. Use --prompt, --file, or stdin.\n');
          process.exit(1);
        }

        if (opts.dryRun) {
          const { route } = await import('../routing/router.js');
          const decision = route({ prompt, policyName: opts.policy });
          process.stdout.write(JSON.stringify({ dryRun: true, decision }, null, 2) + '\n');
          return;
        }

        let schema: object | undefined;
        if (opts.schema) {
          schema = JSON.parse(readFileSync(opts.schema as string, 'utf-8'));
        }

        let resolvedProvider = opts.provider as string | undefined;
        let resolvedModel = opts.model as string | undefined;
        let resolvedTemperature = opts.temperature as number | undefined;
        let resolvedMaxTokens = opts.maxTokens as number | undefined;
        let fallbackChain: Array<{ provider: string; model: string }> | undefined;

        if (opts.policy && !resolvedProvider && !resolvedModel) {
          const { route } = await import('../routing/router.js');
          const decision = route({ prompt, policyName: opts.policy });
          resolvedProvider = decision.provider;
          resolvedModel = decision.model;
          resolvedTemperature ??= decision.params?.temperature;
          resolvedMaxTokens ??= decision.params?.maxTokens;
          fallbackChain = decision.fallbackChain;
          if (opts.verbose) {
            process.stderr.write(`Routing: tier=${decision.tier}, ${decision.rationale}\n`);
          }
        }

        const systemText = opts.systemFile
          ? readFileSync(opts.systemFile as string, 'utf-8').trim()
          : opts.system as string | undefined;

        const runOpts = {
          prompt,
          provider: resolvedProvider,
          model: resolvedModel,
          system: systemText,
          temperature: resolvedTemperature,
          maxTokens: resolvedMaxTokens,
          jsonMode: useJson,
          schema,
          noThink: opts.skipThink,
          maxRetries: opts.retry as number | undefined,
          timeoutMs: opts.timeout as number | undefined,
          fallbackChain,
        };

        if (opts.stream && useEnvelope) {
          process.stderr.write('Warning: --stream is not supported with --json/--jsonl/--schema; using buffered mode.\n');
        }

        if (opts.stream && !useEnvelope) {
          if (opts.verbose) {
            const { resolveProvider, resolveModel } = await import('../config/loader.js');
            const { name: pName } = resolveProvider(runOpts.provider);
            const mId = resolveModel(runOpts.model, pName);
            process.stderr.write(`Provider: ${pName}, Model: ${mId ?? '(default)'}\n`);
          }
          for await (const token of stream(runOpts)) {
            process.stdout.write(token);
          }
          process.stdout.write('\n');
        } else {
          const result = await run(runOpts);

          if (opts.verbose) {
            process.stderr.write(`Provider: ${result.provider}, Model: ${result.model}\n`);
            if (result.usage) {
              process.stderr.write(
                `Tokens: ${result.usage.total_tokens} (in: ${result.usage.prompt_tokens}, out: ${result.usage.completion_tokens})\n`,
              );
            }
          }

          if (opts.field) {
            const parsed = result.parsedOutput as Record<string, unknown>;
            const value = parsed?.[opts.field as string];
            if (value === undefined) {
              process.stderr.write(`Error: field "${opts.field}" not found in output\n`);
              process.exit(1);
            }
            process.stdout.write(String(value) + '\n');
          } else {
            renderText(result, { json: opts.json || !!opts.schema || !!opts.field, jsonl: opts.jsonl });
          }
        }
      } catch (err) {
        renderError(err instanceof Error ? err : String(err), useEnvelope);
        process.exit(1);
      }
    });
}
