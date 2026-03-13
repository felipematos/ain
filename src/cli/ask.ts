import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { run } from '../execution/runner.js';
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
    .action(async (promptArg: string | undefined, opts) => {
      try {
        let prompt = promptArg;

        // Read from file if specified
        if (opts.file) {
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

        if (opts.verbose) {
          process.stderr.write(`Using provider: ${opts.provider ?? 'default'}, model: ${opts.model ?? 'default'}\n`);
        }

        const result = await run({
          prompt,
          provider: opts.provider,
          model: opts.model,
          system: opts.system,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        });

        if (opts.verbose) {
          process.stderr.write(`Provider: ${result.provider}, Model: ${result.model}\n`);
          if (result.usage) {
            process.stderr.write(`Tokens: ${result.usage.total_tokens} (in: ${result.usage.prompt_tokens}, out: ${result.usage.completion_tokens})\n`);
          }
        }

        renderText(result);
      } catch (err) {
        renderError(err instanceof Error ? err : String(err));
        process.exit(1);
      }
    });
}
