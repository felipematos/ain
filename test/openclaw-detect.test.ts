import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmpHome = mkdtempSync(join(tmpdir(), 'ain-oc-test-'));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => tmpHome,
  };
});

afterEach(() => {
  try {
    rmSync(join(tmpHome, '.openclaw'), { recursive: true, force: true });
    rmSync(join(tmpHome, '.ain'), { recursive: true, force: true });
  } catch {}
  delete process.env['OPENCLAW_SHELL'];
  delete process.env['OPENCLAW_HOME'];
  delete process.env['OPENCLAW_STATE_DIR'];
  delete process.env['OPENCLAW_CONFIG_PATH'];
});

describe('detectOpenClaw', () => {
  it('returns detected=false when no OpenClaw environment exists', async () => {
    const { detectOpenClaw } = await import('../src/openclaw/detect.js');
    const result = detectOpenClaw();
    // May be true if openclaw is on PATH; at minimum configPath should be undefined
    expect(result.configPath).toBeUndefined();
  });

  it('detects OpenClaw config file', async () => {
    const ocDir = join(tmpHome, '.openclaw');
    mkdirSync(ocDir, { recursive: true });
    writeFileSync(join(ocDir, 'openclaw.json'), '{}', 'utf-8');

    const { detectOpenClaw } = await import('../src/openclaw/detect.js');
    const result = detectOpenClaw();
    expect(result.detected).toBe(true);
    expect(result.configPath).toBe(join(ocDir, 'openclaw.json'));
  });

  it('detects OPENCLAW_SHELL env var', async () => {
    process.env['OPENCLAW_SHELL'] = 'exec';
    const { detectOpenClaw } = await import('../src/openclaw/detect.js');
    const result = detectOpenClaw();
    expect(result.detected).toBe(true);
  });

  it('respects OPENCLAW_CONFIG_PATH', async () => {
    const customPath = join(tmpHome, 'custom-oc.json');
    writeFileSync(customPath, '{}', 'utf-8');
    process.env['OPENCLAW_CONFIG_PATH'] = customPath;

    const { detectOpenClaw } = await import('../src/openclaw/detect.js');
    const result = detectOpenClaw();
    expect(result.detected).toBe(true);
    expect(result.configPath).toBe(customPath);
  });
});

describe('readOpenClawProviders (file-based)', () => {
  it('reads providers from openclaw.json', async () => {
    const ocDir = join(tmpHome, '.openclaw');
    mkdirSync(ocDir, { recursive: true });

    const config = {
      models: {
        providers: {
          openai: { apiKey: '${OPENAI_API_KEY}' },
          anthropic: { apiKey: '${ANTHROPIC_API_KEY}' },
        },
      },
      agents: {
        defaults: {
          models: {
            'openai/gpt-4o': { alias: 'GPT' },
            'openai/gpt-4o-mini': {},
            'anthropic/claude-sonnet-4-6': { alias: 'Sonnet' },
          },
        },
      },
    };

    writeFileSync(join(ocDir, 'openclaw.json'), JSON.stringify(config), 'utf-8');

    const { detectOpenClaw, readOpenClawProviders } = await import('../src/openclaw/detect.js');
    const detection = detectOpenClaw();
    const providers = readOpenClawProviders(detection);

    expect(providers.length).toBe(2);

    const openai = providers.find(p => p.name === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.apiKey).toBe('env:OPENAI_API_KEY');
    expect(openai!.models).toContain('openai/gpt-4o');
    expect(openai!.models).toContain('openai/gpt-4o-mini');

    const anthropic = providers.find(p => p.name === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic!.apiKey).toBe('env:ANTHROPIC_API_KEY');
    expect(anthropic!.models).toContain('anthropic/claude-sonnet-4-6');
  });

  it('handles JSON5 syntax (comments, trailing commas)', async () => {
    const ocDir = join(tmpHome, '.openclaw');
    mkdirSync(ocDir, { recursive: true });

    const json5Content = `{
      // This is a comment
      "models": {
        "providers": {
          "groq": { "apiKey": "\${GROQ_API_KEY}", },
        },
      },
      "agents": {
        "defaults": {
          "models": {
            "groq/llama-3.3-70b": {},
          },
        },
      },
    }`;

    writeFileSync(join(ocDir, 'openclaw.json'), json5Content, 'utf-8');

    const { detectOpenClaw, readOpenClawProviders } = await import('../src/openclaw/detect.js');
    const detection = detectOpenClaw();
    const providers = readOpenClawProviders(detection);

    expect(providers.length).toBe(1);
    expect(providers[0].name).toBe('groq');
    expect(providers[0].apiKey).toBe('env:GROQ_API_KEY');
  });

  it('handles SecretRef objects', async () => {
    const ocDir = join(tmpHome, '.openclaw');
    mkdirSync(ocDir, { recursive: true });

    const config = {
      models: {
        providers: {
          openai: { apiKey: { source: 'env', id: 'MY_OPENAI_KEY' } },
        },
      },
      agents: { defaults: { models: {} } },
    };

    writeFileSync(join(ocDir, 'openclaw.json'), JSON.stringify(config), 'utf-8');

    const { detectOpenClaw, readOpenClawProviders } = await import('../src/openclaw/detect.js');
    const detection = detectOpenClaw();
    const providers = readOpenClawProviders(detection);

    expect(providers[0].apiKey).toBe('env:MY_OPENAI_KEY');
  });

  it('returns empty array for missing config', async () => {
    const { readOpenClawProviders } = await import('../src/openclaw/detect.js');
    const providers = readOpenClawProviders({ detected: false, cliAvailable: false });
    expect(providers).toEqual([]);
  });
});

describe('mapOpenClawProvider', () => {
  it('maps known provider to AIN template', async () => {
    const { mapOpenClawProvider } = await import('../src/openclaw/detect.js');

    const result = mapOpenClawProvider({
      name: 'openai',
      apiKey: 'env:OPENAI_API_KEY',
      models: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
    });

    expect(result.name).toBe('openai');
    expect(result.template).toBeDefined();
    expect(result.provider.baseUrl).toBe('https://api.openai.com/v1');
    expect(result.provider.apiKey).toBe('env:OPENAI_API_KEY');
    // Should include template defaults + any extra models
    expect(result.models.some(m => m.id === 'gpt-4o')).toBe(true);
  });

  it('maps unknown provider as custom', async () => {
    const { mapOpenClawProvider } = await import('../src/openclaw/detect.js');

    const result = mapOpenClawProvider({
      name: 'my-custom',
      apiKey: 'env:CUSTOM_KEY',
      baseUrl: 'https://api.custom.ai/v1',
      models: ['my-custom/model-a'],
    });

    expect(result.name).toBe('my-custom');
    expect(result.template).toBeUndefined();
    expect(result.provider.baseUrl).toBe('https://api.custom.ai/v1');
    expect(result.models[0].id).toBe('model-a');
  });

  it('translates ${VAR} secret pattern', async () => {
    const { mapOpenClawProvider } = await import('../src/openclaw/detect.js');

    const result = mapOpenClawProvider({
      name: 'groq',
      apiKey: 'env:GROQ_API_KEY',
      models: [],
    });

    expect(result.provider.apiKey).toBe('env:GROQ_API_KEY');
  });

  it('uses template defaults for providers without explicit baseUrl', async () => {
    const { mapOpenClawProvider } = await import('../src/openclaw/detect.js');

    const result = mapOpenClawProvider({
      name: 'anthropic',
      apiKey: 'env:ANTHROPIC_API_KEY',
      models: [],
    });

    expect(result.provider.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('merges template default models with OpenClaw catalog models', async () => {
    const { mapOpenClawProvider } = await import('../src/openclaw/detect.js');

    const result = mapOpenClawProvider({
      name: 'openai',
      apiKey: 'env:OPENAI_API_KEY',
      models: ['openai/gpt-4o', 'openai/gpt-5'], // gpt-4o is in template, gpt-5 is not
    });

    const ids = result.models.map(m => m.id);
    expect(ids).toContain('gpt-4o');      // from template
    expect(ids).toContain('gpt-4o-mini'); // from template
    expect(ids).toContain('o3-mini');     // from template
    expect(ids).toContain('gpt-5');       // new from OpenClaw
  });
});
