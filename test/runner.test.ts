import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChat = vi.fn();

vi.mock('../src/providers/openai-compatible.js', () => ({
  createAdapter: vi.fn(() => ({ chat: mockChat })),
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

function makeChatResponse(content: string, model = 'test-model') {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

beforeEach(() => {
  mockChat.mockReset();
});

describe('run — text mode', () => {
  it('returns successful result', async () => {
    mockChat.mockResolvedValue(makeChatResponse('Hello!'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Hi' });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Hello!');
    expect(result.provider).toBe('test-provider');
    expect(result.model).toBe('test-model');
  });

  it('includes usage stats', async () => {
    mockChat.mockResolvedValue(makeChatResponse('Hi'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Hi' });
    expect(result.usage?.total_tokens).toBe(15);
  });

  it('adds system message when system option provided', async () => {
    mockChat.mockResolvedValue(makeChatResponse('Hi'));
    const { run } = await import('../src/execution/runner.js');
    await run({ prompt: 'Hi', system: 'You are a helpful assistant.' });
    const req = mockChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages[0]!.role).toBe('system');
    expect(req.messages[0]!.content).toBe('You are a helpful assistant.');
  });
});

describe('run — JSON mode', () => {
  it('parses JSON output', async () => {
    mockChat.mockResolvedValue(makeChatResponse('{"key":"value"}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Give me JSON', jsonMode: true });
    expect(result.parsedOutput).toEqual({ key: 'value' });
  });

  it('strips markdown fences from JSON output', async () => {
    mockChat.mockResolvedValue(makeChatResponse('```json\n{"key":"value"}\n```'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Give me JSON', jsonMode: true });
    expect(result.parsedOutput).toEqual({ key: 'value' });
  });

  it('throws on invalid JSON', async () => {
    mockChat.mockResolvedValue(makeChatResponse('not valid json at all'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Give me JSON', jsonMode: true })).rejects.toThrow('invalid JSON');
  });
});

describe('run — schema mode', () => {
  const schema = {
    type: 'object',
    required: ['name', 'value'],
    properties: { name: { type: 'string' }, value: { type: 'number' } },
  };

  it('validates and returns parsed output', async () => {
    mockChat.mockResolvedValue(makeChatResponse('{"name":"test","value":42}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Give me data', schema });
    expect(result.parsedOutput).toEqual({ name: 'test', value: 42 });
  });

  it('throws on schema validation failure — missing required field', async () => {
    mockChat.mockResolvedValue(makeChatResponse('{"name":"test"}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Give me data', schema })).rejects.toThrow('Missing required field: value');
  });

  it('throws on schema validation failure — wrong type', async () => {
    mockChat.mockResolvedValue(makeChatResponse('"just a string"'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Give me data', schema })).rejects.toThrow('Expected object');
  });
});

describe('cleanModelOutput', () => {
  it('strips <think> blocks', async () => {
    const { cleanModelOutput } = await import('../src/execution/runner.js');
    expect(cleanModelOutput('<think>Reasoning here...</think>\nParis')).toBe('Paris');
  });

  it('strips <|im_end|> tokens', async () => {
    const { cleanModelOutput } = await import('../src/execution/runner.js');
    expect(cleanModelOutput('Paris<|im_end|>')).toBe('Paris');
  });

  it('strips </s> tokens', async () => {
    const { cleanModelOutput } = await import('../src/execution/runner.js');
    expect(cleanModelOutput('Paris</s>')).toBe('Paris');
  });

  it('passes through clean output', async () => {
    const { cleanModelOutput } = await import('../src/execution/runner.js');
    expect(cleanModelOutput('Paris')).toBe('Paris');
  });
});

describe('stripMarkdownFences', () => {
  it('strips ```json fences', async () => {
    const { stripMarkdownFences } = await import('../src/execution/runner.js');
    expect(stripMarkdownFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips plain ``` fences', async () => {
    const { stripMarkdownFences } = await import('../src/execution/runner.js');
    expect(stripMarkdownFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('passes through plain JSON', async () => {
    const { stripMarkdownFences } = await import('../src/execution/runner.js');
    expect(stripMarkdownFences('{"a":1}')).toBe('{"a":1}');
  });

  it('trims whitespace', async () => {
    const { stripMarkdownFences } = await import('../src/execution/runner.js');
    expect(stripMarkdownFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});
