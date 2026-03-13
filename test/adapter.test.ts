import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleAdapter } from '../src/providers/openai-compatible.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
beforeEach(() => mockFetch.mockReset());

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

const adapter = new OpenAICompatibleAdapter({
  kind: 'openai-compatible',
  baseUrl: 'http://localhost:1234/v1',
  timeoutMs: 5000,
  models: [],
});

describe('OpenAICompatibleAdapter.chat', () => {
  it('sends POST to /chat/completions', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'test',
      object: 'chat.completion',
      created: 1,
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
    }));

    await adapter.chat({ model: 'test-model', messages: [{ role: 'user', content: 'Hi' }] });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sets stream: false in request body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'test', object: 'chat.completion', created: 1, model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    }));

    await adapter.chat({ model: 'test-model', messages: [{ role: 'user', content: 'Hi' }] });
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.stream).toBe(false);
  });

  it('throws on HTTP error without retrying (no retry at adapter level)', async () => {
    // The adapter should NOT retry — retry is handled at runner level
    mockFetch.mockResolvedValue(jsonResponse({ error: 'bad request' }, 400));
    await expect(adapter.chat({ model: 'test-model', messages: [] })).rejects.toThrow('HTTP 400');
    // Only one fetch call — no retry at adapter level
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('includes Authorization header when apiKey is set', async () => {
    const adapterWithKey = new OpenAICompatibleAdapter({
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'sk-test',
      timeoutMs: 5000,
      models: [],
    });

    mockFetch.mockResolvedValue(jsonResponse({
      id: 'test', object: 'chat.completion', created: 1, model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    }));

    await adapterWithKey.chat({ model: 'test-model', messages: [] });
    const headers = (mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });
});

describe('OpenAICompatibleAdapter.listModels', () => {
  it('fetches from /models endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      object: 'list',
      data: [{ id: 'model-1', object: 'model' }],
    }));

    const result = await adapter.listModels();
    expect(result.data[0]?.id).toBe('model-1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.objectContaining({}),
    );
  });
});
