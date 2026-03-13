import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AinConfig, ProviderConfig } from './types.js';
import { AinConfigSchema } from './types.js';

export const PROJECT_CONFIG_FILENAME = 'ain.yaml';

export function getConfigDir(): string {
  return join(homedir(), '.ain');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.yaml');
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

export function loadConfig(): AinConfig {
  const configPath = getConfigPath();
  const base: AinConfig = existsSync(configPath)
    ? AinConfigSchema.parse(parseYaml(readFileSync(configPath, 'utf-8')))
    : AinConfigSchema.parse({ version: 1 });

  // Apply project-level overlay from ./ain.yaml if present
  const projectPath = join(process.cwd(), PROJECT_CONFIG_FILENAME);
  if (existsSync(projectPath)) {
    const overlay = AinConfigSchema.parse(parseYaml(readFileSync(projectPath, 'utf-8')));
    return {
      ...base,
      providers: { ...base.providers, ...overlay.providers },
      defaults: { ...base.defaults, ...overlay.defaults },
    };
  }

  return base;
}

export function saveConfig(config: AinConfig): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(getConfigPath(), stringifyYaml(config), 'utf-8');
}

export function initConfig(): AinConfig {
  const config: AinConfig = {
    version: 1,
    providers: {},
    defaults: {},
  };
  saveConfig(config);
  return config;
}

/**
 * Merge a list of server-returned model IDs with the existing configured models.
 * - Models already in config: their metadata (alias, tags, etc.) is preserved.
 * - New models from server: added as bare { id } entries.
 * - Models in config but not on server: kept (may be offline or manually added).
 */
export function mergeModels(
  existing: Array<{ id: string; [key: string]: unknown }>,
  serverIds: string[],
): Array<{ id: string; [key: string]: unknown }> {
  const existingById = new Map(existing.map((m) => [m.id, m]));
  const serverIdSet = new Set(serverIds);
  const merged = serverIds.map((id) => existingById.get(id) ?? { id });
  for (const e of existing) {
    if (!serverIdSet.has(e.id)) merged.push(e);
  }
  return merged;
}

export function resolveApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.startsWith('env:')) {
    const varName = apiKey.slice(4);
    return process.env[varName];
  }
  return apiKey;
}

export function addProvider(name: string, provider: ProviderConfig): void {
  const config = loadConfig();
  config.providers[name] = provider;
  saveConfig(config);
}

export function removeProvider(name: string): void {
  const config = loadConfig();
  if (!config.providers[name]) {
    throw new Error(`Provider "${name}" not found`);
  }
  delete config.providers[name];
  saveConfig(config);
}

export function getProvider(name: string): ProviderConfig {
  const config = loadConfig();
  const provider = config.providers[name];
  if (!provider) {
    throw new Error(`Provider "${name}" not found`);
  }
  return provider;
}

export function resolveProvider(providerName?: string): { name: string; provider: ProviderConfig } {
  const config = loadConfig();
  const name = providerName || config.defaults?.provider;
  if (!name) {
    throw new Error('No provider specified and no default provider configured. Run: ain providers add');
  }
  const provider = config.providers[name];
  if (!provider) {
    throw new Error(`Provider "${name}" not found. Run: ain providers list`);
  }
  return { name, provider };
}

export function resolveModel(modelAlias?: string, providerName?: string): string | undefined {
  const config = loadConfig();

  if (modelAlias) {
    // Try to resolve as alias within the provider first
    if (providerName) {
      const models = config.providers[providerName]?.models ?? [];
      const byAlias = models.find((m) => m.alias === modelAlias);
      if (byAlias) return byAlias.id;
    }
    // Fall back to treating as literal model ID
    return modelAlias;
  }

  // No explicit model: check defaults.model first (may itself be an alias)
  const defaultModel = config.defaults?.model;
  if (defaultModel) {
    if (providerName) {
      const models = config.providers[providerName]?.models ?? [];
      const byAlias = models.find((m) => m.alias === defaultModel);
      if (byAlias) return byAlias.id;
    }
    return defaultModel;
  }

  // Last resort: first model in provider's list
  if (providerName) {
    const first = config.providers[providerName]?.models?.[0];
    if (first) return first.id;
  }

  return undefined;
}
