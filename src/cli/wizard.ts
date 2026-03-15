import { createInterface } from 'readline';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { PROVIDER_TEMPLATES, type ProviderTemplate } from './templates.js';
import {
  initConfig,
  configExists,
  loadUserConfig,
  addProvider,
  saveConfig,
  getConfigDir,
} from '../config/loader.js';
import { ProviderConfigSchema } from '../config/types.js';
import { createAdapter } from '../providers/openai-compatible.js';
import { getPolicyFilePath } from '../routing/router.js';

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
  log(bold('  Welcome to AIN! ') + "Let's set up your providers and routing.\n");

  if (!configExists()) {
    initConfig();
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Add providers (loop until user is done)
  // ═══════════════════════════════════════════════════════════════
  log(bold('  ── Phase 1: Providers ──\n'));

  let firstProvider = true;
  let addMore = true;

  while (addMore) {
    if (!firstProvider) {
      log('');
    }

    const template = await pickProvider();
    if (!template) break;

    if (template.id === 'custom') {
      await setupCustomProvider();
    } else {
      await setupFromTemplate(template, firstProvider);
    }

    firstProvider = false;

    const answer = await ask(`\n  ${bold('Add another provider?')} ${dim('[y/N]')}: `);
    addMore = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  // Reload config to see what providers we have
  const config = loadUserConfig();
  const providerNames = Object.keys(config.providers);

  if (providerNames.length === 0) {
    log(yellow('\n  No providers configured. Run `ain wizard` to try again.\n'));
    return;
  }

  log(`\n  ${green('✓')} ${providerNames.length} provider(s) configured: ${providerNames.join(', ')}\n`);

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Configure LLM classifier
  // ═══════════════════════════════════════════════════════════════
  log(bold('  ── Phase 2: Intelligent Routing ──\n'));
  log(`  AIN can use a fast LLM to classify your prompts and route them`);
  log(`  to the best model automatically. This works best with ultra-low`);
  log(`  latency providers like ${bold('Groq')}, ${bold('Fireworks')}, or ${bold('Together AI')}.\n`);

  // Find configured providers that have a classifier model recommendation
  const classifierCandidates: Array<{ provider: string; model: string; name: string }> = [];
  for (const pName of providerNames) {
    const template = PROVIDER_TEMPLATES.find(t => t.id === pName);
    if (template?.classifierModel) {
      classifierCandidates.push({
        provider: pName,
        model: template.classifierModel,
        name: template.name,
      });
    }
  }

  let classifierConfigured = false;

  if (classifierCandidates.length > 0) {
    log(`  ${green('✓')} Recommended classifier(s) from your providers:\n`);
    classifierCandidates.forEach((c, i) => {
      const rec = c.provider === 'groq' ? ` ${green('← recommended')}` : '';
      log(`    ${cyan(String(i + 1))}. ${c.name} — ${c.model}${rec}`);
    });
    log(`    ${cyan(String(classifierCandidates.length + 1))}. Skip (use heuristic classifier only)`);
    log('');

    const choice = await ask(`  ${bold('Pick a classifier')} ${dim(`[1-${classifierCandidates.length + 1}]`)}: `);
    const idx = parseInt(choice, 10) - 1;

    if (idx >= 0 && idx < classifierCandidates.length) {
      const selected = classifierCandidates[idx];
      const cfg = loadUserConfig();
      cfg.routing = {
        llmClassifier: {
          enabled: true,
          provider: selected.provider,
          model: selected.model,
          timeoutMs: 3000,
        },
        preferLocal: false,
      };
      saveConfig(cfg);
      log(`\n  ${green('✓')} LLM classifier: ${bold(selected.name)} / ${selected.model}`);
      classifierConfigured = true;
    } else {
      log(`\n  ${dim('Using heuristic classifier (no LLM). You can enable it later in config.')}`);
    }
  } else {
    log(`  ${dim('None of your providers have a recommended classifier model.')}`);
    log(`  ${dim('Tip: Add Groq (free tier) for ultra-fast LLM classification.')}`);
    log(`  ${dim('Using heuristic classifier for now.')}\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Set up routing policy (map tiers to models)
  // ═══════════════════════════════════════════════════════════════
  log('');
  log(bold('  ── Phase 3: Routing Policy ──\n'));
  log(`  A routing policy maps task types to specific models.`);
  log(`  AIN has 6 tiers: ${dim('fast, general, reasoning, coding, creative, ultra-fast')}\n`);

  const setupPolicy = await ask(`  ${bold('Set up a routing policy?')} ${dim('[Y/n]')}: `);

  if (!setupPolicy || setupPolicy.toLowerCase() === 'y' || setupPolicy.toLowerCase() === 'yes') {
    await setupRoutingPolicy(providerNames);
  } else {
    log(`\n  ${dim('Skipped. AIN will use your default provider for all tasks.')}`);
    log(`  ${dim('Run `ain wizard` to configure routing later.')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Done!
  // ═══════════════════════════════════════════════════════════════
  log('');
  log(bold('  You\'re all set! ') + 'Try these commands:');
  log(`    ${cyan('ain')} What is the capital of France?`);
  log(`    ${cyan('ain')} --route "Summarize this text"      ${dim('# auto-routes to best model')}`);
  log(`    ${cyan('ain routing simulate')} "debug my code"   ${dim('# see routing decision')}`);
  log(`    ${cyan('ain routing catalog')}                    ${dim('# browse model catalog')}`);
  log(`    ${cyan('ain wizard')}                             ${dim('# re-run setup anytime')}`);
  log(`    ${cyan('ain doctor')}                             ${dim('# health check')}`);
  log('');
}

async function pickProvider(): Promise<ProviderTemplate | null> {
  const cloud = PROVIDER_TEMPLATES.filter((t) => t.category === 'cloud');
  const local = PROVIDER_TEMPLATES.filter((t) => t.category === 'local');

  log(bold('  Cloud providers:'));
  cloud.forEach((t, i) => {
    const classTag = t.classifierModel ? ` ${dim('[classifier]')}` : '';
    log(`    ${cyan(String(i + 1).padStart(2, ' '))}. ${t.name.padEnd(28)} ${dim(t.description)}${classTag}`);
  });
  log('');
  log(bold('  Local providers:'));
  local.forEach((t, i) => {
    const n = cloud.length + i + 1;
    log(`    ${cyan(String(n).padStart(2, ' '))}. ${t.name.padEnd(28)} ${dim(t.description)}`);
  });
  log('');

  const all = [...cloud, ...local];
  const choice = await ask(`  ${bold('Pick a provider')} ${dim(`[1-${all.length}, or Enter to finish]`)}: `);

  if (!choice) return null;

  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= all.length) {
    log(red('  Invalid choice.'));
    return null;
  }

  return all[idx];
}

async function setupFromTemplate(template: ProviderTemplate, isFirst: boolean): Promise<void> {
  log(`\n  Selected: ${bold(template.name)}`);

  let baseUrl = template.baseUrl;

  if (template.category === 'local') {
    const urlInput = await ask(`  ${bold('Base URL')} ${dim(`[${template.baseUrl}]`)}: `);
    if (urlInput) baseUrl = urlInput;
  }

  let apiKey: string | undefined;
  if (template.requiresApiKey) {
    if (template.signupUrl) {
      log(`\n  ${dim('Get your API key at:')} ${cyan(template.signupUrl)}`);
    }

    log('');
    log(`  ${dim('You can enter the key directly or use')} ${bold('env:' + template.apiKeyEnvVar)} ${dim('to read from environment.')}`);

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
        log(yellow('  No API key provided. You can add it later in ~/.ain/config.yaml'));
        apiKey = `env:${template.apiKeyEnvVar}`;
      } else if (keyInput.startsWith('env:')) {
        apiKey = keyInput;
      } else {
        log(`\n  ${dim('Tip: For security, set')} ${bold(`export ${template.apiKeyEnvVar}="${keyInput}"`)} ${dim('in your shell profile')}`);
        apiKey = keyInput;
      }
    }
  }

  const providerData = {
    kind: 'openai-compatible' as const,
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    models: template.defaultModels ?? [],
  };

  try {
    const provider = ProviderConfigSchema.parse(providerData);
    addProvider(template.id, provider);

    if (isFirst) {
      const config = loadUserConfig();
      config.defaults = {
        ...config.defaults,
        provider: template.id,
        model: template.defaultModels?.[0]?.id,
      };
      saveConfig(config);
    }

    log(`\n  ${green('✓')} Provider ${bold(template.id)} configured${isFirst ? ' (set as default)' : ''}.`);

    await testConnection(template, baseUrl);
  } catch (err) {
    log(red(`\n  Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

async function setupCustomProvider(): Promise<void> {
  const name = await ask(`  ${bold('Provider name')} ${dim('(e.g. my-server)')}: `);
  if (!name) {
    log(red('  No name provided.'));
    return;
  }

  const baseUrl = await ask(`  ${bold('Base URL')} ${dim('(e.g. http://localhost:8080/v1)')}: `);
  if (!baseUrl) {
    log(red('  No URL provided.'));
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
    if (!config.defaults?.provider) {
      config.defaults = { ...config.defaults, provider: name };
      saveConfig(config);
    }

    log(`\n  ${green('✓')} Provider ${bold(name)} configured.`);

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
          log(`  ${yellow('!')} Could not list models. Run: ain models refresh ${name}`);
        }
      }
    } else {
      log(`  ${yellow('!')} Could not connect: ${health.error ?? 'unknown error'}`);
    }
  } catch (err) {
    log(red(`\n  Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

async function setupRoutingPolicy(providerNames: string[]): Promise<void> {
  const config = loadUserConfig();
  const tiers = ['fast', 'general', 'reasoning', 'coding', 'creative'] as const;

  // Collect all models across providers
  const allModels: Array<{ provider: string; model: string; tags: string[] }> = [];
  for (const pName of providerNames) {
    const p = config.providers[pName];
    if (!p) continue;
    for (const m of p.models ?? []) {
      allModels.push({ provider: pName, model: m.id, tags: m.tags ?? [] });
    }
  }

  if (allModels.length === 0) {
    log(`  ${yellow('!')} No models found. Run \`ain models refresh\` first.`);
    return;
  }

  log(`\n  For each tier, pick a model from your configured providers.`);
  log(`  ${dim('Press Enter to skip a tier (will use default model).')}\n`);

  const policyTiers: Record<string, { provider: string; model: string }> = {};

  for (const tier of tiers) {
    // Show models with tag hints
    log(`  ${bold(tier.toUpperCase())} tier:`);
    const suggested = allModels.filter(m => m.tags.includes(tier));
    const rest = allModels.filter(m => !m.tags.includes(tier));
    const ordered = [...suggested, ...rest];

    ordered.forEach((m, i) => {
      const tagStr = m.tags.length ? ` ${dim(`[${m.tags.join(', ')}]`)}` : '';
      const rec = suggested.includes(m) ? ` ${green('← suggested')}` : '';
      log(`    ${cyan(String(i + 1).padStart(2))}. ${m.provider}/${m.model}${tagStr}${rec}`);
    });

    const choice = await ask(`    ${bold('Model')} ${dim(`[1-${ordered.length}, Enter to skip]`)}: `);
    if (choice) {
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < ordered.length) {
        policyTiers[tier] = { provider: ordered[idx].provider, model: ordered[idx].model };
        log(`    ${green('✓')} ${tier} → ${ordered[idx].provider}/${ordered[idx].model}`);
      }
    }
    log('');
  }

  if (Object.keys(policyTiers).length === 0) {
    log(`  ${dim('No tiers configured. Using default model for all tasks.')}`);
    return;
  }

  // Write policies.yaml
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let yaml = 'version: 1\ndefaultPolicy: main\n\npolicies:\n  main:\n    description: Auto-generated by wizard\n    tiers:\n';
  for (const [tier, { provider, model }] of Object.entries(policyTiers)) {
    yaml += `      ${tier}:\n        provider: ${provider}\n        model: ${model}\n`;
  }

  const path = getPolicyFilePath();
  writeFileSync(path, yaml, 'utf-8');
  log(`  ${green('✓')} Routing policy saved to ${dim(path)}`);
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
