import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the provider
vi.mock('../src/providers/openai-compatible.js', () => ({
  createAdapter: vi.fn(() => ({
    chat: vi.fn(async (req: { model: string; messages: Array<{ role: string; content: string }> }) => ({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Date.now(),
      model: req.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Test response' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })),
  })),
}));

vi.mock('../src/config/loader.js', () => ({
  resolveProvider: vi.fn(() => ({
    name: 'test-provider',
    provider: {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [{ id: 'test-model' }],
    },
  })),
  resolveModel: vi.fn(() => 'test-model'),
}));

describe('run', () => {
  it('returns a successful result', async () => {
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Hello' });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Test response');
    expect(result.provider).toBe('test-provider');
    expect(result.model).toBe('test-model');
  });

  it('includes usage stats', async () => {
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Hello' });
    expect(result.usage?.total_tokens).toBe(15);
  });
});
