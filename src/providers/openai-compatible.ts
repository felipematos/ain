import { resolveApiKey } from '../config/loader.js';
import type { ProviderConfig, ModelConfig } from '../config/types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'json_schema'; json_schema: unknown };
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
  }>;
}

export class OpenAICompatibleAdapter {
  private baseUrl: string;
  private apiKey: string | undefined;
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(private config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = resolveApiKey(config.apiKey);
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...(config.defaultHeaders ?? {}),
    };
  }

  async listModels(): Promise<ModelsResponse> {
    const response = await this.fetch('/models');
    return response as ModelsResponse;
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.fetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response as ChatCompletionResponse;
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.listModels();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        ...options,
        headers: { ...this.headers, ...(options.headers as Record<string, string> ?? {}) },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAdapter(config: ProviderConfig): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter(config);
}
