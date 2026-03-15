import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { loadConfig, getConfigDir } from '../config/loader.js';
import { classifyWithHeuristic } from './classifier.js';
import { classify } from './llm-classifier.js';
import { getModelTiers } from './model-catalog.js';
import type { RoutingRequest, RoutingDecision, ModelTier, PolicyFile, RoutingPolicy, ClassificationResult } from './types.js';

export function getPolicyFilePath(): string {
  return join(getConfigDir(), 'policies.yaml');
}

export function loadPolicies(): PolicyFile | null {
  const path = getPolicyFilePath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return parseYaml(raw) as PolicyFile;
}

function remapPremium(request: RoutingRequest): RoutingRequest {
  if ((request.tier as string) === 'premium') {
    return { ...request, tier: 'reasoning' };
  }
  return request;
}

// Classify the prompt: explicit tier > LLM classifier > heuristic
async function classifyTier(request: RoutingRequest, config: ReturnType<typeof loadConfig>): Promise<{ tier: ModelTier; rationale: string }> {
  if (request.tier) {
    return { tier: request.tier, rationale: 'Explicit tier override' };
  }

  const routingConfig = config.routing;
  const classification = await classify(request.prompt, routingConfig);
  const rationale = classification.source === 'llm'
    ? `LLM classifier (confidence=${classification.confidence})`
    : `Heuristic classifier (task=${classification.taskType})`;
  return { tier: classification.tier, rationale };
}

function classifyTierSync(request: RoutingRequest): { tier: ModelTier; rationale: string } {
  if (request.tier) {
    return { tier: request.tier, rationale: 'Explicit tier override' };
  }
  const classification = classifyWithHeuristic(request.prompt);
  return { tier: classification.tier, rationale: `Heuristic classifier (task=${classification.taskType})` };
}

export async function route(request: RoutingRequest): Promise<RoutingDecision> {
  request = remapPremium(request);
  const config = loadConfig();
  const policies = loadPolicies();

  // Classify tier first (LLM if enabled, then heuristic)
  const { tier, rationale } = await classifyTier(request, config);

  // Resolve named policy
  if (request.policyName) {
    if (!policies) {
      throw new Error(`Policy "${request.policyName}" requested but no policies file found at ${getPolicyFilePath()}`);
    }
    const policy = policies.policies[request.policyName];
    if (!policy) {
      const available = Object.keys(policies.policies).join(', ') || '(none)';
      throw new Error(`Policy "${request.policyName}" not found. Available: ${available}`);
    }
    return applyPolicy(tier, rationale, policy);
  }

  // Default policy
  if (policies?.defaultPolicy && policies.policies[policies.defaultPolicy]) {
    return applyPolicy(tier, rationale, policies.policies[policies.defaultPolicy]!);
  }

  // No policy — resolve model from provider config
  return resolveModel(tier, rationale, config);
}

export function routeSync(request: RoutingRequest): RoutingDecision {
  request = remapPremium(request);
  const config = loadConfig();
  const policies = loadPolicies();

  const { tier, rationale } = classifyTierSync(request);

  if (request.policyName) {
    if (!policies) {
      throw new Error(`Policy "${request.policyName}" requested but no policies file found at ${getPolicyFilePath()}`);
    }
    const policy = policies.policies[request.policyName];
    if (!policy) {
      const available = Object.keys(policies.policies).join(', ') || '(none)';
      throw new Error(`Policy "${request.policyName}" not found. Available: ${available}`);
    }
    return applyPolicy(tier, rationale, policy);
  }

  if (policies?.defaultPolicy && policies.policies[policies.defaultPolicy]) {
    return applyPolicy(tier, rationale, policies.policies[policies.defaultPolicy]!);
  }

  return resolveModel(tier, rationale, config);
}

function applyPolicy(tier: ModelTier, rationale: string, policy: RoutingPolicy): RoutingDecision {
  const tierConfig = policy.tiers[tier] ?? policy.tiers['general'];

  if (!tierConfig) {
    throw new Error(`Policy has no tier configuration for "${tier}" or "general"`);
  }

  const rawFallback = policy.fallbackChain ?? [];
  const fallbackChain = rawFallback.map((providerModel) => {
    const slashIdx = providerModel.indexOf('/');
    const provider = slashIdx >= 0 ? providerModel.slice(0, slashIdx) : providerModel;
    const model = slashIdx >= 0 ? providerModel.slice(slashIdx + 1) : '';
    return { provider, model };
  });

  return {
    provider: tierConfig.provider,
    model: tierConfig.model,
    tier,
    rationale: `Policy routing: tier=${tier}, ${rationale}`,
    params: {
      temperature: tierConfig.temperature,
      maxTokens: tierConfig.maxTokens,
    },
    ...(fallbackChain.length > 0 ? { fallbackChain } : {}),
  };
}

function resolveModel(tier: ModelTier, rationale: string, config: ReturnType<typeof loadConfig>): RoutingDecision {
  const defaultProvider = config.defaults?.provider;
  const defaultModel = config.defaults?.model;

  if (!defaultProvider) {
    throw new Error('No routing policy and no default provider configured');
  }

  const provider = config.providers[defaultProvider];
  if (!provider) {
    throw new Error(`Default provider "${defaultProvider}" not found`);
  }

  // Try to find a model matching the tier: tags → alias → catalog
  const models = provider.models ?? [];
  let tieredModel = models.find((m) =>
    m.tags?.includes(tier) || m.alias === tier
  );

  if (!tieredModel) {
    tieredModel = models.find((m) => {
      const catalogTiers = getModelTiers(m.id);
      return catalogTiers?.includes(tier);
    });
  }

  tieredModel ??= models[0];

  const modelId = tieredModel?.id ?? defaultModel ?? '';

  if (!modelId) {
    throw new Error('Cannot determine model for routing');
  }

  return {
    provider: defaultProvider,
    model: modelId,
    tier,
    rationale: `Heuristic routing: tier=${tier}, ${rationale}`,
  };
}

export async function simulateRoute(request: RoutingRequest): Promise<RoutingDecision & { dryRun: true }> {
  return { ...(await route(request)), dryRun: true };
}
