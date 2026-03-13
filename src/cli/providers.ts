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

export function registerProviderCommands(program: Command): void {
  const providers = program.command('providers').description('Manage providers');

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
    .command('add <name>')
    .description('Add a new OpenAI-compatible provider')
    .requiredOption('--base-url <url>', 'Base URL (e.g. http://localhost:1234/v1)')
    .option('--api-key <key>', 'API key or env:VAR_NAME')
    .option('--timeout <ms>', 'Request timeout in ms', parseInt)
    .option('--set-default', 'Set as default provider')
    .action((name: string, opts) => {
      const providerData = {
        kind: 'openai-compatible' as const,
        baseUrl: opts.baseUrl as string,
        ...(opts.apiKey ? { apiKey: opts.apiKey as string } : {}),
        ...(opts.timeout ? { timeoutMs: opts.timeout as number } : {}),
        models: [],
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
        removeProvider(name);
        process.stdout.write(`Provider "${name}" removed.\n`);
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
