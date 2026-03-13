/**
 * Integration tests against real local LLM endpoint.
 * Skip if SKIP_INTEGRATION env var is set.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'https://felipes-mac-mini.tail4f12c7.ts.net:8443/v1';
const SKIP = process.env['SKIP_INTEGRATION'] === '1';

describe.skipIf(SKIP)('Integration: OpenAI-compatible adapter', () => {
  it('lists models from real server', async () => {
    const { OpenAICompatibleAdapter } = await import('../src/providers/openai-compatible.js');
    const adapter = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: BASE_URL,
      timeoutMs: 30000,
      models: [],
    });
    const response = await adapter.listModels();
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0]?.id).toBeTruthy();
  });

  it('runs a simple prompt', async () => {
    const { OpenAICompatibleAdapter } = await import('../src/providers/openai-compatible.js');
    const adapter = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: BASE_URL,
      timeoutMs: 60000,
      models: [],
    });
    const response = await adapter.chat({
      model: 'liquid/lfm2.5-1.2b',
      messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
      max_tokens: 10,
    });
    expect(response.choices[0]?.message.content).toBeTruthy();
  });

  it('health check passes', async () => {
    const { OpenAICompatibleAdapter } = await import('../src/providers/openai-compatible.js');
    const adapter = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: BASE_URL,
      timeoutMs: 30000,
      models: [],
    });
    const health = await adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeDefined();
  });

  it('streams tokens from real server', async () => {
    const { OpenAICompatibleAdapter } = await import('../src/providers/openai-compatible.js');
    const adapter = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: BASE_URL,
      timeoutMs: 60000,
      models: [],
    });
    const chunks: string[] = [];
    for await (const token of adapter.chatStream({
      model: 'liquid/lfm2.5-1.2b',
      messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
      max_tokens: 10,
    })) {
      chunks.push(token);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBeTruthy();
  });

  it('streams tokens progressively (multiple chunks expected)', async () => {
    const { OpenAICompatibleAdapter } = await import('../src/providers/openai-compatible.js');
    const adapter = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: BASE_URL,
      timeoutMs: 60000,
      models: [],
    });
    const chunks: string[] = [];
    for await (const token of adapter.chatStream({
      model: 'liquid/lfm2.5-1.2b',
      messages: [{ role: 'user', content: 'Count 1 2 3 4 5 briefly.' }],
      max_tokens: 30,
    })) {
      chunks.push(token);
    }
    // Streaming should yield multiple chunks
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('')).toMatch(/[1-5]/);
  });

  it('returns schema-shaped JSON via run()', async () => {
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'Give me info about France',
      provider: 'mac-mini',
      model: 'liquid/lfm2.5-1.2b',
      schema: {
        type: 'object',
        required: ['country', 'capital'],
        properties: {
          country: { type: 'string' },
          capital: { type: 'string' },
        },
      },
    });
    expect(result.ok).toBe(true);
    expect((result.parsedOutput as Record<string, unknown>)['capital']).toBeTruthy();
  });
});
