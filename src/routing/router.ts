import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { loadConfig, getConfigDir } from '../config/loader.js';
import { classifyTask } from './classifier.js';
import type { RoutingRequest, RoutingDecision, ModelTier, PolicyFile, RoutingPolicy } from './types.js';

export function getPolicyFilePath(): string {
  return join(getConfigDir(), 'policies.yaml');
}

export function loadPolicies(): PolicyFile | null {
  const path = getPolicyFilePath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return parseYaml(raw) as PolicyFile;
}

export function route(request: RoutingRequest): RoutingDecision {
  const config = loadConfig();
  const policies = loadPolicies();

  // Try policy-based routing first
  if (request.policyName && policies) {
    const policy = policies.policies[request.policyName];
    if (policy) {
      return routeByPolicy(request, policy);
    }
  }

  // Default policy if available
  if (policies?.defaultPolicy && policies.policies[policies.defaultPolicy]) {
    return routeByPolicy(request, policies.policies[policies.defaultPolicy]!);
  }

  // Heuristic routing
  return routeByHeuristic(request, config);
}

function routeByPolicy(request: RoutingRequest, policy: RoutingPolicy): RoutingDecision {
  const tier = request.tier ?? selectTierByTask(request.prompt);
  const tierConfig = policy.tiers[tier] ?? policy.tiers['general'];

  if (!tierConfig) {
    throw new Error(`Policy has no tier configuration for "${tier}" or "general"`);
  }

  const fallbackChain = (policy.fallbackChain ?? []).map((providerModel) => {
    const [provider, model] = providerModel.split('/');
    return { provider, model };
  });

  return {
    provider: tierConfig.provider,
    model: tierConfig.model,
    tier,
    rationale: `Policy routing: tier=${tier}, policy tier config`,
    params: {
      temperature: tierConfig.temperature,
      maxTokens: tierConfig.maxTokens,
    },
    fallbackChain,
  };
}

function routeByHeuristic(request: RoutingRequest, config: ReturnType<typeof loadConfig>): RoutingDecision {
  const tier = request.tier ?? selectTierByTask(request.prompt);
  const defaultProvider = config.defaults?.provider;
  const defaultModel = config.defaults?.model;

  if (!defaultProvider) {
    throw new Error('No routing policy and no default provider configured');
  }

  const provider = config.providers[defaultProvider];
  if (!provider) {
    throw new Error(`Default provider "${defaultProvider}" not found`);
  }

  // Try to find a model matching the tier
  const models = provider.models ?? [];
  const tieredModel = models.find((m) =>
    m.tags?.includes(tier) || m.alias === tier
  ) ?? models[0];

  const modelId = tieredModel?.id ?? defaultModel ?? '';

  if (!modelId) {
    throw new Error('Cannot determine model for routing');
  }

  return {
    provider: defaultProvider,
    model: modelId,
    tier,
    rationale: `Heuristic routing: tier=${tier}, using ${tieredModel ? 'tier-matched' : 'default'} model`,
  };
}

function selectTierByTask(prompt: string): ModelTier {
  const taskType = classifyTask(prompt);
  const tierMap: Record<typeof taskType, ModelTier> = {
    classification: 'fast',
    extraction: 'fast',
    generation: 'general',
    reasoning: 'reasoning',
    unknown: 'general',
  };
  return tierMap[taskType];
}

export function simulateRoute(request: RoutingRequest): RoutingDecision & { dryRun: true } {
  return { ...route(request), dryRun: true };
}
