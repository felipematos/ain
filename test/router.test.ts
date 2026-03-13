import { describe, it, expect, vi } from 'vitest';

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

let mockPoliciesYaml: string | null = null;

// Mock fs: control whether policies.yaml exists and its content
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      if (String(path).includes('policies.yaml')) return mockPoliciesYaml !== null;
      return actual.existsSync(path);
    }),
    readFileSync: vi.fn((path: unknown, ...args: unknown[]) => {
      if (String(path).includes('policies.yaml') && mockPoliciesYaml !== null) {
        return mockPoliciesYaml;
      }
      return (actual.readFileSync as (...a: unknown[]) => unknown)(path, ...args);
    }),
  };
});

describe('route — policy with fallback chain', () => {
  it('parses fallback chain including slash-containing model names', async () => {
    mockPoliciesYaml = `
version: 1
defaultPolicy: test-policy
policies:
  test-policy:
    tiers:
      general: { provider: mac-mini, model: google/gemma }
    fallbackChain:
      - mac-mini/google/gemma
      - mac-mini/liquid/lfm2
`;
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Write a summary', policyName: 'test-policy' });
    expect(decision.fallbackChain).toHaveLength(2);
    expect(decision.fallbackChain![0]).toEqual({ provider: 'mac-mini', model: 'google/gemma' });
    expect(decision.fallbackChain![1]).toEqual({ provider: 'mac-mini', model: 'liquid/lfm2' });
    mockPoliciesYaml = null;
  });

  it('omits fallbackChain when not configured', async () => {
    mockPoliciesYaml = `
version: 1
defaultPolicy: simple
policies:
  simple:
    tiers:
      general: { provider: mac-mini, model: google/gemma }
`;
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Write a summary', policyName: 'simple' });
    expect(decision.fallbackChain).toBeUndefined();
    mockPoliciesYaml = null;
  });

  it('includes policy temperature and maxTokens in decision params', async () => {
    mockPoliciesYaml = `
version: 1
defaultPolicy: params-policy
policies:
  params-policy:
    tiers:
      general:
        provider: mac-mini
        model: google/gemma
        temperature: 0.2
        maxTokens: 512
`;
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Write a summary', policyName: 'params-policy' });
    expect(decision.params?.temperature).toBe(0.2);
    expect(decision.params?.maxTokens).toBe(512);
    mockPoliciesYaml = null;
  });

  it('returns undefined params when policy tier has no temperature/maxTokens', async () => {
    mockPoliciesYaml = `
version: 1
defaultPolicy: bare-policy
policies:
  bare-policy:
    tiers:
      general: { provider: mac-mini, model: google/gemma }
`;
    const { route } = await import('../src/routing/router.js');
    const decision = route({ prompt: 'Write a summary', policyName: 'bare-policy' });
    expect(decision.params?.temperature).toBeUndefined();
    expect(decision.params?.maxTokens).toBeUndefined();
    mockPoliciesYaml = null;
  });
});

describe('route — policy not found errors', () => {
  it('throws when named policy does not exist in policies file', async () => {
    mockPoliciesYaml = `
version: 1
defaultPolicy: real-policy
policies:
  real-policy:
    tiers:
      general: { provider: mac-mini, model: google/gemma }
`;
    const { route } = await import('../src/routing/router.js');
    expect(() => route({ prompt: 'Hi', policyName: 'nonexistent-policy' }))
      .toThrow('Policy "nonexistent-policy" not found');
    mockPoliciesYaml = null;
  });

  it('throws when named policy is requested but no policies file exists', async () => {
    mockPoliciesYaml = null; // no file
    const { route } = await import('../src/routing/router.js');
    expect(() => route({ prompt: 'Hi', policyName: 'some-policy' }))
      .toThrow('no policies file found');
  });
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
