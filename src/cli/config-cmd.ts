import type { Command } from 'commander';
import { stringify as stringifyYaml } from 'yaml';
import { initConfig, getConfigPath, configExists, loadConfig, saveConfig } from '../config/loader.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('Manage configuration');

  config
    .command('path')
    .description('Show config file path')
    .action(() => {
      process.stdout.write(getConfigPath() + '\n');
    });

  config
    .command('init')
    .description('Create initial config file')
    .option('--force', 'Overwrite existing config')
    .action((opts) => {
      if (configExists() && !opts.force) {
        process.stdout.write(`Config already exists at ${getConfigPath()}\nUse --force to overwrite.\n`);
        return;
      }
      initConfig();
      process.stdout.write(`Config initialized at ${getConfigPath()}\n`);
    });

  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON instead of YAML')
    .action((opts) => {
      const cfg = loadConfig();
      if (opts.json) {
        process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
      } else {
        process.stdout.write(stringifyYaml(cfg));
      }
    });

  config
    .command('set-default')
    .description('Set default provider, model, temperature, and/or max-tokens')
    .option('-p, --provider <name>', 'Default provider')
    .option('-m, --model <id>', 'Default model')
    .option('--temperature <n>', 'Default temperature (0-2)', parseFloat)
    .option('--max-tokens <n>', 'Default max tokens', parseInt)
    .action((opts) => {
      if (!opts.provider && !opts.model && opts.temperature === undefined && opts.maxTokens === undefined) {
        process.stderr.write('Error: Specify at least one of --provider, --model, --temperature, --max-tokens.\n');
        process.exit(1);
      }
      const cfg = loadConfig();
      if (opts.provider) cfg.defaults = { ...cfg.defaults, provider: opts.provider as string };
      if (opts.model) cfg.defaults = { ...cfg.defaults, model: opts.model as string };
      if (opts.temperature !== undefined) cfg.defaults = { ...cfg.defaults, temperature: opts.temperature as number };
      if (opts.maxTokens !== undefined) cfg.defaults = { ...cfg.defaults, maxTokens: opts.maxTokens as number };
      saveConfig(cfg);
      const parts: string[] = [];
      if (opts.provider) parts.push(`provider=${opts.provider as string}`);
      if (opts.model) parts.push(`model=${opts.model as string}`);
      if (opts.temperature !== undefined) parts.push(`temperature=${opts.temperature as number}`);
      if (opts.maxTokens !== undefined) parts.push(`maxTokens=${opts.maxTokens as number}`);
      process.stdout.write(`Defaults updated: ${parts.join(', ')}\n`);
    });
}
