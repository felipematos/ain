import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import JSON5 from 'json5';
import { getTemplate, type ProviderTemplate } from '../cli/templates.js';
import type { ProviderConfig, ModelConfig } from '../config/types.js';

// ── Types ──────────────────────────────────────────────────────────

export interface OpenClawDetection {
  detected: boolean;
  configPath?: string;
  cliAvailable: boolean;
}

export interface OpenClawProvider {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  api?: string; // compatibility type, e.g. "anthropic-messages"
  models: string[];
}

export interface OpenClawImportResult {
  name: string;
  provider: ProviderConfig;
  template?: ProviderTemplate;
  models: ModelConfig[];
}

// ── Detection ──────────────────────────────────────────────────────

export function detectOpenClaw(): OpenClawDetection {
  // 1. Check for config file
  const ocHome = process.env['OPENCLAW_HOME'] || homedir();
  const stateDir = process.env['OPENCLAW_STATE_DIR'] || join(ocHome, '.openclaw');
  const configPath = process.env['OPENCLAW_CONFIG_PATH'] || join(stateDir, 'openclaw.json');
  const configExists = existsSync(configPath);

  // 2. Check for CLI
  let cliAvailable = false;
  try {
    execSync('openclaw --version', { stdio: 'ignore', timeout: 5000 });
    cliAvailable = true;
  } catch {
    // not available
  }

  // 3. Also consider OPENCLAW_SHELL as a runtime marker
  const inOpenClawShell = !!process.env['OPENCLAW_SHELL'];

  return {
    detected: configExists || cliAvailable || inOpenClawShell,
    configPath: configExists ? configPath : undefined,
    cliAvailable,
  };
}

// ── Config Reading ─────────────────────────────────────────────────

/**
 * Read OpenClaw providers. Tries CLI first (most accurate), falls back to file.
 */
export function readOpenClawProviders(detection: OpenClawDetection): OpenClawProvider[] {
  // Strategy 1: CLI
  if (detection.cliAvailable) {
    try {
      return readProvidersFromCli();
    } catch {
      // fall through to file
    }
  }

  // Strategy 2: Config file
  if (detection.configPath) {
    try {
      return readProvidersFromFile(detection.configPath);
    } catch {
      // fall through
    }
  }

  return [];
}

function readProvidersFromCli(): OpenClawProvider[] {
  const output = execSync('openclaw models list --all --json', {
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const data = JSON.parse(output);

  // Group models by provider (models use provider/model format)
  const providerMap = new Map<string, string[]>();
  const items: Array<{ id?: string; model?: string; provider?: string }> = Array.isArray(data) ? data : data.models ?? [];
  for (const item of items) {
    const modelId = item.id ?? item.model ?? '';
    const slashIdx = modelId.indexOf('/');
    let providerName: string;
    let modelName: string;
    if (slashIdx > 0) {
      providerName = modelId.slice(0, slashIdx);
      modelName = modelId;
    } else {
      providerName = item.provider ?? 'default';
      modelName = modelId;
    }
    if (!providerMap.has(providerName)) {
      providerMap.set(providerName, []);
    }
    providerMap.get(providerName)!.push(modelName);
  }

  return Array.from(providerMap.entries()).map(([name, models]) => ({
    name,
    models,
  }));
}

function readProvidersFromFile(configPath: string): OpenClawProvider[] {
  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON5.parse(raw);

  const providers: OpenClawProvider[] = [];
  const providerConfigs = config?.models?.providers ?? {};
  const modelCatalog = config?.agents?.defaults?.models ?? {};

  // Build model-to-provider mapping from catalog
  const providerModels = new Map<string, string[]>();
  for (const modelRef of Object.keys(modelCatalog)) {
    const slashIdx = modelRef.indexOf('/');
    if (slashIdx > 0) {
      const provName = modelRef.slice(0, slashIdx);
      if (!providerModels.has(provName)) {
        providerModels.set(provName, []);
      }
      providerModels.get(provName)!.push(modelRef);
    }
  }

  for (const [name, rawConfig] of Object.entries(providerConfigs)) {
    const pc = rawConfig as Record<string, unknown>;
    providers.push({
      name,
      apiKey: resolveOpenClawSecret(pc.apiKey),
      baseUrl: pc.baseUrl as string | undefined,
      api: pc.api as string | undefined,
      models: providerModels.get(name) ?? [],
    });
  }

  return providers;
}

/**
 * Translate OpenClaw secret formats to AIN's env: pattern.
 * OpenClaw uses ${VAR_NAME} or { source: "env", id: "VAR_NAME" }.
 */
function resolveOpenClawSecret(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    // ${VAR_NAME} → env:VAR_NAME
    const match = value.match(/^\$\{(.+)\}$/);
    if (match) return `env:${match[1]}`;
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.source === 'env' && typeof obj.id === 'string') {
      return `env:${obj.id}`;
    }
  }
  return undefined;
}

// ── Provider Mapping ───────────────────────────────────────────────

/** Well-known OpenClaw provider → AIN template mapping */
const OPENCLAW_TO_TEMPLATE: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  openrouter: 'openrouter',
  xai: 'xai',
  groq: 'groq',
  together: 'together',
  mistral: 'mistral',
  deepseek: 'deepseek',
  fireworks: 'fireworks',
  zhipu: 'zai',
  'google-gemini': 'custom',
  'google-vertex': 'custom',
};

/**
 * Convert an OpenClaw provider into an AIN-ready provider config.
 */
export function mapOpenClawProvider(oc: OpenClawProvider): OpenClawImportResult {
  const templateId = OPENCLAW_TO_TEMPLATE[oc.name];
  const template = templateId ? getTemplate(templateId) : undefined;

  let baseUrl: string;
  let apiKey: string | undefined;
  let models: ModelConfig[];

  if (template && templateId !== 'custom') {
    // Known provider — use template defaults, override with OpenClaw data
    baseUrl = oc.baseUrl || template.baseUrl;
    apiKey = oc.apiKey || (template.requiresApiKey ? `env:${template.apiKeyEnvVar}` : undefined);

    // Merge template default models with OpenClaw catalog models
    const templateModels = template.defaultModels ?? [];
    const templateIds = new Set(templateModels.map(m => m.id));
    models = [...templateModels];

    for (const modelRef of oc.models) {
      // Strip provider/ prefix for model ID (e.g. "openai/gpt-4o" → "gpt-4o")
      const slashIdx = modelRef.indexOf('/');
      const modelId = slashIdx > 0 ? modelRef.slice(slashIdx + 1) : modelRef;
      if (!templateIds.has(modelId) && !templateIds.has(modelRef)) {
        models.push({ id: modelId });
      }
    }
  } else {
    // Unknown provider — create custom OpenAI-compatible
    baseUrl = oc.baseUrl || 'http://localhost:8080/v1';
    apiKey = oc.apiKey;
    models = oc.models.map(ref => {
      const slashIdx = ref.indexOf('/');
      return { id: slashIdx > 0 ? ref.slice(slashIdx + 1) : ref };
    });
  }

  const provider: ProviderConfig = {
    kind: 'openai-compatible' as const,
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    timeoutMs: 60000,
    models,
  };

  return {
    name: templateId && templateId !== 'custom' ? templateId : oc.name,
    provider,
    template: template && templateId !== 'custom' ? template : undefined,
    models,
  };
}
