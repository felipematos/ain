// AIN Library exports
export {
  loadConfig,
  loadUserConfig,
  saveConfig,
  initConfig,
  getConfigPath,
  getConfigDir,
  configExists,
  addProvider,
  removeProvider,
  getProvider,
  resolveProvider,
  resolveModel,
  resolveApiKey,
  mergeModels,
  PROJECT_CONFIG_FILENAME,
} from './config/loader.js';
export { run, stream, stripMarkdownFences, cleanModelOutput, parseBooleanOutput } from './execution/runner.js';
export { createAdapter } from './providers/openai-compatible.js';
export { route, routeSync, simulateRoute, loadPolicies } from './routing/router.js';
export { classifyTask, estimateComplexity, selectTierFromTask, classifyWithHeuristic } from './routing/classifier.js';
export { MODEL_CATALOG, CATALOG_VERSION, findCatalogModel, matchCatalogModel, getCatalogModelsByTier, getModelTiers } from './routing/model-catalog.js';
export { classify, classifyWithLlm } from './routing/llm-classifier.js';
export { runDoctorChecks } from './doctor/checks.js';
export { withRetry, isTransientError } from './shared/retry.js';
export type { AinConfig, ProviderConfig, ModelConfig, DefaultsConfig } from './config/types.js';
export type { RunOptions, RunResult } from './execution/runner.js';
export type { RoutingRequest, RoutingDecision, ModelTier, TaskType, RoutingPolicy, TierConfig, PolicyFile, CatalogModel, ClassificationResult, RoutingConfig, LlmClassifierConfig } from './routing/types.js';
export type { CheckResult } from './doctor/checks.js';

import { loadConfig } from './config/loader.js';
/** List all configured provider names */
export function listProviders(): string[] {
  return Object.keys(loadConfig().providers);
}
