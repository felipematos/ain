import type { Command } from 'commander';
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
    .action(() => {
      const cfg = loadConfig();
      process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
    });

  config
    .command('set-default')
    .description('Set default provider and/or model')
    .option('-p, --provider <name>', 'Default provider')
    .option('-m, --model <id>', 'Default model')
    .action((opts) => {
      const cfg = loadConfig();
      if (opts.provider) cfg.defaults = { ...cfg.defaults, provider: opts.provider as string };
      if (opts.model) cfg.defaults = { ...cfg.defaults, model: opts.model as string };
      saveConfig(cfg);
      process.stdout.write('Defaults updated.\n');
    });
}
