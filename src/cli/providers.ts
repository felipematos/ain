import { createInterface } from 'readline';
import type { Command } from 'commander';
import { stringify as stringifyYaml } from 'yaml';
import { ZodError } from 'zod';
import {
  loadConfig,
  loadUserConfig,
  addProvider,
  removeProvider,
  getProvider,
  saveConfig,
} from '../config/loader.js';
import type { ProviderConfig } from '../config/types.js';
import { ProviderConfigSchema } from '../config/types.js';
import { PROVIDER_TEMPLATES, getTemplate } from './templates.js';
import {
  detectOpenClaw,
  readOpenClawProviders,
  mapOpenClawProvider,
} from '../openclaw/detect.js';

export function registerProviderCommands(program: Command): void {
  const providers = program.command('providers').alias('p').description('Manage providers');

  providers
    .command('list')
    .description('List all configured providers')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const config = loadConfig();
      const names = Object.keys(config.providers);
      if (names.length === 0) {
        process.stdout.write('No providers configured. Run: ain providers add\n');
        return;
      }
      if (opts.json) {
        process.stdout.write(JSON.stringify(config.providers, null, 2) + '\n');
        return;
      }
      const defaultProvider = config.defaults?.provider;
      for (const name of names) {
        const p = config.providers[name];
        const isDefault = name === defaultProvider ? ' *' : '';
        const modelCount = p.models?.length ?? 0;
        const models = modelCount > 0 ? `  ${modelCount} model${modelCount === 1 ? '' : 's'}` : '  no models cached';
        process.stdout.write(`  ${name}${isDefault}  ${p.baseUrl}${models}\n`);
      }
    });

  providers
    .command('show <name>')
    .description('Show provider configuration')
    .option('--json', 'Output as JSON instead of YAML')
    .action((name: string, opts) => {
      try {
        const provider = getProvider(name);
        if (opts.json) {
          process.stdout.write(JSON.stringify(provider, null, 2) + '\n');
        } else {
          process.stdout.write(stringifyYaml({ [name]: provider }));
        }
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  providers
    .command('templates')
    .description('List available provider templates')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      if (opts.json) {
        process.stdout.write(JSON.stringify(PROVIDER_TEMPLATES, null, 2) + '\n');
        return;
      }
      const cloud = PROVIDER_TEMPLATES.filter((t) => t.category === 'cloud');
      const local = PROVIDER_TEMPLATES.filter((t) => t.category === 'local');
      process.stdout.write('\nCloud providers:\n');
      for (const t of cloud) {
        process.stdout.write(`  ${t.id.padEnd(14)} ${t.name.padEnd(28)} ${t.description}\n`);
      }
      process.stdout.write('\nLocal providers:\n');
      for (const t of local) {
        process.stdout.write(`  ${t.id.padEnd(14)} ${t.name.padEnd(28)} ${t.description}\n`);
      }
      process.stdout.write(`\nUse: ain providers add --template <id> [--api-key <key>] [--set-default]\n\n`);
    });

  providers
    .command('add [name]')
    .description('Add a new OpenAI-compatible provider')
    .option('--template <id>', 'Use a provider template (see: ain providers templates)')
    .option('--base-url <url>', 'Base URL (e.g. http://localhost:1234/v1)')
    .option('--api-key <key>', 'API key or env:VAR_NAME')
    .option('--timeout <ms>', 'Request timeout in ms', parseInt)
    .option('--set-default', 'Set as default provider')
    .action((nameArg: string | undefined, opts) => {
      let name = nameArg;
      let baseUrl = opts.baseUrl as string | undefined;
      let apiKey = opts.apiKey as string | undefined;
      let templateModels: Array<{ id: string; alias?: string; tags?: string[] }> = [];

      // Template mode
      if (opts.template) {
        const template = getTemplate(opts.template as string);
        if (!template) {
          const available = PROVIDER_TEMPLATES.map((t) => t.id).join(', ');
          process.stderr.write(`Error: Unknown template "${opts.template}". Available: ${available}\n`);
          process.exit(1);
        }
        name = name ?? template.id;
        baseUrl = baseUrl ?? template.baseUrl;
        if (!apiKey && template.requiresApiKey) {
          apiKey = `env:${template.apiKeyEnvVar}`;
        }
        templateModels = template.defaultModels ?? [];
      }

      if (!name) {
        process.stderr.write('Error: Provider name is required. Usage: ain providers add <name> --base-url <url>\n');
        process.stderr.write('  Or use a template: ain providers add --template openai\n');
        process.exit(1);
      }
      if (!baseUrl) {
        process.stderr.write('Error: --base-url is required (unless using --template).\n');
        process.exit(1);
      }

      const providerData = {
        kind: 'openai-compatible' as const,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        ...(opts.timeout ? { timeoutMs: opts.timeout as number } : {}),
        models: templateModels,
      };

      try {
        const provider = ProviderConfigSchema.parse(providerData);
        // Check user config to determine if this is an update (not overlay)
        const isUpdate = !!loadUserConfig().providers[name];
        addProvider(name, provider);

        const verb = isUpdate ? 'updated' : 'added';
        if (opts.setDefault) {
          const config = loadUserConfig();
          config.defaults = { ...config.defaults, provider: name };
          saveConfig(config);
          process.stdout.write(`Provider "${name}" ${verb} and set as default.\n`);
        } else {
          process.stdout.write(`Provider "${name}" ${verb}.\n`);
        }
      } catch (err) {
        if (err instanceof ZodError) {
          const details = err.errors.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
          process.stderr.write(`Error: Invalid provider config — ${details}\n`);
        } else {
          process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        process.exit(1);
      }
    });

  providers
    .command('remove <name>')
    .description('Remove a provider')
    .action((name: string) => {
      try {
        const userConfig = loadUserConfig();
        const wasDefault = userConfig.defaults?.provider === name;
        removeProvider(name);
        process.stdout.write(`Provider "${name}" removed.\n`);
        if (wasDefault) {
          process.stderr.write(`Warning: "${name}" was the default provider. Run: ain config set-default --provider <name>\n`);
        }
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  providers
    .command('set-default <name>')
    .description('Set the default provider')
    .action((name: string) => {
      try {
        getProvider(name); // ensure exists (checks merged config including overlay)
        const config = loadUserConfig();
        config.defaults = { ...config.defaults, provider: name };
        saveConfig(config);
        process.stdout.write(`Default provider set to "${name}".\n`);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  providers
    .command('import-openclaw')
    .alias('import-oc')
    .description('Import providers from an OpenClaw environment')
    .option('--yes', 'Import all without prompting')
    .action(async (opts) => {
      const detection = detectOpenClaw();
      if (!detection.detected) {
        process.stderr.write('Error: No OpenClaw environment detected.\n');
        process.stderr.write('Looked for: ~/.openclaw/openclaw.json, openclaw CLI, OPENCLAW_SHELL env var\n');
        process.exit(1);
      }

      const ocProviders = readOpenClawProviders(detection);
      if (ocProviders.length === 0) {
        process.stderr.write('No providers found in OpenClaw configuration.\n');
        process.exit(1);
      }

      process.stderr.write(`\nFound ${ocProviders.length} provider(s) in OpenClaw:\n`);
      for (const oc of ocProviders) {
        process.stderr.write(`  ${oc.name} — ${oc.models.length} model(s)\n`);
      }
      process.stderr.write('\n');

      let toImport = ocProviders;

      if (!opts.yes && process.stdin.isTTY) {
        const answer = await askLine('Import all? [Y/n]: ');
        if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
          toImport = [];
          for (const oc of ocProviders) {
            const include = await askLine(`  Import ${oc.name}? [Y/n]: `);
            if (!include || include.toLowerCase() === 'y' || include.toLowerCase() === 'yes') {
              toImport.push(oc);
            }
          }
        }
      }

      if (toImport.length === 0) {
        process.stderr.write('No providers selected.\n');
        return;
      }

      const config = loadUserConfig();
      let imported = 0;

      for (const oc of toImport) {
        const mapped = mapOpenClawProvider(oc);
        const existing = config.providers[mapped.name];

        if (existing) {
          let action: 'skip' | 'merge' | 'overwrite' = 'skip';

          if (opts.yes) {
            action = 'skip';
          } else if (process.stdin.isTTY) {
            process.stderr.write(`\n  Provider "${mapped.name}" already exists.\n`);
            process.stderr.write(`    1. Skip\n    2. Merge models\n    3. Overwrite\n`);
            const choice = await askLine('    Action [1-3, default: 1]: ');
            if (choice === '2') action = 'merge';
            else if (choice === '3') action = 'overwrite';
          }

          if (action === 'skip') {
            process.stderr.write(`  Skipped: ${mapped.name} (already exists)\n`);
            continue;
          }
          if (action === 'merge') {
            const existingIds = new Set((existing.models ?? []).map(m => m.id));
            const newModels = mapped.models.filter(m => !existingIds.has(m.id));
            existing.models = [...(existing.models ?? []), ...newModels];
            config.providers[mapped.name] = existing;
            saveConfig(config);
            process.stdout.write(`  Merged ${newModels.length} new model(s) into "${mapped.name}"\n`);
            imported++;
            continue;
          }
          // overwrite — fall through
        }

        try {
          const validated = ProviderConfigSchema.parse(mapped.provider);
          addProvider(mapped.name, validated);
          process.stdout.write(`  Added: ${mapped.name} (${mapped.models.length} models)\n`);
          imported++;
        } catch (err) {
          process.stderr.write(`  Error importing ${mapped.name}: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }

      if (imported > 0) {
        process.stdout.write(`\n${imported} provider(s) imported from OpenClaw.\n`);
      } else {
        process.stderr.write('\nNo providers imported.\n');
      }
    });
}

function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
