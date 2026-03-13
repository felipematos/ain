import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { run } from '../execution/runner.js';
import { renderText, renderError } from '../output/renderer.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Machine-oriented prompt execution with structured output')
    .option('--prompt <text>', 'Prompt text')
    .option('-f, --file <path>', 'Read prompt from file')
    .option('-p, --provider <name>', 'Provider to use')
    .option('-m, --model <id>', 'Model to use')
    .option('-s, --system <text>', 'System prompt')
    .option('--json', 'Output JSON envelope')
    .option('--schema <path>', 'Path to JSON schema file for structured output')
    .option('--temperature <n>', 'Temperature (0-2)', parseFloat)
    .option('--max-tokens <n>', 'Max tokens', parseInt)
    .option('--dry-run', 'Show routing decision without executing')
    .option('--policy <name>', 'Routing policy name')
    .action(async (opts) => {
      const useJson = opts.json || !!opts.schema;
      try {
        let prompt = opts.prompt as string | undefined;

        // Read from file if specified
        if (opts.file) {
          prompt = readFileSync(opts.file as string, 'utf-8').trim();
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
          process.stderr.write('Error: No prompt provided. Use --prompt, --file, or stdin.\n');
          process.exit(1);
        }

        // Dry run: show routing decision
        if (opts.dryRun) {
          const { route } = await import('../routing/router.js');
          const decision = route({
            prompt,
            policyName: opts.policy,
          });
          process.stdout.write(JSON.stringify({ dryRun: true, decision }, null, 2) + '\n');
          return;
        }

        let schema: object | undefined;
        if (opts.schema) {
          schema = JSON.parse(readFileSync(opts.schema as string, 'utf-8'));
        }

        const result = await run({
          prompt,
          provider: opts.provider,
          model: opts.model,
          system: opts.system,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          jsonMode: opts.json,
          schema,
        });

        renderText(result, { json: useJson });
      } catch (err) {
        renderError(err instanceof Error ? err : String(err), useJson);
        process.exit(1);
      }
    });
}
