import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AinConfig, ProviderConfig } from './types.js';
import { AinConfigSchema } from './types.js';

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
  if (!existsSync(configPath)) {
    return AinConfigSchema.parse({ version: 1 });
  }
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  return AinConfigSchema.parse(parsed);
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
  if (modelAlias) return modelAlias;
  const config = loadConfig();
  // Try provider's default model from models list first
  if (providerName && config.providers[providerName]?.models?.length) {
    return config.providers[providerName].models![0].id;
  }
  return config.defaults?.model;
}
