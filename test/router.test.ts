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

// Mock LLM classifier to avoid real API calls
vi.mock('../src/routing/llm-classifier.js', () => ({
  classify: vi.fn(async (prompt: string) => {
    // Delegate to heuristic classifier for tests
    const { classifyWithHeuristic } = await import('../src/routing/classifier.js');
    return classifyWithHeuristic(prompt);
  }),
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
    const decision = await route({ prompt: 'Write a summary', policyName: 'test-policy' });
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
    const decision = await route({ prompt: 'Write a summary', policyName: 'simple' });
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
    const decision = await route({ prompt: 'Write a summary', policyName: 'params-policy' });
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
    const decision = await route({ prompt: 'Write a summary', policyName: 'bare-policy' });
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
    await expect(route({ prompt: 'Hi', policyName: 'nonexistent-policy' }))
      .rejects.toThrow('Policy "nonexistent-policy" not found');
    mockPoliciesYaml = null;
  });

  it('throws when named policy is requested but no policies file exists', async () => {
    mockPoliciesYaml = null; // no file
    const { route } = await import('../src/routing/router.js');
    await expect(route({ prompt: 'Hi', policyName: 'some-policy' }))
      .rejects.toThrow('no policies file found');
  });
});

describe('route — heuristic routing', () => {
  it('routes short classification tasks to ultra-fast tier', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = await route({ prompt: 'Classify this email as spam or not' });
    expect(decision.tier).toBe('ultra-fast');
    expect(decision.provider).toBe('mac-mini');
  });

  it('routes reasoning tasks to reasoning model', async () => {
    const { route } = await import('../src/routing/router.js');
    // Needs 20+ words for medium complexity to map reasoning→reasoning tier
    const prompt = 'Analyze step by step why this approach to solving the optimization problem is inefficient and what alternative methods could yield better performance in terms of time and space complexity';
    const decision = await route({ prompt });
    expect(decision.tier).toBe('reasoning');
    expect(decision.model).toBe('qwen/qwen3');
  });

  it('routes short generation tasks to fast tier', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = await route({ prompt: 'Summarize this document' });
    expect(decision.tier).toBe('fast');
    expect(decision.model).toBe('liquid/lfm2');
  });

  it('includes rationale in decision', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = await route({ prompt: 'Hello' });
    expect(decision.rationale).toBeTruthy();
  });

  it('respects explicit tier override', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = await route({ prompt: 'Hello', tier: 'reasoning' });
    expect(decision.tier).toBe('reasoning');
    expect(decision.model).toBe('qwen/qwen3');
  });
});

describe('route — premium backward compatibility', () => {
  it('remaps premium tier to reasoning', async () => {
    const { route } = await import('../src/routing/router.js');
    const decision = await route({ prompt: 'Hello', tier: 'premium' as never });
    expect(decision.tier).toBe('reasoning');
    expect(decision.model).toBe('qwen/qwen3');
  });
});

describe('routeSync', () => {
  it('routes synchronously using heuristic classifier', async () => {
    const { routeSync } = await import('../src/routing/router.js');
    const decision = routeSync({ prompt: 'Classify this as spam' });
    expect(decision.tier).toBe('ultra-fast');
    expect(decision.provider).toBe('mac-mini');
  });

  it('remaps premium tier to reasoning in sync mode', async () => {
    const { routeSync } = await import('../src/routing/router.js');
    const decision = routeSync({ prompt: 'Hello', tier: 'premium' as never });
    expect(decision.tier).toBe('reasoning');
  });
});
