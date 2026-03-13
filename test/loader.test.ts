import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

// Override homedir to use temp directory for tests
const tmpHome = mkdtempSync(join(tmpdir(), 'ain-test-'));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => tmpHome,
  };
});

afterEach(() => {
  // Clean up temp home after each test
  try {
    rmSync(join(tmpHome, '.ain'), { recursive: true, force: true });
  } catch {}
});

describe('initConfig + loadConfig', () => {
  it('creates config file and loads it back', async () => {
    const { initConfig, loadConfig, configExists } = await import('../src/config/loader.js');
    expect(configExists()).toBe(false);
    initConfig();
    expect(configExists()).toBe(true);
    const config = loadConfig();
    expect(config.version).toBe(1);
    expect(config.providers).toEqual({});
  });
});

describe('addProvider + removeProvider', () => {
  it('adds and removes a provider', async () => {
    const { initConfig, addProvider, removeProvider, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    addProvider('test', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [],
    });
    let config = loadConfig();
    expect(config.providers['test']).toBeDefined();

    removeProvider('test');
    config = loadConfig();
    expect(config.providers['test']).toBeUndefined();
  });

  it('throws when removing non-existent provider', async () => {
    const { initConfig, removeProvider } = await import('../src/config/loader.js');
    initConfig();
    expect(() => removeProvider('ghost')).toThrow('Provider "ghost" not found');
  });
});

describe('resolveModel alias resolution', () => {
  it('resolves model alias to ID', async () => {
    const { initConfig, addProvider, resolveModel } = await import('../src/config/loader.js');
    initConfig();
    addProvider('mac-mini', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [
        { id: 'qwen3.5-4b-mlx', alias: 'qwen-reason' },
        { id: 'liquid/lfm2.5-1.2b', alias: 'liquid-fast' },
      ],
    });

    expect(resolveModel('qwen-reason', 'mac-mini')).toBe('qwen3.5-4b-mlx');
    expect(resolveModel('liquid-fast', 'mac-mini')).toBe('liquid/lfm2.5-1.2b');
  });

  it('falls through to literal ID if no alias matches', async () => {
    const { initConfig, addProvider, resolveModel } = await import('../src/config/loader.js');
    initConfig();
    addProvider('provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [{ id: 'some-model', alias: 'sm' }],
    });
    expect(resolveModel('gpt-4', 'provider')).toBe('gpt-4');
  });

  it('returns first model from list when no alias and no defaults.model', async () => {
    const { initConfig, addProvider, resolveModel } = await import('../src/config/loader.js');
    initConfig();
    addProvider('provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [{ id: 'first-model' }, { id: 'second-model' }],
    });
    expect(resolveModel(undefined, 'provider')).toBe('first-model');
  });

  it('prefers defaults.model over first model in list', async () => {
    const { initConfig, addProvider, saveConfig, loadConfig, resolveModel } = await import('../src/config/loader.js');
    initConfig();
    addProvider('provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [{ id: 'first-model' }, { id: 'second-model' }],
    });
    const config = loadConfig();
    config.defaults = { model: 'second-model' };
    saveConfig(config);
    expect(resolveModel(undefined, 'provider')).toBe('second-model');
  });

  it('resolves defaults.model as alias within provider', async () => {
    const { initConfig, addProvider, saveConfig, loadConfig, resolveModel } = await import('../src/config/loader.js');
    initConfig();
    addProvider('provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [{ id: 'actual-model-id', alias: 'my-alias' }],
    });
    const config = loadConfig();
    config.defaults = { model: 'my-alias' };
    saveConfig(config);
    expect(resolveModel(undefined, 'provider')).toBe('actual-model-id');
  });
});

describe('resolveProvider', () => {
  it('resolves default provider', async () => {
    const { initConfig, addProvider, saveConfig, loadConfig, resolveProvider } = await import('../src/config/loader.js');
    initConfig();
    addProvider('mac-mini', {
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 60000,
      models: [],
    });
    const config = loadConfig();
    config.defaults = { provider: 'mac-mini' };
    saveConfig(config);

    const { name, provider } = resolveProvider();
    expect(name).toBe('mac-mini');
    expect(provider.baseUrl).toBe('http://localhost:1234/v1');
  });

  it('throws when no default provider set', async () => {
    const { initConfig, resolveProvider } = await import('../src/config/loader.js');
    initConfig();
    expect(() => resolveProvider()).toThrow('No provider specified');
  });
});
