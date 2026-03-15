export interface ProviderTemplate {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  description: string;
  category: 'cloud' | 'local';
  requiresApiKey: boolean;
  signupUrl?: string;
  defaultModels?: Array<{ id: string; alias?: string; tags?: string[] }>;
  classifierModel?: string; // recommended model for LLM classifier from this provider
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // --- Cloud providers ---
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    description: 'GPT-4o, GPT-4o-mini, o1, o3, and more',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://platform.openai.com/api-keys',
    defaultModels: [
      { id: 'gpt-4o', alias: 'gpt4', tags: ['general', 'coding'] },
      { id: 'gpt-4o-mini', alias: 'gpt4-mini', tags: ['fast'] },
      { id: 'o3-mini', alias: 'o3', tags: ['reasoning'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    description: 'Claude Opus, Sonnet, and Haiku',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      { id: 'claude-sonnet-4-6', alias: 'sonnet', tags: ['general', 'coding'] },
      { id: 'claude-haiku-4-5-20251001', alias: 'haiku', tags: ['fast'] },
      { id: 'claude-opus-4-6', alias: 'opus', tags: ['reasoning', 'creative'] },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    description: 'Unified gateway to 200+ models from all providers',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://openrouter.ai/keys',
    defaultModels: [
      { id: 'openai/gpt-4o', tags: ['general'] },
      { id: 'anthropic/claude-sonnet-4-6', tags: ['general', 'reasoning'] },
      { id: 'google/gemini-2.5-pro', tags: ['reasoning'] },
      { id: 'meta-llama/llama-4-scout', tags: ['fast', 'cheap'] },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnvVar: 'XAI_API_KEY',
    description: 'Grok models from xAI',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://console.x.ai',
    defaultModels: [
      { id: 'grok-3', alias: 'grok', tags: ['general', 'reasoning'] },
      { id: 'grok-3-mini', alias: 'grok-mini', tags: ['fast'] },
    ],
  },
  {
    id: 'zai',
    name: 'Z.ai (Zhipu)',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyEnvVar: 'ZAI_API_KEY',
    description: 'GLM-4.7, GLM-4.6, and CodeGeeX models',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://z.ai/model-api',
    defaultModels: [
      { id: 'glm-4.7', alias: 'glm', tags: ['general', 'reasoning'] },
      { id: 'glm-4.6', tags: ['general'] },
      { id: 'codegeex-4', alias: 'codegeex', tags: ['fast'] },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    description: 'Ultra-fast inference for Llama, Mixtral, Gemma',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://console.groq.com/keys',
    classifierModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    defaultModels: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', alias: 'scout', tags: ['fast', 'classifier'] },
      { id: 'llama-3.3-70b-versatile', alias: 'llama70', tags: ['general', 'reasoning'] },
      { id: 'llama-3.1-8b-instant', alias: 'llama8', tags: ['fast'] },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    description: 'Open-source models: Llama, Mistral, Qwen, DeepSeek',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://api.together.ai/settings/api-keys',
    classifierModel: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    defaultModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', alias: 'llama70', tags: ['general'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', alias: 'qwen72', tags: ['reasoning'] },
      { id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo', alias: 'llama8', tags: ['fast', 'cheap'] },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    description: 'Mistral Large, Medium, and Small models',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://console.mistral.ai/api-keys',
    defaultModels: [
      { id: 'mistral-large-latest', alias: 'mistral-large', tags: ['general', 'reasoning'] },
      { id: 'mistral-small-latest', alias: 'mistral-small', tags: ['fast', 'cheap'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek-V3 and DeepSeek-R1 reasoning models',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://platform.deepseek.com/api_keys',
    defaultModels: [
      { id: 'deepseek-chat', alias: 'deepseek', tags: ['general'] },
      { id: 'deepseek-reasoner', alias: 'deepseek-r1', tags: ['reasoning'] },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
    description: 'Fast inference for open-source models',
    category: 'cloud',
    requiresApiKey: true,
    signupUrl: 'https://fireworks.ai/account/api-keys',
    classifierModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    defaultModels: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', alias: 'llama70', tags: ['general'] },
      { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', alias: 'llama8', tags: ['fast', 'cheap'] },
    ],
  },
  // --- Local providers ---
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: '',
    description: 'Run models locally with Ollama',
    category: 'local',
    requiresApiKey: false,
    signupUrl: 'https://ollama.com/download',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyEnvVar: '',
    description: 'Run models locally with LM Studio',
    category: 'local',
    requiresApiKey: false,
    signupUrl: 'https://lmstudio.ai',
  },
  {
    id: 'vllm',
    name: 'vLLM',
    baseUrl: 'http://localhost:8000/v1',
    apiKeyEnvVar: '',
    description: 'High-throughput local inference server',
    category: 'local',
    requiresApiKey: false,
    signupUrl: 'https://docs.vllm.ai',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    apiKeyEnvVar: '',
    description: 'Any OpenAI-compatible API endpoint',
    category: 'cloud',
    requiresApiKey: false,
  },
];

export function getTemplate(id: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): ProviderTemplate[] {
  return PROVIDER_TEMPLATES;
}
