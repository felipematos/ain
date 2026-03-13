import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChatStream = vi.fn();

vi.mock('../src/providers/openai-compatible.js', () => ({
  createAdapter: vi.fn(() => ({ chatStream: mockChatStream, chat: vi.fn() })),
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

async function* tokens(...words: string[]): AsyncGenerator<string> {
  for (const w of words) yield w;
}

beforeEach(() => {
  mockChatStream.mockReset();
});

describe('stream', () => {
  it('yields plain text tokens', async () => {
    mockChatStream.mockReturnValue(tokens('Hello', ', ', 'world', '!'));
    const { stream } = await import('../src/execution/runner.js');
    const collected: string[] = [];
    for await (const tok of stream({ prompt: 'Hi' })) {
      collected.push(tok);
    }
    expect(collected.join('')).toBe('Hello, world!');
  });

  it('strips <think> blocks from streaming output', async () => {
    mockChatStream.mockReturnValue(tokens('<think>', 'internal reasoning', '</think>', '\n', 'Paris'));
    const { stream } = await import('../src/execution/runner.js');
    const collected: string[] = [];
    for await (const tok of stream({ prompt: 'What is the capital?' })) {
      collected.push(tok);
    }
    expect(collected.join('').trim()).toBe('Paris');
  });

  it('strips <|im_end|> from final token', async () => {
    mockChatStream.mockReturnValue(tokens('Paris', '<|im_end|>'));
    const { stream } = await import('../src/execution/runner.js');
    const collected: string[] = [];
    for await (const tok of stream({ prompt: 'Capital?' })) {
      collected.push(tok);
    }
    expect(collected.join('')).toBe('Paris');
  });
});

describe('stream — fallback chain', () => {
  it('falls through to fallback when primary stream fails', async () => {
    mockChatStream
      .mockImplementationOnce(() => {
        throw new Error('HTTP 503: unavailable');
      })
      .mockReturnValue(tokens('Fallback', ' response'));

    const { stream } = await import('../src/execution/runner.js');
    const collected: string[] = [];
    for await (const tok of stream({
      prompt: 'Hi',
      fallbackChain: [{ provider: 'fallback-provider', model: 'fallback-model' }],
    })) {
      collected.push(tok);
    }
    expect(collected.join('')).toBe('Fallback response');
    expect(mockChatStream).toHaveBeenCalledTimes(2);
  });

  it('throws when all streaming candidates fail', async () => {
    mockChatStream.mockImplementation(() => {
      throw new Error('HTTP 503: always down');
    });

    const { stream } = await import('../src/execution/runner.js');
    const gen = stream({
      prompt: 'Hi',
      fallbackChain: [{ provider: 'fallback-provider', model: 'fallback-model' }],
    });
    await expect(gen.next()).rejects.toThrow('HTTP 503: always down');
  });
});

describe('stream — timeoutMs override', () => {
  it('applies timeoutMs from options to the provider adapter', async () => {
    mockChatStream.mockReturnValue(tokens('Hi'));
    const { createAdapter } = await import('../src/providers/openai-compatible.js');
    const { stream } = await import('../src/execution/runner.js');
    const collected: string[] = [];
    for await (const tok of stream({ prompt: 'Hi', timeoutMs: 5000 })) {
      collected.push(tok);
    }
    // Verify createAdapter was called with the overridden timeout
    const adapterCallArg = vi.mocked(createAdapter).mock.calls.at(-1)![0] as { timeoutMs: number };
    expect(adapterCallArg.timeoutMs).toBe(5000);
  });
});

describe('run with noThink', () => {
  it('adds /no_think system message when noThink=true', async () => {
    const mockChat = vi.fn(async () => ({
      id: 'test',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Paris' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    }));
    vi.mocked(vi.importActual as unknown as { mock: unknown }).mock;
    const { createAdapter } = await import('../src/providers/openai-compatible.js');
    vi.mocked(createAdapter).mockReturnValue({ chatStream: mockChatStream, chat: mockChat } as never);

    const { run } = await import('../src/execution/runner.js');
    await run({ prompt: 'Capital of France?', noThink: true });

    const req = mockChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages[0]!.content).toBe('/no_think');
  });
});
