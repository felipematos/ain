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
  loadConfig: vi.fn(() => ({ version: 1, providers: {}, defaults: {} })),
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

describe('run — empty response', () => {
  it('throws on empty content from provider', async () => {
    mockChat.mockResolvedValue({
      id: 'test',
      object: 'chat.completion',
      created: 0,
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
    });
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Hi' })).rejects.toThrow('empty response');
  });
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

  it('applies config defaults for temperature and maxTokens', async () => {
    const { loadConfig } = await import('../src/config/loader.js');
    vi.mocked(loadConfig).mockReturnValueOnce({
      version: 1,
      providers: {},
      defaults: { temperature: 0.3, maxTokens: 512 },
    });
    mockChat.mockResolvedValue(makeChatResponse('Hi'));
    const { run } = await import('../src/execution/runner.js');
    await run({ prompt: 'Hi' });
    const req = mockChat.mock.calls[0]![0] as { temperature: number; max_tokens: number };
    expect(req.temperature).toBe(0.3);
    expect(req.max_tokens).toBe(512);
  });

  it('explicit options override config defaults', async () => {
    const { loadConfig } = await import('../src/config/loader.js');
    vi.mocked(loadConfig).mockReturnValueOnce({
      version: 1,
      providers: {},
      defaults: { temperature: 0.3, maxTokens: 512 },
    });
    mockChat.mockResolvedValue(makeChatResponse('Hi'));
    const { run } = await import('../src/execution/runner.js');
    await run({ prompt: 'Hi', temperature: 0.9, maxTokens: 100 });
    const req = mockChat.mock.calls[0]![0] as { temperature: number; max_tokens: number };
    expect(req.temperature).toBe(0.9);
    expect(req.max_tokens).toBe(100);
  });

  it('orders messages: noThink → system → schema → user', async () => {
    mockChat.mockResolvedValue(makeChatResponse('{"x":1}'));
    const { run } = await import('../src/execution/runner.js');
    const schema = { type: 'object', required: ['x'], properties: { x: { type: 'number' } } };
    await run({ prompt: 'Go', system: 'Be concise.', noThink: true, schema });
    const req = mockChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages[0]!.content).toBe('/no_think');
    expect(req.messages[1]!.content).toBe('Be concise.');
    expect(req.messages[2]!.content).toContain('JSON');   // schema instruction
    expect(req.messages[3]!.role).toBe('user');
    expect(req.messages[3]!.content).toBe('Go');
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
    await expect(run({ prompt: 'Give me data', schema })).rejects.toThrow('missing required field');
  });

  it('throws on schema validation failure — wrong type', async () => {
    mockChat.mockResolvedValue(makeChatResponse('"just a string"'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Give me data', schema })).rejects.toThrow('expected object');
  });
});

describe('run — fallback chain', () => {
  it('succeeds on first try when no fallback needed', async () => {
    mockChat.mockResolvedValue(makeChatResponse('Hello!'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'Hi',
      fallbackChain: [{ provider: 'fallback-provider', model: 'fallback-model' }],
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Hello!');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('falls through to fallback when primary fails', async () => {
    mockChat
      .mockRejectedValueOnce(new Error('HTTP 503: unavailable'))
      .mockResolvedValue(makeChatResponse('Fallback response'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'Hi',
      maxRetries: 1,
      fallbackChain: [{ provider: 'fallback-provider', model: 'fallback-model' }],
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Fallback response');
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('throws last error when all candidates fail', async () => {
    mockChat.mockRejectedValue(new Error('HTTP 503: always fails'));
    const { run } = await import('../src/execution/runner.js');
    await expect(
      run({
        prompt: 'Hi',
        maxRetries: 1,
        fallbackChain: [{ provider: 'fallback-provider', model: 'fallback-model' }],
      }),
    ).rejects.toThrow('HTTP 503: always fails');
    // maxRetries:1 = maxAttempts:1 (no retry), 2 candidates × 1 attempt each
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});

describe('run — boolean mode', () => {
  it('parses true response', async () => {
    mockChat.mockResolvedValue(makeChatResponse('true'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Is the sky blue?', boolMode: true });
    expect(result.parsedOutput).toBe(true);
  });

  it('parses false response', async () => {
    mockChat.mockResolvedValue(makeChatResponse('false'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Is the Earth flat?', boolMode: true });
    expect(result.parsedOutput).toBe(false);
  });

  it('normalizes "yes" to true', async () => {
    mockChat.mockResolvedValue(makeChatResponse('Yes'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Is water wet?', boolMode: true });
    expect(result.parsedOutput).toBe(true);
  });

  it('normalizes "no" to false', async () => {
    mockChat.mockResolvedValue(makeChatResponse('No'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({ prompt: 'Is fire cold?', boolMode: true });
    expect(result.parsedOutput).toBe(false);
  });

  it('throws on non-boolean response', async () => {
    mockChat.mockResolvedValue(makeChatResponse('maybe'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({ prompt: 'Is this ambiguous?', boolMode: true })).rejects.toThrow('Expected boolean response');
  });

  it('injects boolean system prompt', async () => {
    mockChat.mockResolvedValue(makeChatResponse('true'));
    const { run } = await import('../src/execution/runner.js');
    await run({ prompt: 'Test', boolMode: true });
    const req = mockChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const systemMsgs = req.messages.filter(m => m.role === 'system');
    expect(systemMsgs.some(m => m.content.includes('true" or "false"'))).toBe(true);
  });
});

describe('parseBooleanOutput', () => {
  it('parses "true"', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('true')).toBe(true);
  });

  it('parses "false"', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('false')).toBe(false);
  });

  it('parses "True" (case-insensitive)', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('True')).toBe(true);
  });

  it('parses "yes" as true', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('yes')).toBe(true);
  });

  it('parses "no" as false', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('no')).toBe(false);
  });

  it('strips trailing punctuation', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('true.')).toBe(true);
    expect(parseBooleanOutput('False!')).toBe(false);
  });

  it('strips whitespace', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(parseBooleanOutput('  true  ')).toBe(true);
  });

  it('throws on non-boolean', async () => {
    const { parseBooleanOutput } = await import('../src/execution/runner.js');
    expect(() => parseBooleanOutput('maybe')).toThrow('Expected boolean response');
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

  it('strips unclosed <think> blocks (model never finished thinking)', async () => {
    const { cleanModelOutput } = await import('../src/execution/runner.js');
    expect(cleanModelOutput('<think>reasoning that never ends...')).toBe('');
    expect(cleanModelOutput('Before thought<think>partial reasoning...')).toBe('Before thought');
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
