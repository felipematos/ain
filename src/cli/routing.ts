import type { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { route, simulateRoute, getPolicyFilePath, loadPolicies } from '../routing/router.js';
import { getConfigDir, loadConfig } from '../config/loader.js';

export function registerRoutingCommands(program: Command): void {
  const routing = program.command('routing').alias('rt').description('Routing policies and simulation');

  routing
    .command('simulate <prompt>')
    .description('Show which model would be selected for a prompt (dry run)')
    .option('--policy <name>', 'Policy name to use')
    .option('--tier <tier>', 'Force a specific tier (fast, general, reasoning, premium)')
    .option('--json', 'Output as JSON')
    .action((prompt: string, opts) => {
      try {
        const decision = simulateRoute({
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
`;
      writeFileSync(path, starter, 'utf-8');
      process.stdout.write(`Policies file created at ${path}\n`);
    });
}
