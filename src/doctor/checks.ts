import { loadConfig, getConfigPath, configExists, resolveApiKey } from '../config/loader.js';
import { createAdapter } from '../providers/openai-compatible.js';
import { withRetry } from '../shared/retry.js';

export interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
}

export async function runDoctorChecks(providerFilter?: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check 1: Config file exists
  if (!configExists()) {
    results.push({
      name: 'config-exists',
      ok: false,
      message: 'Config file not found',
      detail: `Expected at: ${getConfigPath()}. Run: ain config init`,
    });
    return results;
  }
  results.push({ name: 'config-exists', ok: true, message: `Config found at ${getConfigPath()}` });

  // Check 2: Config is valid
  let config;
  try {
    config = loadConfig();
    results.push({ name: 'config-valid', ok: true, message: 'Config is valid YAML' });
  } catch (err) {
    results.push({
      name: 'config-valid',
      ok: false,
      message: 'Config is invalid',
      detail: err instanceof Error ? err.message : String(err),
    });
    return results;
  }

  // Check 3: Providers
  const providerNames = Object.keys(config.providers);
  if (providerNames.length === 0) {
    results.push({ name: 'providers', ok: false, message: 'No providers configured. Run: ain providers add' });
  } else {
    results.push({ name: 'providers', ok: true, message: `${providerNames.length} provider(s) configured` });
  }

  // Check 4: Per-provider checks
  const toCheck = providerFilter ? [providerFilter] : providerNames;
  for (const name of toCheck) {
    const provider = config.providers[name];
    if (!provider) {
      results.push({ name: `provider:${name}`, ok: false, message: `Provider "${name}" not found` });
      continue;
    }

    // Auth key resolution
    if (provider.apiKey) {
      const key = resolveApiKey(provider.apiKey);
      if (!key) {
        const envVar = provider.apiKey.startsWith('env:') ? provider.apiKey.slice(4) : null;
        results.push({
          name: `provider:${name}:auth`,
          ok: false,
          message: `API key not resolved`,
          detail: envVar ? `Environment variable ${envVar} is not set` : 'API key is empty',
        });
      } else {
        results.push({ name: `provider:${name}:auth`, ok: true, message: `Auth key resolved` });
      }
    } else {
      results.push({ name: `provider:${name}:auth`, ok: true, message: `No auth required` });
    }

    // Endpoint reachability
    const adapter = createAdapter(provider);
    const health = await withRetry(() => adapter.healthCheck(), { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 2000, backoffFactor: 2 })
      .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (health.ok) {
      results.push({
        name: `provider:${name}:endpoint`,
        ok: true,
        message: `Endpoint reachable (${health.latencyMs}ms)`,
        detail: provider.baseUrl,
      });
    } else {
      results.push({
        name: `provider:${name}:endpoint`,
        ok: false,
        message: `Endpoint unreachable`,
        detail: health.error,
      });
    }
  }

  return results;
}

const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];

export function renderDoctorResults(results: CheckResult[]): void {
  const allOk = results.every((r) => r.ok);

  for (const result of results) {
    const icon = result.ok ? '✓' : '✗';
    const status = useColor ? (result.ok ? '\x1b[32m' : '\x1b[31m') : '';
    const reset = useColor ? '\x1b[0m' : '';
    process.stdout.write(`${status}${icon}${reset} ${result.name}: ${result.message}\n`);
    if (result.detail) {
      process.stdout.write(`  ${result.detail}\n`);
    }
  }

  process.stdout.write('\n');
  if (allOk) {
    const green = useColor ? '\x1b[32m' : '';
    const reset = useColor ? '\x1b[0m' : '';
    process.stdout.write(`${green}All checks passed.${reset}\n`);
  } else {
    const red = useColor ? '\x1b[31m' : '';
    const reset = useColor ? '\x1b[0m' : '';
    const failed = results.filter((r) => !r.ok).length;
    process.stderr.write(`${red}${failed} check(s) failed.${reset}\n`);
  }
}
