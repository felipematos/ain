import { resolveProvider, resolveModel } from '../config/loader.js';
import { createAdapter } from '../providers/openai-compatible.js';
import type { ChatMessage } from '../providers/openai-compatible.js';

export interface RunOptions {
  prompt: string;
  provider?: string;
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  schema?: object;
}

export interface RunResult {
  ok: boolean;
  provider: string;
  model: string;
  output: string;
  parsedOutput?: unknown;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { name: providerName, provider } = resolveProvider(options.provider);
  const modelId = resolveModel(options.model, providerName);

  if (!modelId) {
    throw new Error('No model specified and no default model configured. Use --model or set defaults.model in config.');
  }

  const adapter = createAdapter(provider);
  const messages: ChatMessage[] = [];

  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }

  if (options.schema) {
    messages.push({
      role: 'system',
      content: `You must respond with valid JSON matching this schema: ${JSON.stringify(options.schema, null, 2)}. Return only the JSON object, no markdown, no other text.`,
    });
  } else if (options.jsonMode) {
    messages.push({
      role: 'system',
      content: 'You must respond with valid JSON only. Return only the JSON object, no markdown, no other text.',
    });
  }

  messages.push({ role: 'user', content: options.prompt });

  const request: Parameters<typeof adapter.chat>[0] = {
    model: modelId,
    messages,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
  };

  const response = await adapter.chat(request);
  const rawOutput = response.choices[0]?.message?.content ?? '';

  let parsedOutput: unknown;
  if (options.jsonMode || options.schema) {
    try {
      parsedOutput = JSON.parse(rawOutput);
    } catch {
      throw new Error(`Provider returned invalid JSON: ${rawOutput}`);
    }

    if (options.schema) {
      const validation = validateSchema(parsedOutput, options.schema);
      if (!validation.valid) {
        throw new Error(`Output does not match schema: ${validation.errors.join(', ')}`);
      }
    }
  }

  return {
    ok: true,
    provider: providerName,
    model: response.model || modelId,
    output: rawOutput,
    parsedOutput,
    usage: response.usage,
  };
}

function validateSchema(data: unknown, schema: object): { valid: boolean; errors: string[] } {
  // Basic JSON schema validation (type checking only for common cases)
  // For production, would use ajv or similar
  const s = schema as Record<string, unknown>;
  const errors: string[] = [];

  if (s['type'] === 'object' && typeof data !== 'object') {
    errors.push(`Expected object, got ${typeof data}`);
  } else if (s['type'] === 'array' && !Array.isArray(data)) {
    errors.push(`Expected array, got ${typeof data}`);
  } else if (s['type'] === 'string' && typeof data !== 'string') {
    errors.push(`Expected string, got ${typeof data}`);
  }

  if (s['required'] && Array.isArray(s['required']) && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const field of s['required'] as string[]) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
