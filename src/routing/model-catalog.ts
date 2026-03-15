import type { CatalogModel, ModelTier } from './types.js';

export const CATALOG_VERSION = '2026-03-14';

export const MODEL_CATALOG: readonly CatalogModel[] = [
  // Ultra-fast tier
  { id: 'google/gemma-3n-e2b', name: 'Gemma 3n E2B', tiers: ['ultra-fast'], local: true, params: '2B', context: 8192, cost: null },
  { id: 'meta-llama/llama-3.2-1b-instruct', name: 'Llama 3.2 1B', tiers: ['ultra-fast'], local: true, params: '1B', context: 131072, cost: null },
  { id: 'qwen/qwen3-4b', name: 'Qwen3 4B', tiers: ['ultra-fast'], local: true, params: '4B', context: 32768, cost: null },
  { id: 'microsoft/phi-4-mini', name: 'Phi-4 Mini', tiers: ['ultra-fast'], local: true, params: '3.8B', context: 16384, cost: null },
  { id: 'huggingfacetb/smollm3-3b', name: 'SmolLM3 3B', tiers: ['ultra-fast'], local: true, params: '3B', context: 8192, cost: null },

  // Fast tier
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', tiers: ['fast'], local: false, params: undefined, context: 128000, cost: { input: 0.15, output: 0.6 } },
  { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', tiers: ['fast'], local: false, context: 1048576, cost: { input: 0.075, output: 0.3 } },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tiers: ['fast'], local: false, context: 1048576, cost: { input: 0.15, output: 0.6 } },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', tiers: ['fast'], local: true, params: '8B', context: 131072, cost: null },
  { id: 'qwen/qwen3-8b', name: 'Qwen3 8B', tiers: ['fast'], local: true, params: '8B', context: 32768, cost: null },
  { id: 'mistralai/mistral-small-3.2-24b-instruct', name: 'Mistral Small 3.2 24B', tiers: ['fast'], local: true, params: '24B', context: 131072, cost: null },
  { id: 'google/gemma-3-12b', name: 'Gemma 3 12B', tiers: ['fast'], local: true, params: '12B', context: 131072, cost: null },

  // General tier
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', tiers: ['general'], local: false, context: 1047576, cost: { input: 2, output: 8 } },
  { id: 'openai/gpt-5', name: 'GPT-5', tiers: ['general'], local: false, context: 1047576, cost: { input: 3, output: 12 } },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tiers: ['general', 'coding'], local: false, context: 200000, cost: { input: 3, output: 15 } },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', tiers: ['general'], local: false, context: 200000, cost: { input: 0.8, output: 4 } },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', tiers: ['general'], local: false, context: 1048576, cost: { input: 1.25, output: 10 } },
  { id: 'google/gemini-3.0-flash', name: 'Gemini 3.0 Flash', tiers: ['general'], local: false, context: 1048576, cost: { input: 0.3, output: 1.2 } },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', tiers: ['general'], local: false, params: '400B', context: 1048576, cost: { input: 0.5, output: 1.5 } },
  { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek Chat V3', tiers: ['general', 'coding'], local: false, context: 131072, cost: { input: 0.27, output: 1.1 } },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', tiers: ['general'], local: true, params: '32B', context: 32768, cost: null },

  // Reasoning tier
  { id: 'openai/o3', name: 'O3', tiers: ['reasoning'], local: false, context: 200000, cost: { input: 10, output: 40 } },
  { id: 'openai/o4-mini', name: 'O4 Mini', tiers: ['reasoning'], local: false, context: 200000, cost: { input: 1.1, output: 4.4 } },
  { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', tiers: ['reasoning', 'creative'], local: false, context: 200000, cost: { input: 15, output: 75 } },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', tiers: ['reasoning'], local: false, context: 131072, cost: { input: 0.55, output: 2.19 } },
  { id: 'qwen/qwq-32b', name: 'QwQ 32B', tiers: ['reasoning'], local: true, params: '32B', context: 131072, cost: null },

  // Coding tier
  { id: 'openai/codex-mini', name: 'Codex Mini', tiers: ['coding'], local: false, context: 200000, cost: { input: 1.5, output: 6 } },
  { id: 'qwen/qwen3-coder', name: 'Qwen3 Coder', tiers: ['coding'], local: true, params: '32B', context: 131072, cost: null },
  { id: 'mistralai/devstral-small', name: 'Devstral Small', tiers: ['coding'], local: true, params: '24B', context: 131072, cost: null },

  // Creative tier
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', tiers: ['creative'], local: false, context: 1047576, cost: { input: 5, output: 20 } },
  { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', tiers: ['creative'], local: false, context: 1048576, cost: { input: 2, output: 8 } },
  { id: 'xai/grok-4', name: 'Grok 4', tiers: ['creative'], local: false, context: 131072, cost: { input: 3, output: 15 } },
];

export function findCatalogModel(modelId: string): CatalogModel | undefined {
  return MODEL_CATALOG.find(m => m.id === modelId);
}

export function matchCatalogModel(configuredModelId: string): CatalogModel | undefined {
  // Exact match
  const exact = findCatalogModel(configuredModelId);
  if (exact) return exact;

  // Suffix match: strip provider prefix (e.g. "gpt-4o-mini" matches "openai/gpt-4o-mini")
  const suffix = MODEL_CATALOG.find(m => m.id.endsWith('/' + configuredModelId));
  if (suffix) return suffix;

  // Substring match: configuredModelId appears anywhere in catalog id
  return MODEL_CATALOG.find(m => m.id.includes(configuredModelId) || configuredModelId.includes(m.id.split('/')[1] ?? ''));
}

export function getCatalogModelsByTier(tier: ModelTier): CatalogModel[] {
  return MODEL_CATALOG.filter(m => m.tiers.includes(tier));
}

export function getModelTiers(modelId: string): ModelTier[] | undefined {
  const model = matchCatalogModel(modelId);
  return model?.tiers;
}
