import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { simulateRoute, getPolicyFilePath, loadPolicies } from '../routing/router.js';
import { MODEL_CATALOG, CATALOG_VERSION, getCatalogModelsByTier } from '../routing/model-catalog.js';
import { getConfigDir, loadConfig } from '../config/loader.js';
import type { ModelTier, CatalogModel } from '../routing/types.js';

export function registerRoutingCommands(program: Command): void {
  const routing = program.command('routing').alias('rt').description('Routing policies and simulation');

  routing
    .command('simulate <prompt>')
    .description('Show which model would be selected for a prompt (dry run)')
    .option('--policy <name>', 'Policy name to use')
    .option('--tier <tier>', 'Force a specific tier (ultra-fast, fast, general, reasoning, coding, creative)')
    .option('--json', 'Output as JSON')
    .action(async (prompt: string, opts) => {
      try {
        const decision = await simulateRoute({
          prompt,
          policyName: opts.policy,
          tier: opts.tier,
        });

        if (opts.json) {
          process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
        } else {
          process.stdout.write(`Tier:     ${decision.tier}\n`);
          process.stdout.write(`Provider: ${decision.provider}\n`);
          process.stdout.write(`Model:    ${decision.model}\n`);
          process.stdout.write(`Rationale: ${decision.rationale}\n`);
          if (decision.params?.temperature !== undefined || decision.params?.maxTokens !== undefined) {
            const parts = [];
            if (decision.params.temperature !== undefined) parts.push(`temperature=${decision.params.temperature}`);
            if (decision.params.maxTokens !== undefined) parts.push(`maxTokens=${decision.params.maxTokens}`);
            process.stdout.write(`Params:   ${parts.join(', ')}\n`);
          }
          if (decision.fallbackChain?.length) {
            process.stdout.write(`Fallback: ${decision.fallbackChain.map((f) => `${f.provider}/${f.model}`).join(' → ')}\n`);
          }
        }
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });

  routing
    .command('policies')
    .description('List available routing policies')
    .option('-v, --verbose', 'Show tier configuration details')
    .action((opts) => {
      const policies = loadPolicies();
      if (!policies) {
        process.stdout.write(`No policies file found at ${getPolicyFilePath()}\n`);
        process.stdout.write('Run: ain routing init-policies to create one.\n');
        return;
      }
      const names = Object.keys(policies.policies);
      process.stdout.write(`Default policy: ${policies.defaultPolicy ?? '(none)'}\n\n`);
      for (const name of names) {
        const p = policies.policies[name];
        const isDefault = name === policies.defaultPolicy ? ' *' : '';
        process.stdout.write(`  ${name}${isDefault}  ${p?.description ?? ''}\n`);
        if (opts.verbose && p) {
          const tiers = Object.entries(p.tiers);
          for (const [tier, config] of tiers) {
            if (!config) continue;
            const params: string[] = [];
            if (config.temperature !== undefined) params.push(`temp=${config.temperature}`);
            if (config.maxTokens !== undefined) params.push(`maxTokens=${config.maxTokens}`);
            const paramStr = params.length ? `  (${params.join(', ')})` : '';
            process.stdout.write(`    ${tier}: ${config.provider}/${config.model}${paramStr}\n`);
          }
          if (p.fallbackChain?.length) {
            process.stdout.write(`    fallback: ${p.fallbackChain.join(' → ')}\n`);
          }
        }
      }
    });

  routing
    .command('catalog')
    .description('List built-in model catalog')
    .option('--tier <tier>', 'Filter by tier (ultra-fast, fast, general, reasoning, coding, creative)')
    .option('--local', 'Show only locally available models')
    .option('--json', 'Output as JSON')
    .option('--update', 'Fetch latest model data from OpenRouter API')
    .action(async (opts) => {
      if (opts.update) {
        await updateCatalog();
        return;
      }

      let models: readonly CatalogModel[] = loadCatalog();

      if (opts.tier) {
        models = models.filter(m => m.tiers.includes(opts.tier as ModelTier));
      }
      if (opts.local) {
        models = models.filter(m => m.local);
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(models, null, 2) + '\n');
        return;
      }

      process.stdout.write(`Model Catalog (${CATALOG_VERSION}) — ${models.length} models\n\n`);
      const tierOrder: ModelTier[] = ['ultra-fast', 'fast', 'general', 'reasoning', 'coding', 'creative'];
      for (const tier of tierOrder) {
        const tierModels = models.filter(m => m.tiers.includes(tier));
        if (tierModels.length === 0) continue;
        process.stdout.write(`  ${tier}:\n`);
        for (const m of tierModels) {
          const loc = m.local ? 'local' : 'cloud';
          const costStr = m.cost ? `$${m.cost.input}/$${m.cost.output} per 1M` : 'free/local';
          const paramsStr = m.params ? ` (${m.params})` : '';
          process.stdout.write(`    ${m.id}${paramsStr}  [${loc}]  ${costStr}\n`);
        }
        process.stdout.write('\n');
      }
    });

  routing
    .command('init-policies')
    .description('Create a starter policies file')
    .option('--force', 'Overwrite existing policies file')
    .action((opts) => {
      const path = getPolicyFilePath();
      if (existsSync(path) && !opts.force) {
        process.stdout.write(`Policies file already exists at ${path}\nUse --force to overwrite.\n`);
        return;
      }
      const dir = getConfigDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      // Detect configured provider and first model to use as placeholder
      let providerName = 'my-provider';
      let fastModel = 'fast-model';
      let generalModel = 'general-model';
      let reasoningModel = 'reasoning-model';
      try {
        const config = loadConfig();
        const defaultProvider = config.defaults?.provider ?? Object.keys(config.providers)[0];
        if (defaultProvider && config.providers[defaultProvider]) {
          providerName = defaultProvider;
          const models = config.providers[defaultProvider]!.models ?? [];
          const taggedFast = models.find((m) => m.tags?.includes('fast'));
          const taggedGeneral = models.find((m) => m.tags?.includes('general'));
          const taggedReasoning = models.find((m) => m.tags?.includes('reasoning'));
          fastModel = taggedFast?.id ?? models[0]?.id ?? fastModel;
          generalModel = taggedGeneral?.id ?? models[0]?.id ?? generalModel;
          reasoningModel = taggedReasoning?.id ?? models[0]?.id ?? reasoningModel;
        }
      } catch {
        // No config yet — use placeholder names
      }

      const starter = `version: 1
defaultPolicy: local-first

policies:
  local-first:
    description: Route all tasks locally using tiered models
    localFirst: true
    tiers:
      fast:
        provider: ${providerName}
        model: ${fastModel}
        temperature: 0.1
        maxTokens: 512
      general:
        provider: ${providerName}
        model: ${generalModel}
        temperature: 0.7
        maxTokens: 2048
      reasoning:
        provider: ${providerName}
        model: ${reasoningModel}
        temperature: 0.6
        maxTokens: 4096
      # coding:
      #   provider: ${providerName}
      #   model: coding-model
      #   temperature: 0.2
      #   maxTokens: 4096
      # creative:
      #   provider: ${providerName}
      #   model: creative-model
      #   temperature: 0.9
      #   maxTokens: 4096
`;
      writeFileSync(path, starter, 'utf-8');
      process.stdout.write(`Policies file created at ${path}\n`);
    });
}

function loadCatalog(): readonly CatalogModel[] {
  const userCatalogPath = join(getConfigDir(), 'model-catalog.json');
  if (existsSync(userCatalogPath)) {
    try {
      const raw = readFileSync(userCatalogPath, 'utf-8');
      return JSON.parse(raw) as CatalogModel[];
    } catch {
      // Fall through to built-in catalog
    }
  }
  return MODEL_CATALOG;
}

async function updateCatalog(): Promise<void> {
  process.stderr.write('Fetching model data from OpenRouter API...\n');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as { data: Array<Record<string, unknown>> };
    const models: CatalogModel[] = [];

    for (const m of data.data) {
      const id = m.id as string;
      if (!id) continue;

      const name = (m.name as string) ?? id;
      const context = typeof m.context_length === 'number' ? m.context_length : undefined;
      const pricing = m.pricing as { prompt?: string; completion?: string } | undefined;
      const arch = m.architecture as { tokenizer?: string; modality?: string; instruct_type?: string | null } | undefined;

      const cost = pricing?.prompt && pricing?.completion
        ? { input: parseFloat(pricing.prompt) * 1_000_000, output: parseFloat(pricing.completion) * 1_000_000 }
        : null;

      const tiers = autoClassifyTiers(id, name);
      if (tiers.length === 0) continue;

      models.push({
        id,
        name,
        tiers,
        local: false,
        context: context ?? undefined,
        cost: cost && (cost.input > 0 || cost.output > 0) ? cost : null,
      });
    }

    // Merge with built-in catalog (built-in entries for local models preserved)
    const merged = [...MODEL_CATALOG.filter(m => m.local)];
    const existingIds = new Set(merged.map(m => m.id));
    for (const m of models) {
      if (!existingIds.has(m.id)) {
        merged.push(m);
        existingIds.add(m.id);
      }
    }

    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const catalogPath = join(dir, 'model-catalog.json');
    writeFileSync(catalogPath, JSON.stringify(merged, null, 2), 'utf-8');
    process.stdout.write(`Updated catalog: ${merged.length} models written to ${catalogPath}\n`);
  } catch (err) {
    process.stderr.write(`Error updating catalog: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function autoClassifyTiers(id: string, name: string): ModelTier[] {
  const lower = (id + ' ' + name).toLowerCase();
  const tiers: ModelTier[] = [];

  if (/\b(r1|qwq|o3|o4|reasoning)\b/.test(lower)) tiers.push('reasoning');
  if (/\b(coder|codex|devstral|code)\b/.test(lower)) tiers.push('coding');
  if (/\b(creative|opus|grok)\b/.test(lower)) tiers.push('creative');

  // Parameter-based classification
  const paramMatch = lower.match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (paramMatch) {
    const params = parseFloat(paramMatch[1]);
    if (params < 4) tiers.push('ultra-fast');
    else if (params < 14) tiers.push('fast');
    else if (params < 80) tiers.push('general');
  }

  // Name-based fallbacks
  if (tiers.length === 0) {
    if (/mini|lite|flash-lite|small|tiny/.test(lower)) tiers.push('fast');
    else if (/flash|turbo/.test(lower)) tiers.push('fast');
    else if (/pro|sonnet|4\.1|gpt-5\b/.test(lower)) tiers.push('general');
    else tiers.push('general');
  }

  return [...new Set(tiers)];
}
