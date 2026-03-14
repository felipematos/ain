import type { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { initConfig, getConfigPath, configExists, loadConfig, loadUserConfig, saveConfig, getProvider, PROJECT_CONFIG_FILENAME } from '../config/loader.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').alias('c').description('Manage configuration');

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
      const projectOverlayPath = join(process.cwd(), PROJECT_CONFIG_FILENAME);
      const hasOverlay = existsSync(projectOverlayPath);

      if (opts.json) {
        const out: Record<string, unknown> = { ...cfg };
        if (hasOverlay) out['_projectOverlay'] = projectOverlayPath;
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      } else {
        if (hasOverlay) {
          process.stdout.write(`# Sources: ${getConfigPath()} + ${projectOverlayPath}\n`);
        }
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
      if (opts.provider) {
        try {
          getProvider(opts.provider as string);
        } catch {
          process.stderr.write(`Error: Provider "${opts.provider as string}" not found. Run: ain providers list\n`);
          process.exit(1);
        }
      }
      // Use loadUserConfig so we only update user config, not the overlay
      const cfg = loadUserConfig();
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
      const projectOverlayPath = join(process.cwd(), PROJECT_CONFIG_FILENAME);
      if (existsSync(projectOverlayPath)) {
        process.stderr.write(`Note: a project overlay (${projectOverlayPath}) is active and may override these defaults.\n`);
      }
    });
}
