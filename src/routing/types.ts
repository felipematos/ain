export type ModelTier = 'fast' | 'general' | 'reasoning' | 'premium';
export type TaskType = 'classification' | 'extraction' | 'generation' | 'reasoning' | 'unknown';

export interface RoutingPolicy {
  name?: string;
  description?: string;
  tiers: Partial<Record<ModelTier, TierConfig>>;
  localFirst?: boolean;
  fallbackChain?: string[];
}

export interface TierConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RoutingRequest {
  prompt: string;
  tier?: ModelTier;
  policyName?: string;
  localFirst?: boolean;
  maxLatencyMs?: number;
  costProfile?: 'cheap' | 'balanced' | 'premium';
}

export interface RoutingDecision {
  provider: string;
  model: string;
  tier: ModelTier;
  rationale: string;
  params?: {
    temperature?: number;
    maxTokens?: number;
  };
  fallbackChain?: Array<{ provider: string; model: string }>;
}

export interface PolicyFile {
  version: 1;
  policies: Record<string, RoutingPolicy>;
  defaultPolicy?: string;
}
