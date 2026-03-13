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
            const defaultModel = config.defaults?.model;
            if (cached.length === 0) {
              process.stdout.write(`\nProvider: ${name} — no cached models. Run: ain models refresh ${name}\n`);
            } else {
              process.stdout.write(`\nProvider: ${name}\n`);
              for (const model of cached) {
                const alias = model.alias ? ` (${model.alias})` : '';
                const isDefault = (model.id === defaultModel || model.alias === defaultModel) ? ' *' : '';
                const tags = model.tags?.join(', ');
                const ctx = model.contextWindow ? `  ${Math.round(model.contextWindow / 1024)}k ctx` : '';
                process.stdout.write(`  ${model.id}${alias}${isDefault}${ctx}${tags ? `  [${tags}]` : ''}\n`);
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
    .command('set <provider> <model>')
    .description('Set metadata for a cached model (alias, tags, context window)')
    .option('--alias <name>', 'Set alias for the model')
    .option('--tag <tag>', 'Add a tag (can be specified multiple times)', (val: string, prev: string[]) => [...prev, val], [] as string[])
    .option('--remove-tag <tag>', 'Remove a tag')
    .option('--context <n>', 'Set context window size in tokens', parseInt)
    .option('--max-tokens <n>', 'Set max tokens for the model', parseInt)
    .action((providerName: string, modelId: string, opts) => {
      try {
        const config = loadConfig();
        const provider = config.providers[providerName];
        if (!provider) {
          process.stderr.write(`Error: Provider "${providerName}" not found.\n`);
          process.exit(1);
          return;
        }
        const models = provider.models ?? [];
        const model = models.find((m) => m.id === modelId || m.alias === modelId);
        if (!model) {
          process.stderr.write(`Error: Model "${modelId}" not found under provider "${providerName}". Run: ain models refresh ${providerName}\n`);
          process.exit(1);
          return;
        }
        if (opts.alias) model.alias = opts.alias as string;
        if ((opts.tag as string[]).length > 0) {
          const existing = new Set(model.tags ?? []);
          for (const t of opts.tag as string[]) existing.add(t);
          model.tags = Array.from(existing);
        }
        if (opts.removeTag) {
          model.tags = (model.tags ?? []).filter((t) => t !== opts.removeTag as string);
        }
        if (opts.context !== undefined) model.contextWindow = opts.context as number;
        if (opts.maxTokens !== undefined) model.maxTokens = opts.maxTokens as number;
        saveConfig(config);
        const alias = model.alias ? ` (${model.alias})` : '';
        const tags = model.tags?.length ? `  [${model.tags.join(', ')}]` : '';
        process.stdout.write(`Updated ${providerName}/${model.id}${alias}${tags}\n`);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  models
    .command('refresh [provider]')
    .description('Fetch live model list and cache it')
    .action(async (providerName?: string) => {
      const config = loadConfig();
      const names = providerName ? [providerName] : Object.keys(config.providers);
      let hasErrors = false;

      for (const name of names) {
        const provider = config.providers[name];
        if (!provider) {
          process.stderr.write(`Provider "${name}" not found.\n`);
          hasErrors = true;
          continue;
        }

        try {
          const adapter = createAdapter(provider);
          const response = await adapter.listModels();
          const existingModels = provider.models ?? [];
          const serverIds = response.data.map((m) => m.id);
          const newCount = serverIds.filter((id) => !existingModels.find((m) => m.id === id)).length;
          provider.models = mergeModels(existingModels, serverIds) as typeof provider.models;
          saveConfig(config); // save after each success to preserve partial progress
          process.stdout.write(
            `Refreshed ${name}: ${response.data.length} models (${newCount} new, metadata preserved).\n`,
          );
        } catch (err) {
          process.stderr.write(`Error refreshing ${name}: ${err instanceof Error ? err.message : String(err)}\n`);
          hasErrors = true;
        }
      }

      if (hasErrors) process.exit(1);
    });
}
