import { resolveProvider, resolveModel } from '../config/loader.js';
import { createAdapter } from '../providers/openai-compatible.js';
import type { ChatMessage } from '../providers/openai-compatible.js';
import { withRetry } from '../shared/retry.js';

export interface RunOptions {
  prompt: string;
  provider?: string;
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  schema?: object;
  noThink?: boolean;
  maxRetries?: number;
}

export async function* stream(options: RunOptions): AsyncGenerator<string> {
  const { name: providerName, provider } = resolveProvider(options.provider);
  const modelId = resolveModel(options.model, providerName);
  if (!modelId) throw new Error('No model specified and no default model configured.');

  const adapter = createAdapter(provider);
  const messages: ChatMessage[] = buildMessages(options);
  const request = buildRequest(modelId, messages, options);

  let buffer = '';
  let inThinkBlock = false;

  for await (const token of adapter.chatStream(request)) {
    // Buffer to handle multi-token patterns like <think>, <|im_end|>
    buffer += token;
    const result = filterThinkTokens(buffer, inThinkBlock);
    buffer = result.remaining;
    inThinkBlock = result.inThinkBlock;
    if (result.output) {
      // Strip end-of-sequence tokens from intermediate output too
      const cleaned = result.output.replace(/<\|im_end\|>/g, '').replace(/<\|end\|>/g, '').replace(/<\/s>/g, '');
      if (cleaned) yield cleaned;
    }
  }

  // Flush any remaining buffer (strip end tokens)
  if (buffer) {
    const flushed = cleanModelOutput(buffer);
    if (flushed) yield flushed;
  }
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

function buildMessages(options: RunOptions): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (options.noThink) {
    messages.push({ role: 'system', content: '/no_think' });
  }
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
  return messages;
}

function buildRequest(modelId: string, messages: ChatMessage[], options: RunOptions) {
  return {
    model: modelId,
    messages,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
  };
}

function filterThinkTokens(
  buffer: string,
  inThinkBlock: boolean,
): { output: string; remaining: string; inThinkBlock: boolean } {
  let output = '';
  let remaining = buffer;
  let inside = inThinkBlock;

  while (remaining.length > 0) {
    if (inside) {
      const endIdx = remaining.indexOf('</think>');
      if (endIdx === -1) {
        // Still inside think block, consume everything
        remaining = '';
        break;
      }
      remaining = remaining.slice(endIdx + 8);
      inside = false;
    } else {
      const startIdx = remaining.indexOf('<think>');
      if (startIdx === -1) {
        output += remaining;
        remaining = '';
        break;
      }
      output += remaining.slice(0, startIdx);
      remaining = remaining.slice(startIdx + 7);
      inside = true;
    }
  }

  return { output, remaining: inside ? remaining : '', inThinkBlock: inside };
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { name: providerName, provider } = resolveProvider(options.provider);
  const modelId = resolveModel(options.model, providerName);

  if (!modelId) {
    throw new Error('No model specified and no default model configured. Use --model or set defaults.model in config.');
  }

  const adapter = createAdapter(provider);
  const messages = buildMessages(options);
  const request = buildRequest(modelId, messages, options);

  const response = await withRetry(
    () => adapter.chat(request),
    options.maxRetries !== undefined ? { maxAttempts: options.maxRetries } : {},
  );
  const rawOutput = cleanModelOutput(response.choices[0]?.message?.content ?? '');

  let parsedOutput: unknown;
  if (options.jsonMode || options.schema) {
    const jsonText = stripMarkdownFences(rawOutput);
    try {
      parsedOutput = JSON.parse(jsonText);
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

export function stripMarkdownFences(text: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers that some models add
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return text.trim();
}

export function cleanModelOutput(text: string): string {
  // Strip <think>...</think> blocks (Qwen3, DeepSeek reasoning models)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  // Strip common end-of-sequence tokens
  cleaned = cleaned.replace(/<\|im_end\|>/g, '').replace(/<\|end\|>/g, '').replace(/<\/s>/g, '');
  return cleaned.trim();
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
