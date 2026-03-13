import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChat = vi.fn();
vi.mock('../src/providers/openai-compatible.js', () => ({
  createAdapter: vi.fn(() => ({ chat: mockChat })),
}));
vi.mock('../src/config/loader.js', () => ({
  resolveProvider: vi.fn(() => ({
    name: 'test',
    provider: { kind: 'openai-compatible', baseUrl: 'http://localhost/v1', timeoutMs: 60000, models: [] },
  })),
  resolveModel: vi.fn(() => 'test-model'),
  loadConfig: vi.fn(() => ({ version: 1, providers: {}, defaults: {} })),
}));

function chatReturning(content: string) {
  return {
    id: 'test', object: 'chat.completion', created: 0, model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  };
}

beforeEach(() => mockChat.mockReset());

describe('schema validation — nested objects', () => {
  it('validates correct nested object', async () => {
    mockChat.mockResolvedValue(chatReturning('{"name":"Alice","address":{"city":"NYC","zip":"10001"}}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'test',
      schema: {
        type: 'object',
        required: ['name', 'address'],
        properties: {
          name: { type: 'string' },
          address: {
            type: 'object',
            required: ['city'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
            },
          },
        },
      },
    });
    expect(result.parsedOutput).toMatchObject({ name: 'Alice', address: { city: 'NYC' } });
  });

  it('catches wrong type in nested property', async () => {
    mockChat.mockResolvedValue(chatReturning('{"name":"Alice","address":{"city":12345}}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { address: { type: 'object', properties: { city: { type: 'string' } } } },
      },
    })).rejects.toThrow('address.city: expected string, got number');
  });

  it('catches missing required nested field', async () => {
    mockChat.mockResolvedValue(chatReturning('{"address":{}}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: {
          address: { type: 'object', required: ['city'], properties: { city: { type: 'string' } } },
        },
      },
    })).rejects.toThrow('address: missing required field "city"');
  });
});

describe('schema validation — arrays', () => {
  it('validates correct array of strings', async () => {
    mockChat.mockResolvedValue(chatReturning('{"tags":["a","b","c"]}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      },
    });
    expect((result.parsedOutput as Record<string, unknown>)['tags']).toEqual(['a', 'b', 'c']);
  });

  it('catches wrong item type in array', async () => {
    mockChat.mockResolvedValue(chatReturning('{"tags":[1,2,3]}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      },
    })).rejects.toThrow('tags[0]: expected string, got number');
  });
});

describe('schema validation — enum', () => {
  it('accepts valid enum value', async () => {
    mockChat.mockResolvedValue(chatReturning('{"status":"active"}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'inactive', 'pending'] } },
      },
    });
    expect((result.parsedOutput as Record<string, unknown>)['status']).toBe('active');
  });

  it('rejects invalid enum value', async () => {
    mockChat.mockResolvedValue(chatReturning('{"status":"deleted"}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'inactive'] } },
      },
    })).rejects.toThrow('not in enum');
  });
});

describe('schema validation — integer type', () => {
  it('accepts integers', async () => {
    mockChat.mockResolvedValue(chatReturning('{"count":42}'));
    const { run } = await import('../src/execution/runner.js');
    const result = await run({
      prompt: 'test',
      schema: { type: 'object', properties: { count: { type: 'integer' } } },
    });
    expect((result.parsedOutput as Record<string, unknown>)['count']).toBe(42);
  });

  it('rejects floats for integer type', async () => {
    mockChat.mockResolvedValue(chatReturning('{"count":3.14}'));
    const { run } = await import('../src/execution/runner.js');
    await expect(run({
      prompt: 'test',
      schema: { type: 'object', properties: { count: { type: 'integer' } } },
    })).rejects.toThrow('expected integer');
  });
});
