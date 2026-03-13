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
