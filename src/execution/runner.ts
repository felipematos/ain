import { resolveProvider, resolveModel, loadConfig } from '../config/loader.js';
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
  timeoutMs?: number;
  fallbackChain?: Array<{ provider: string; model: string }>;
}

export async function* stream(options: RunOptions): AsyncGenerator<string> {
  const candidates: Array<{ provider?: string; model?: string }> = [
    { provider: options.provider, model: options.model },
    ...(options.fallbackChain ?? []),
  ];

  let lastError: Error | undefined;

  for (const candidate of candidates) {
    try {
      yield* streamOnce({ ...options, provider: candidate.provider, model: candidate.model });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('All streaming candidates failed');
}

async function* streamOnce(options: RunOptions): AsyncGenerator<string> {
  const { name: providerName, provider } = resolveProvider(options.provider);
  const modelId = resolveModel(options.model, providerName);
  if (!modelId) throw new Error('No model specified and no default model configured.');

  const configDefaults = loadConfig().defaults;
  const effectiveOptions = {
    ...options,
    temperature: options.temperature ?? configDefaults?.temperature,
    maxTokens: options.maxTokens ?? configDefaults?.maxTokens,
  };

  const effectiveProvider = options.timeoutMs
    ? { ...provider, timeoutMs: options.timeoutMs }
    : provider;
  const adapter = createAdapter(effectiveProvider);
  const messages: ChatMessage[] = buildMessages(effectiveOptions);
  const request = buildRequest(modelId, messages, effectiveOptions);

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
  const candidates: Array<{ provider?: string; model?: string }> = [
    { provider: options.provider, model: options.model },
    ...(options.fallbackChain ?? []),
  ];

  let lastError: Error | undefined;

  for (const candidate of candidates) {
    try {
      return await runOnce({ ...options, provider: candidate.provider, model: candidate.model });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('All candidates failed');
}

async function runOnce(options: RunOptions): Promise<RunResult> {
  const { name: providerName, provider } = resolveProvider(options.provider);
  const modelId = resolveModel(options.model, providerName);

  if (!modelId) {
    throw new Error('No model specified and no default model configured. Use --model or set defaults.model in config.');
  }

  // Apply config defaults for temperature/maxTokens when not explicitly set
  const configDefaults = loadConfig().defaults;
  const effectiveTemperature = options.temperature ?? configDefaults?.temperature;
  const effectiveMaxTokens = options.maxTokens ?? configDefaults?.maxTokens;
  const effectiveOptions = { ...options, temperature: effectiveTemperature, maxTokens: effectiveMaxTokens };

  const effectiveProvider = options.timeoutMs
    ? { ...provider, timeoutMs: options.timeoutMs }
    : provider;
  const adapter = createAdapter(effectiveProvider);
  const messages = buildMessages(effectiveOptions);
  const request = buildRequest(modelId, messages, effectiveOptions);

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

function validateSchema(
  data: unknown,
  schema: object,
  path = '',
): { valid: boolean; errors: string[] } {
  const s = schema as Record<string, unknown>;
  const errors: string[] = [];
  const label = path || 'root';

  // Type check
  const expectedType = s['type'] as string | undefined;
  if (expectedType) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (expectedType === 'integer') {
      if (typeof data !== 'number' || !Number.isInteger(data)) {
        errors.push(`${label}: expected integer, got ${actualType}`);
      }
    } else if (expectedType !== actualType) {
      errors.push(`${label}: expected ${expectedType}, got ${actualType}`);
      return { valid: false, errors }; // can't validate further if type is wrong
    }
  }

  // Enum check
  if (s['enum'] && Array.isArray(s['enum'])) {
    if (!(s['enum'] as unknown[]).includes(data)) {
      errors.push(`${label}: value ${JSON.stringify(data)} not in enum [${(s['enum'] as unknown[]).join(', ')}]`);
    }
  }

  // Object: required + properties
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (s['required'] && Array.isArray(s['required'])) {
      for (const field of s['required'] as string[]) {
        if (!(field in obj)) {
          errors.push(`${label}: missing required field "${field}"`);
        }
      }
    }

    if (s['properties'] && typeof s['properties'] === 'object') {
      const props = s['properties'] as Record<string, object>;
      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj) {
          const nested = validateSchema(obj[key], propSchema, path ? `${path}.${key}` : key);
          errors.push(...nested.errors);
        }
      }
    }
  }

  // Array: items
  if (Array.isArray(data) && s['items'] && typeof s['items'] === 'object') {
    for (let i = 0; i < data.length; i++) {
      const nested = validateSchema(data[i], s['items'] as object, `${label}[${i}]`);
      errors.push(...nested.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}
