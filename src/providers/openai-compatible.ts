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
    this.timeoutMs = config.timeoutMs ?? 30000;
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
    const response = await this.fetchChatCompletion(request);
    return response;
  }

  /**
   * Send a non-streaming chat request, but gracefully handle providers that
   * return SSE (streaming) format regardless of stream:false.
   * Reads the body as text first, then either JSON.parse or SSE-assembles.
   */
  private async fetchChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ ...request, stream: false }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      const contentType = response.headers?.get('content-type') ?? '';
      const isSSE = contentType.includes('text/event-stream');

      if (isSSE) {
        // Provider returned streaming format — assemble into a single response
        return await this.assembleSseResponse(response, controller.signal);
      }

      // Normal JSON response
      const text = await response.text();
      return JSON.parse(text) as ChatCompletionResponse;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read an SSE response body and assemble all content deltas into a single
   * ChatCompletionResponse (same shape as the non-streaming response).
   */
  private async assembleSseResponse(
    response: Response,
    _signal: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    if (!response.body) throw new Error('No response body for SSE assembly');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let id = '';
    let model = '';
    let finishReason = '';
    let usage: ChatCompletionResponse['usage'] | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(trimmed.slice(6));
          if (!id && chunk.id) id = chunk.id;
          if (!model && chunk.model) model = chunk.model;
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) content += delta;
          const fr = chunk?.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }

    return {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
      ...(usage ? { usage } : {}),
    };
  }

  async *chatStream(request: ChatCompletionRequest): AsyncGenerator<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await globalThis.fetch(url, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ ...request, stream: true }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.timeoutMs}ms`);
        }
        throw err;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      if (!response.body) throw new Error('No response body for streaming');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const chunk = JSON.parse(trimmed.slice(6));
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
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
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAdapter(config: ProviderConfig): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter(config);
}
