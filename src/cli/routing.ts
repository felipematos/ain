import type { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { route, simulateRoute, getPolicyFilePath, loadPolicies } from '../routing/router.js';
import { getConfigDir } from '../config/loader.js';
import { mkdirSync } from 'fs';

export function registerRoutingCommands(program: Command): void {
  const routing = program.command('routing').description('Routing policies and simulation');

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
    .action(() => {
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

      const starter = `version: 1
defaultPolicy: local-first

policies:
  local-first:
    description: Route all tasks locally using tiered models
    localFirst: true
    tiers:
      fast:
        provider: mac-mini
        model: liquid/lfm2.5-1.2b
        temperature: 0.1
        maxTokens: 512
      general:
        provider: mac-mini
        model: google/gemma-3n-e4b
        temperature: 0.7
        maxTokens: 2048
      reasoning:
        provider: mac-mini
        model: qwen3.5-4b-mlx
        temperature: 0.6
        maxTokens: 4096
`;
      writeFileSync(path, starter, 'utf-8');
      process.stdout.write(`Policies file created at ${path}\n`);
    });
}
