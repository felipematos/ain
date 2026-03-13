import type { Command } from 'commander';
import { loadConfig, resolveProvider, saveConfig, mergeModels } from '../config/loader.js';
import { createAdapter } from '../providers/openai-compatible.js';

export function registerModelCommands(program: Command): void {
  const models = program.command('models').description('Manage models');

  models
    .command('list')
    .description('List available models')
    .option('-p, --provider <name>', 'Filter by provider')
    .option('--live', 'Fetch live from provider API (default: show cached)')
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const providerNames = opts.provider
          ? [opts.provider as string]
          : Object.keys(config.providers);

        if (providerNames.length === 0) {
          process.stdout.write('No providers configured.\n');
          return;
        }

        for (const name of providerNames) {
          const provider = config.providers[name];
          if (!provider) {
            process.stderr.write(`Provider "${name}" not found.\n`);
            continue;
          }

          if (opts.live) {
            const adapter = createAdapter(provider);
            const response = await adapter.listModels();
            process.stdout.write(`\nProvider: ${name} (${provider.baseUrl})\n`);
            for (const model of response.data) {
              process.stdout.write(`  ${model.id}\n`);
            }
          } else {
            const cached = provider.models ?? [];
            if (cached.length === 0) {
              process.stdout.write(`\nProvider: ${name} — no cached models. Run: ain models refresh ${name}\n`);
            } else {
              process.stdout.write(`\nProvider: ${name}\n`);
              for (const model of cached) {
                const alias = model.alias ? ` (${model.alias})` : '';
                const tags = model.tags?.join(', ');
                const ctx = model.contextWindow ? `  ${Math.round(model.contextWindow / 1024)}k ctx` : '';
                process.stdout.write(`  ${model.id}${alias}${ctx}${tags ? `  [${tags}]` : ''}\n`);
              }
            }
          }
        }
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  models
    .command('refresh [provider]')
    .description('Fetch live model list and cache it')
    .action(async (providerName?: string) => {
      try {
        const config = loadConfig();
        const names = providerName ? [providerName] : Object.keys(config.providers);

        for (const name of names) {
          const provider = config.providers[name];
          if (!provider) {
            process.stderr.write(`Provider "${name}" not found.\n`);
            continue;
          }

          const adapter = createAdapter(provider);
          const response = await adapter.listModels();

          const existingModels = provider.models ?? [];
          const serverIds = response.data.map((m) => m.id);
          const newCount = serverIds.filter((id) => !existingModels.find((m) => m.id === id)).length;
          provider.models = mergeModels(existingModels, serverIds) as typeof provider.models;
          process.stdout.write(
            `Refreshed ${name}: ${response.data.length} models (${newCount} new, metadata preserved).\n`,
          );
        }

        saveConfig(config);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });
}
