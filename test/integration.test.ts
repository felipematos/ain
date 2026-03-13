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
});
