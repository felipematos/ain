import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { run, stream } from '../execution/runner.js';
import { renderText, renderError } from '../output/renderer.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask [prompt]')
    .description('Run a prompt and get a plain text answer')
    .option('-p, --provider <name>', 'Provider to use')
    .option('-m, --model <id>', 'Model to use')
    .option('-s, --system <text>', 'System prompt')
    .option('-f, --file <path>', 'Read prompt from file')
    .option('--temperature <n>', 'Temperature (0-2)', parseFloat)
    .option('--max-tokens <n>', 'Max tokens', parseInt)
    .option('-v, --verbose', 'Show provider/model info on stderr')
    .option('--route', 'Use intelligent routing to select model automatically')
    .option('--dry-run', 'Show routing decision without executing (implies --route)')
    .option('--policy <name>', 'Routing policy name (implies --route)')
    .option('--tier <tier>', 'Force routing tier: fast, general, reasoning, premium (requires --route or --policy)')
    .option('--stream', 'Stream output token by token')
    .option('--skip-think', 'Disable thinking mode (Qwen3/DeepSeek reasoning models) [alias: --no-think]')
    .option('--no-think', 'Alias for --skip-think')
    .option('--retry <n>', 'Total request attempts on transient errors (default: 3)', parseInt)
    .option('--timeout <ms>', 'Request timeout in milliseconds', parseInt)
    .option('--system-file <path>', 'Read system prompt from file')
    .option('--field <key>', 'Extract a single field from JSON output (implies --json)')
    .option('-j, --json', 'Output JSON envelope (pretty-printed)')
    .option('--jsonl', 'Output compact single-line JSON (JSONL format)')
    .action(async (promptArg: string | undefined, opts) => {
      // useJson = ask the model to return JSON (affects system prompt)
      // useEnvelope = wrap output in JSON envelope (affects rendering only)
      const useJson = opts.json || !!opts.field;
      const useEnvelope = useJson || opts.jsonl;
      try {
        let prompt = promptArg;

        // Read from file if specified (overrides positional arg)
        if (opts.file) {
          if (promptArg) {
            process.stderr.write('Warning: --file overrides the positional prompt argument.\n');
          }
          prompt = readFileSync(opts.file, 'utf-8').trim();
        }

        // Read from stdin if no prompt provided
        if (!prompt && !process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.from(chunk));
          }
          prompt = Buffer.concat(chunks).toString('utf-8').trim();
        }

        if (!prompt) {
          process.stderr.write('Error: No prompt provided. Pass as argument, --file, or via stdin.\n');
          process.exit(1);
        }

        if (opts.dryRun) {
          const { route } = await import('../routing/router.js');
          const decision = route({ prompt, policyName: opts.policy, tier: opts.tier });
          process.stdout.write(JSON.stringify({ dryRun: true, decision }, null, 2) + '\n');
          return;
        }

        // Resolve provider/model via routing if requested
        let resolvedProvider = opts.provider as string | undefined;
        let resolvedModel = opts.model as string | undefined;
        let resolvedTemperature = opts.temperature as number | undefined;
        let resolvedMaxTokens = opts.maxTokens as number | undefined;
        let fallbackChain: Array<{ provider: string; model: string }> | undefined;

        if ((opts.route || opts.policy) && !resolvedProvider && !resolvedModel) {
          const { route } = await import('../routing/router.js');
          const decision = route({ prompt, policyName: opts.policy, tier: opts.tier });
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
          noThink: opts.skipThink || opts.noThink,
          jsonMode: useJson,  // only instruct model when json/field requested
          maxRetries: opts.retry as number | undefined,
          timeoutMs: opts.timeout as number | undefined,
          fallbackChain,
        };

        if (opts.stream && useEnvelope) {
          process.stderr.write('Warning: --stream is not supported with --json/--jsonl; using buffered mode.\n');
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
              process.stderr.write(`Tokens: ${result.usage.total_tokens} (in: ${result.usage.prompt_tokens}, out: ${result.usage.completion_tokens})\n`);
            }
          }

          if (opts.field) {
            const keys = (opts.field as string).split('.');
            let value: unknown = result.parsedOutput;
            for (const key of keys) {
              value = (value as Record<string, unknown>)?.[key];
            }
            if (value === undefined) {
              process.stderr.write(`Error: field "${opts.field}" not found in output\n`);
              process.exit(1);
            }
            const out = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
            process.stdout.write(out + '\n');
          } else {
            renderText(result, { json: opts.json || !!opts.field, jsonl: opts.jsonl });
          }
        }
      } catch (err) {
        renderError(err instanceof Error ? err : String(err), useEnvelope);
        process.exit(1);
      }
    });
}
