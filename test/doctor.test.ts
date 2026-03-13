import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHealthCheck = vi.fn();

vi.mock('../src/config/loader.js', () => ({
  configExists: vi.fn(),
  getConfigPath: vi.fn(() => '/home/user/.ain/config.yaml'),
  loadConfig: vi.fn(),
  resolveApiKey: vi.fn((key?: string) => {
    if (!key) return undefined;
    if (key.startsWith('env:')) return process.env[key.slice(4)];
    return key;
  }),
  PROJECT_CONFIG_FILENAME: 'ain.yaml',
}));

vi.mock('../src/providers/openai-compatible.js', () => ({
  createAdapter: vi.fn(() => ({ healthCheck: mockHealthCheck })),
}));

const { configExists, loadConfig } = await import('../src/config/loader.js');
const configExistsMock = vi.mocked(configExists);
const loadConfigMock = vi.mocked(loadConfig);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runDoctorChecks', () => {
  it('reports missing config file', async () => {
    configExistsMock.mockReturnValue(false);
    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks();
    expect(results.find((r) => r.name === 'config-exists')?.ok).toBe(false);
    expect(results.length).toBe(1);
  });

  it('reports valid config', async () => {
    configExistsMock.mockReturnValue(true);
    loadConfigMock.mockReturnValue({
      version: 1,
      providers: {},
      defaults: {},
    });
    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks();
    expect(results.find((r) => r.name === 'config-exists')?.ok).toBe(true);
    expect(results.find((r) => r.name === 'config-valid')?.ok).toBe(true);
    expect(results.find((r) => r.name === 'providers')?.ok).toBe(false); // no providers
  });

  it('reports endpoint reachable', async () => {
    configExistsMock.mockReturnValue(true);
    loadConfigMock.mockReturnValue({
      version: 1,
      providers: {
        'test-provider': {
          kind: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1',
          timeoutMs: 60000,
          models: [],
        },
      },
      defaults: { provider: 'test-provider' },
    });
    mockHealthCheck.mockResolvedValue({ ok: true, latencyMs: 50 });

    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks();
    const endpointResult = results.find((r) => r.name === 'provider:test-provider:endpoint');
    expect(endpointResult?.ok).toBe(true);
    expect(endpointResult?.message).toContain('50ms');
  });

  it('reports endpoint unreachable', async () => {
    configExistsMock.mockReturnValue(true);
    loadConfigMock.mockReturnValue({
      version: 1,
      providers: {
        'bad-provider': {
          kind: 'openai-compatible',
          baseUrl: 'http://localhost:9999/v1',
          timeoutMs: 60000,
          models: [],
        },
      },
      defaults: {},
    });
    mockHealthCheck.mockResolvedValue({ ok: false, error: 'Connection refused' });

    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks();
    const endpointResult = results.find((r) => r.name === 'provider:bad-provider:endpoint');
    expect(endpointResult?.ok).toBe(false);
    expect(endpointResult?.detail).toBe('Connection refused');
  });

  it('reports auth failure when env var not set', async () => {
    configExistsMock.mockReturnValue(true);
    loadConfigMock.mockReturnValue({
      version: 1,
      providers: {
        'secret-provider': {
          kind: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1',
          apiKey: 'env:MISSING_API_KEY_XYZ',
          timeoutMs: 60000,
          models: [],
        },
      },
      defaults: {},
    });
    delete process.env['MISSING_API_KEY_XYZ'];

    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks();
    const authResult = results.find((r) => r.name === 'provider:secret-provider:auth');
    expect(authResult?.ok).toBe(false);
    expect(authResult?.detail).toContain('MISSING_API_KEY_XYZ');
  });

  it('filters by provider name', async () => {
    configExistsMock.mockReturnValue(true);
    loadConfigMock.mockReturnValue({
      version: 1,
      providers: {
        'p1': { kind: 'openai-compatible', baseUrl: 'http://localhost:1/v1', timeoutMs: 60000, models: [] },
        'p2': { kind: 'openai-compatible', baseUrl: 'http://localhost:2/v1', timeoutMs: 60000, models: [] },
      },
      defaults: {},
    });
    mockHealthCheck.mockResolvedValue({ ok: true, latencyMs: 10 });

    const { runDoctorChecks } = await import('../src/doctor/checks.js');
    const results = await runDoctorChecks('p1');
    expect(results.some((r) => r.name.includes('p2'))).toBe(false);
    expect(results.some((r) => r.name.includes('p1'))).toBe(true);
  });
});
