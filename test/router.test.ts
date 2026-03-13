import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config loader
vi.mock('../src/config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    version: 1,
    providers: {
      'mac-mini': {
        kind: 'openai-compatible',
        baseUrl: 'http://localhost:1234/v1',
        timeoutMs: 60000,
        models: [
          { id: 'liquid/lfm2', alias: 'liquid-fast', tags: ['fast', 'local'] },
          { id: 'google/gemma', alias: 'gemma-general', tags: ['general', 'local'] },
          { id: 'qwen/qwen3', alias: 'qwen-reason', tags: ['reasoning', 'local'] },
        ],
      },
    },
    defaults: { provider: 'mac-mini', model: 'google/gemma' },
  })),
  getConfigDir: vi.fn(() => '/tmp/ain-test'),
}));

// Mock policies (no policy file)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      if (String(path).includes('policies.yaml')) return false;
      return actual.existsSync(path);
    }),
  };
});

describe('route', () => {
  it('routes fast tasks to fast model', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Classify this email as spam or not' });
    expect(decision.tier).toBe('fast');
    expect(decision.model).toBe('liquid/lfm2');
    expect(decision.provider).toBe('mac-mini');
  });

  it('routes reasoning tasks to reasoning model', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Analyze why this algorithm is inefficient step by step' });
    expect(decision.tier).toBe('reasoning');
    expect(decision.model).toBe('qwen/qwen3');
  });

  it('routes generation tasks to general model', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Write a summary of this document' });
    expect(decision.tier).toBe('general');
    expect(decision.model).toBe('google/gemma');
  });

  it('includes rationale in decision', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Hello' });
    expect(decision.rationale).toBeTruthy();
  });

  it('respects explicit tier override', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Hello', tier: 'reasoning' });
    expect(decision.tier).toBe('reasoning');
    expect(decision.model).toBe('qwen/qwen3');
  });
});
