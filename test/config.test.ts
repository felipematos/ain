import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// We'll test config logic directly by manipulating the underlying functions
// using a temporary directory

describe('AinConfig schema', () => {
  it('parses a minimal config', async () => {
    const { AinConfigSchema } = await import('../src/config/types.js');
    const config = AinConfigSchema.parse({ version: 1 });
    expect(config.version).toBe(1);
    expect(config.providers).toEqual({});
    expect(config.defaults).toEqual({});
  });

  it('parses a full provider config', async () => {
    const { AinConfigSchema } = await import('../src/config/types.js');
    const config = AinConfigSchema.parse({
      version: 1,
      providers: {
        'mac-mini': {
          kind: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1',
          apiKey: 'env:TEST_KEY',
          models: [{ id: 'qwen/qwen2', alias: 'qwen', tags: ['local'] }],
        },
      },
      defaults: { provider: 'mac-mini', model: 'qwen/qwen2' },
    });
    expect(config.providers['mac-mini']?.kind).toBe('openai-compatible');
    expect(config.providers['mac-mini']?.models?.[0]?.alias).toBe('qwen');
    expect(config.defaults.provider).toBe('mac-mini');
  });

  it('parses defaults with temperature and maxTokens', async () => {
    const { AinConfigSchema } = await import('../src/config/types.js');
    const config = AinConfigSchema.parse({
      version: 1,
      defaults: { provider: 'mac-mini', temperature: 0.3, maxTokens: 512 },
    });
    expect(config.defaults.temperature).toBe(0.3);
    expect(config.defaults.maxTokens).toBe(512);
  });

  it('rejects invalid config version', async () => {
    const { AinConfigSchema } = await import('../src/config/types.js');
    expect(() => AinConfigSchema.parse({ version: 2 })).toThrow();
  });

  it('rejects invalid base URL', async () => {
    const { AinConfigSchema } = await import('../src/config/types.js');
    expect(() =>
      AinConfigSchema.parse({
        version: 1,
        providers: { bad: { kind: 'openai-compatible', baseUrl: 'not-a-url' } },
      })
    ).toThrow();
  });
});

describe('resolveApiKey', () => {
  it('returns literal key as-is', async () => {
    const { resolveApiKey } = await import('../src/config/loader.js');
    expect(resolveApiKey('sk-abc123')).toBe('sk-abc123');
  });

  it('resolves env: prefix from environment', async () => {
    const { resolveApiKey } = await import('../src/config/loader.js');
    process.env['TEST_AIN_KEY'] = 'resolved-key';
    expect(resolveApiKey('env:TEST_AIN_KEY')).toBe('resolved-key');
    delete process.env['TEST_AIN_KEY'];
  });

  it('returns undefined for unset env var', async () => {
    const { resolveApiKey } = await import('../src/config/loader.js');
    delete process.env['UNSET_VAR'];
    expect(resolveApiKey('env:UNSET_VAR')).toBeUndefined();
  });

  it('returns undefined for undefined input', async () => {
    const { resolveApiKey } = await import('../src/config/loader.js');
    expect(resolveApiKey(undefined)).toBeUndefined();
  });
});
