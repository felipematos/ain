import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
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

describe('mergeModels', () => {
  it('adds new server models as bare {id}', async () => {
    const { mergeModels } = await import('../src/config/loader.js');
    const result = mergeModels([], ['model-a', 'model-b']);
    expect(result).toEqual([{ id: 'model-a' }, { id: 'model-b' }]);
  });

  it('preserves existing metadata for known models', async () => {
    const { mergeModels } = await import('../src/config/loader.js');
    const existing = [{ id: 'model-a', alias: 'fast', tags: ['local'] }];
    const result = mergeModels(existing, ['model-a', 'model-b']);
    expect(result[0]).toEqual({ id: 'model-a', alias: 'fast', tags: ['local'] });
    expect(result[1]).toEqual({ id: 'model-b' });
  });

  it('keeps manually-added models not on server', async () => {
    const { mergeModels } = await import('../src/config/loader.js');
    const existing = [{ id: 'offline-model', alias: 'my-model' }];
    const result = mergeModels(existing, ['server-model']);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.id === 'offline-model')).toEqual({ id: 'offline-model', alias: 'my-model' });
  });

  it('removes nothing — stale server models are preserved', async () => {
    const { mergeModels } = await import('../src/config/loader.js');
    const existing = [{ id: 'old-model' }, { id: 'still-there' }];
    const result = mergeModels(existing, ['still-there']);
    expect(result.find((m) => m.id === 'old-model')).toBeDefined();
  });
});

describe('defaults — temperature and maxTokens', () => {
  it('persists temperature and maxTokens via saveConfig', async () => {
    const { initConfig, saveConfig, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    const cfg = loadConfig();
    cfg.defaults = { ...cfg.defaults, temperature: 0.5, maxTokens: 1024 };
    saveConfig(cfg);

    const reloaded = loadConfig();
    expect(reloaded.defaults.temperature).toBe(0.5);
    expect(reloaded.defaults.maxTokens).toBe(1024);
  });

  it('temperature and maxTokens default to undefined', async () => {
    const { initConfig, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    const cfg = loadConfig();
    expect(cfg.defaults.temperature).toBeUndefined();
    expect(cfg.defaults.maxTokens).toBeUndefined();
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

describe('project config overlay (./ain.yaml)', () => {
  const projectConfig = join(process.cwd(), 'ain.yaml');

  afterEach(() => {
    try { rmSync(projectConfig); } catch {}
  });

  it('merges project providers over user config', async () => {
    const { initConfig, addProvider, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    addProvider('user-provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://user.host/v1',
      timeoutMs: 60000,
      models: [],
    });

    // Write project overlay
    writeFileSync(projectConfig, [
      'version: 1',
      'providers:',
      '  project-provider:',
      '    kind: openai-compatible',
      '    baseUrl: http://project.host/v1',
    ].join('\n'), 'utf-8');

    const config = loadConfig();
    expect(config.providers['user-provider']).toBeDefined();
    expect(config.providers['project-provider']).toBeDefined();
    expect(config.providers['project-provider']!.baseUrl).toBe('http://project.host/v1');
  });

  it('project defaults override user defaults', async () => {
    const { initConfig, saveConfig, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    const cfg = loadConfig();
    cfg.defaults = { temperature: 0.5, model: 'user-model' };
    saveConfig(cfg);

    writeFileSync(projectConfig, [
      'version: 1',
      'defaults:',
      '  model: project-model',
      '  temperature: 0.1',
    ].join('\n'), 'utf-8');

    const merged = loadConfig();
    expect(merged.defaults.model).toBe('project-model');
    expect(merged.defaults.temperature).toBe(0.1);
  });

  it('user config is unchanged when no project overlay exists', async () => {
    const { initConfig, addProvider, loadConfig } = await import('../src/config/loader.js');
    initConfig();
    addProvider('only-provider', {
      kind: 'openai-compatible',
      baseUrl: 'http://only.host/v1',
      timeoutMs: 60000,
      models: [],
    });

    const config = loadConfig();
    expect(Object.keys(config.providers)).toEqual(['only-provider']);
  });

  it('addProvider does not write overlay providers back to user config', async () => {
    const { initConfig, addProvider, loadUserConfig } = await import('../src/config/loader.js');
    initConfig();

    // Project overlay with a provider
    writeFileSync(projectConfig, [
      'version: 1',
      'providers:',
      '  overlay-only:',
      '    kind: openai-compatible',
      '    baseUrl: http://overlay.host/v1',
    ].join('\n'), 'utf-8');

    // Add a new provider — this should NOT persist overlay-only to user config
    addProvider('user-added', {
      kind: 'openai-compatible',
      baseUrl: 'http://user.host/v1',
      timeoutMs: 60000,
      models: [],
    });

    const userConfig = loadUserConfig();
    expect(userConfig.providers['user-added']).toBeDefined();
    expect(userConfig.providers['overlay-only']).toBeUndefined();
  });
});
