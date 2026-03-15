import { describe, it, expect, vi } from 'vitest';

// Mock the runner
vi.mock('../src/execution/runner.js', () => ({
  run: vi.fn(),
}));

import { run } from '../src/execution/runner.js';
import { classifyWithLlm, classify } from '../src/routing/llm-classifier.js';
import type { LlmClassifierConfig } from '../src/routing/types.js';

const mockRun = vi.mocked(run);

const defaultConfig: LlmClassifierConfig = {
  enabled: true,
  provider: 'groq',
  model: 'llama-3.2-1b-instruct',
  timeoutMs: 2000,
};

describe('classifyWithLlm', () => {
  it('parses valid tier response', async () => {
    mockRun.mockResolvedValue({ output: 'coding\n', provider: 'groq', model: 'test' } as never);
    const result = await classifyWithLlm('Write a function', defaultConfig);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('coding');
    expect(result!.source).toBe('llm');
    expect(result!.confidence).toBe(0.9);
  });

  it('parses response with extra whitespace', async () => {
    mockRun.mockResolvedValue({ output: '  reasoning  ', provider: 'groq', model: 'test' } as never);
    const result = await classifyWithLlm('Solve this math problem', defaultConfig);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('reasoning');
  });

  it('parses ultra-fast response', async () => {
    mockRun.mockResolvedValue({ output: 'ultra-fast', provider: 'groq', model: 'test' } as never);
    const result = await classifyWithLlm('Is this spam?', defaultConfig);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('ultra-fast');
  });

  it('returns undefined for invalid response', async () => {
    mockRun.mockResolvedValue({ output: 'invalid-category', provider: 'groq', model: 'test' } as never);
    const result = await classifyWithLlm('Hello', defaultConfig);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty response', async () => {
    mockRun.mockResolvedValue({ output: '', provider: 'groq', model: 'test' } as never);
    const result = await classifyWithLlm('Hello', defaultConfig);
    expect(result).toBeUndefined();
  });

  it('returns undefined on error (graceful fallback)', async () => {
    mockRun.mockRejectedValue(new Error('timeout'));
    const result = await classifyWithLlm('Hello', defaultConfig);
    expect(result).toBeUndefined();
  });

  it('truncates long prompts to 500 chars', async () => {
    mockRun.mockResolvedValue({ output: 'general', provider: 'groq', model: 'test' } as never);
    const longPrompt = 'a'.repeat(1000);
    await classifyWithLlm(longPrompt, defaultConfig);
    const callArgs = mockRun.mock.calls[mockRun.mock.calls.length - 1]![0];
    // The prompt passed to run() should contain a truncated version
    expect(callArgs.prompt.length).toBeLessThan(1000);
  });
});

describe('classify', () => {
  it('uses LLM when enabled and returns valid result', async () => {
    mockRun.mockResolvedValue({ output: 'coding', provider: 'groq', model: 'test' } as never);
    const result = await classify('Write a function', { llmClassifier: defaultConfig });
    expect(result.source).toBe('llm');
    expect(result.tier).toBe('coding');
  });

  it('falls back to heuristic when LLM fails', async () => {
    mockRun.mockRejectedValue(new Error('network error'));
    const result = await classify('Debug this code', { llmClassifier: defaultConfig });
    expect(result.source).toBe('heuristic');
    expect(result.taskType).toBe('coding');
  });

  it('uses heuristic when LLM classifier is disabled', async () => {
    const result = await classify('Debug this code', {
      llmClassifier: { ...defaultConfig, enabled: false },
    });
    expect(result.source).toBe('heuristic');
  });

  it('uses heuristic when no routing config', async () => {
    const result = await classify('Summarize this article');
    expect(result.source).toBe('heuristic');
    expect(result.taskType).toBe('generation');
  });
});
