import type { Command } from 'commander';
import {
  loadConfig,
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
    .action(() => {
      const config = loadConfig();
      const names = Object.keys(config.providers);
      if (names.length === 0) {
        process.stdout.write('No providers configured. Run: ain providers add\n');
        return;
      }
      const defaultProvider = config.defaults?.provider;
      for (const name of names) {
        const p = config.providers[name];
        const isDefault = name === defaultProvider ? ' (default)' : '';
        process.stdout.write(`  ${name}${isDefault}  ${p.kind}  ${p.baseUrl}\n`);
      }
    });

  providers
    .command('show <name>')
    .description('Show provider configuration')
    .action((name: string) => {
      const provider = getProvider(name);
      process.stdout.write(JSON.stringify(provider, null, 2) + '\n');
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
        addProvider(name, provider);

        if (opts.setDefault) {
          const config = loadConfig();
          config.defaults = { ...config.defaults, provider: name };
          saveConfig(config);
          process.stdout.write(`Provider "${name}" added and set as default.\n`);
        } else {
          process.stdout.write(`Provider "${name}" added.\n`);
        }
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
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
        getProvider(name); // ensure exists
        const config = loadConfig();
        config.defaults = { ...config.defaults, provider: name };
        saveConfig(config);
        process.stdout.write(`Default provider set to "${name}".\n`);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });
}
