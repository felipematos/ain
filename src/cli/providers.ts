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
}
