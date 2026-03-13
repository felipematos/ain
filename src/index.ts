// AIN Library exports
export {
  loadConfig,
  saveConfig,
  initConfig,
  getConfigPath,
  addProvider,
  removeProvider,
  getProvider,
  resolveProvider,
  resolveModel,
} from './config/loader.js';
export { run, stream, stripMarkdownFences, cleanModelOutput } from './execution/runner.js';
export { createAdapter } from './providers/openai-compatible.js';
export { route, simulateRoute, loadPolicies } from './routing/router.js';
export { classifyTask, estimateComplexity } from './routing/classifier.js';
export { runDoctorChecks } from './doctor/checks.js';
export { withRetry, isTransientError } from './shared/retry.js';
export type { AinConfig, ProviderConfig, ModelConfig } from './config/types.js';
export type { RunOptions, RunResult } from './execution/runner.js';
export type { RoutingRequest, RoutingDecision, ModelTier, TaskType, RoutingPolicy, PolicyFile } from './routing/types.js';

import { loadConfig } from './config/loader.js';
/** List all configured provider names */
export function listProviders(): string[] {
  return Object.keys(loadConfig().providers);
}
