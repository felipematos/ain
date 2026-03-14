import { createInterface } from 'readline';
import { PROVIDER_TEMPLATES, type ProviderTemplate } from './templates.js';
import {
  initConfig,
  configExists,
  loadUserConfig,
  addProvider,
  saveConfig,
} from '../config/loader.js';
import { ProviderConfigSchema } from '../config/types.js';
import { createAdapter } from '../providers/openai-compatible.js';

const useColor = process.stderr.isTTY && !process.env['NO_COLOR'];
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const cyan = (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s);
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

export function shouldRunWizard(): boolean {
  if (!process.stdin.isTTY) return false;
  if (!configExists()) return true;
  try {
    const config = loadUserConfig();
    return Object.keys(config.providers).length === 0;
  } catch {
    return true;
  }
}

export async function runWizard(): Promise<void> {
  log('');
  log(bold('  Welcome to AIN! ') + "Let's set up your first provider.\n");

  // Group templates
  const cloud = PROVIDER_TEMPLATES.filter((t) => t.category === 'cloud');
  const local = PROVIDER_TEMPLATES.filter((t) => t.category === 'local');

  log(bold('  Cloud providers:'));
  cloud.forEach((t, i) => {
    log(`    ${cyan(String(i + 1).padStart(2, ' '))}. ${t.name.padEnd(28)} ${dim(t.description)}`);
  });
  log('');
  log(bold('  Local providers:'));
  local.forEach((t, i) => {
    const n = cloud.length + i + 1;
    log(`    ${cyan(String(n).padStart(2, ' '))}. ${t.name.padEnd(28)} ${dim(t.description)}`);
  });
  log('');

  const all = [...cloud, ...local];
  const choice = await ask(`  ${bold('Pick a provider')} ${dim(`[1-${all.length}]`)}: `);
  const idx = parseInt(choice, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= all.length) {
    log(red('\n  Invalid choice. Run `ain config init` to set up manually.\n'));
    return;
  }

  const template = all[idx];
  log('');
  log(`  Selected: ${bold(template.name)}`);

  // Handle custom provider
  if (template.id === 'custom') {
    await setupCustomProvider();
    return;
  }

  await setupFromTemplate(template);
}

async function setupFromTemplate(template: ProviderTemplate): Promise<void> {
  // Ensure config exists
  if (!configExists()) {
    initConfig();
  }

  let baseUrl = template.baseUrl;

  // For local providers, allow customizing the URL
  if (template.category === 'local') {
    const urlInput = await ask(`  ${bold('Base URL')} ${dim(`[${template.baseUrl}]`)}: `);
    if (urlInput) baseUrl = urlInput;
  }

  // API key
  let apiKey: string | undefined;
  if (template.requiresApiKey) {
    if (template.signupUrl) {
      log(`\n  ${dim('Get your API key at:')} ${cyan(template.signupUrl)}`);
    }

    log('');
    log(`  ${dim('You can enter the key directly or use')} ${bold('env:' + template.apiKeyEnvVar)} ${dim('to read from environment.')}`);

    // Check if env var is already set
    const envValue = process.env[template.apiKeyEnvVar];
    if (envValue) {
      log(`  ${green('✓')} ${dim(`${template.apiKeyEnvVar} is set in your environment`)}`);
      const useEnv = await ask(`  ${bold('Use env:' + template.apiKeyEnvVar + '?')} ${dim('[Y/n]')}: `);
      if (!useEnv || useEnv.toLowerCase() === 'y' || useEnv.toLowerCase() === 'yes') {
        apiKey = `env:${template.apiKeyEnvVar}`;
      }
    }

    if (!apiKey) {
      const keyInput = await ask(`  ${bold('API key')}: `);
      if (!keyInput) {
        log(yellow('\n  No API key provided. You can add it later in ~/.ain/config.yaml\n'));
        apiKey = `env:${template.apiKeyEnvVar}`;
      } else if (keyInput.startsWith('env:')) {
        apiKey = keyInput;
      } else {
        // Store as env reference and tell user to set it
        log(`\n  ${dim('Tip: For security, set')} ${bold(`export ${template.apiKeyEnvVar}="${keyInput}"`)} ${dim('in your shell profile')}`);
        log(`  ${dim('and use')} ${bold('env:' + template.apiKeyEnvVar)} ${dim('in the config instead.')}`);
        apiKey = keyInput;
      }
    }
  }

  // Build provider config
  const providerData = {
    kind: 'openai-compatible' as const,
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    models: template.defaultModels ?? [],
  };

  try {
    const provider = ProviderConfigSchema.parse(providerData);
    addProvider(template.id, provider);

    // Set as default
    const config = loadUserConfig();
    config.defaults = {
      ...config.defaults,
      provider: template.id,
      model: template.defaultModels?.[0]?.id,
    };
    saveConfig(config);

    log('');
    log(`  ${green('✓')} Provider ${bold(template.id)} configured and set as default.`);

    // Test connection
    await testConnection(template, baseUrl);

    log('');
    log(bold('  You\'re all set! ') + 'Try these commands:');
    log(`    ${cyan('ain')} What is the capital of France?`);
    log(`    ${cyan('ain')} Hello world --st`);
    log(`    ${cyan('ain r')} Summarize this --json`);
    log(`    ${cyan('ain d')}                          ${dim('# health check')}`);
    log(`    ${cyan('ain m list')}                     ${dim('# list models')}`);
    log('');
  } catch (err) {
    log(red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

async function setupCustomProvider(): Promise<void> {
  if (!configExists()) {
    initConfig();
  }

  const name = await ask(`  ${bold('Provider name')} ${dim('(e.g. my-server)')}: `);
  if (!name) {
    log(red('\n  No name provided.\n'));
    return;
  }

  const baseUrl = await ask(`  ${bold('Base URL')} ${dim('(e.g. http://localhost:8080/v1)')}: `);
  if (!baseUrl) {
    log(red('\n  No URL provided.\n'));
    return;
  }

  const apiKeyInput = await ask(`  ${bold('API key')} ${dim('[optional, press Enter to skip]')}: `);

  const providerData = {
    kind: 'openai-compatible' as const,
    baseUrl,
    ...(apiKeyInput ? { apiKey: apiKeyInput } : {}),
    models: [],
  };

  try {
    const provider = ProviderConfigSchema.parse(providerData);
    addProvider(name, provider);

    const config = loadUserConfig();
    config.defaults = { ...config.defaults, provider: name };
    saveConfig(config);

    log(`\n  ${green('✓')} Provider ${bold(name)} configured.`);

    // Test and refresh
    const adapter = createAdapter(provider);
    log(`  ${dim('Testing connection...')}`);
    const health = await adapter.healthCheck();
    if (health.ok) {
      log(`  ${green('✓')} Connected (${health.latencyMs}ms)`);

      const refreshAnswer = await ask(`  ${bold('Refresh model list?')} ${dim('[Y/n]')}: `);
      if (!refreshAnswer || refreshAnswer.toLowerCase() === 'y') {
        try {
          const response = await adapter.listModels();
          const cfg = loadUserConfig();
          const p = cfg.providers[name];
          if (p) {
            p.models = response.data.map((m) => ({ id: m.id }));
            if (response.data.length > 0 && !cfg.defaults?.model) {
              cfg.defaults = { ...cfg.defaults, model: response.data[0].id };
            }
            saveConfig(cfg);
            log(`  ${green('✓')} Found ${response.data.length} model(s).`);
          }
        } catch {
          log(`  ${yellow('!')} Could not list models. You can run: ain models refresh ${name}`);
        }
      }
    } else {
      log(`  ${yellow('!')} Could not connect: ${health.error ?? 'unknown error'}`);
      log(`  ${dim('You can test later with:')} ain doctor`);
    }
    log('');
  } catch (err) {
    log(red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

async function testConnection(template: ProviderTemplate, baseUrl: string): Promise<void> {
  log(`\n  ${dim('Testing connection...')}`);
  try {
    const config = loadUserConfig();
    const provider = config.providers[template.id];
    if (!provider) return;
    const adapter = createAdapter(provider);
    const health = await adapter.healthCheck();
    if (health.ok) {
      log(`  ${green('✓')} Connected to ${template.name} (${health.latencyMs}ms)`);

      // Try to refresh models for local providers that ship without default models
      if (!template.defaultModels?.length) {
        try {
          const response = await adapter.listModels();
          const cfg = loadUserConfig();
          const p = cfg.providers[template.id];
          if (p) {
            p.models = response.data.map((m) => ({ id: m.id }));
            if (response.data.length > 0 && !cfg.defaults?.model) {
              cfg.defaults = { ...cfg.defaults, model: response.data[0].id };
            }
            saveConfig(cfg);
            log(`  ${green('✓')} Found ${response.data.length} model(s).`);
          }
        } catch {
          log(`  ${yellow('!')} Connected but could not list models. Run: ain models refresh`);
        }
      }
    } else {
      log(`  ${yellow('!')} Could not connect to ${baseUrl}`);
      if (template.category === 'local') {
        log(`  ${dim('Make sure ' + template.name + ' is running, then try:')} ain doctor`);
      } else {
        log(`  ${dim('Check your API key and try:')} ain doctor`);
      }
    }
  } catch {
    log(`  ${yellow('!')} Connection test failed. Try: ain doctor`);
  }
}
