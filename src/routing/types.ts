export type ModelTier = 'ultra-fast' | 'fast' | 'general' | 'reasoning' | 'coding' | 'creative';
export type TaskType = 'classification' | 'extraction' | 'generation' | 'reasoning' | 'coding' | 'creative' | 'unknown';

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

export interface CatalogModel {
  id: string;
  name: string;
  tiers: ModelTier[];
  local: boolean;
  params?: string;
  context?: number;
  cost?: { input: number; output: number } | null;
}

export interface ClassificationResult {
  taskType: TaskType;
  tier: ModelTier;
  confidence: number;
  source: 'heuristic' | 'llm';
}

export interface LlmClassifierConfig {
  enabled: boolean;
  provider: string;
  model: string;
  timeoutMs: number;
}

export interface RoutingConfig {
  llmClassifier?: LlmClassifierConfig;
  preferLocal?: boolean;
}
