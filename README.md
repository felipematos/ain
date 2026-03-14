# AIN — AI Node

**Scriptable CLI and library for running LLM tasks with predictable, shell-safe behavior.**

AIN is provider-agnostic and designed for terminal use, shell scripts, CI pipelines, and workflow automation. It works with any OpenAI-compatible API: LM Studio, Ollama, OpenAI, vLLM, and more.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@felipematos/ain-cli.svg)](https://www.npmjs.com/package/@felipematos/ain-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
  - [ain ask](#ain-ask)
  - [ain run](#ain-run)
  - [ain providers](#ain-providers)
  - [ain models](#ain-models)
  - [ain doctor](#ain-doctor)
  - [ain routing](#ain-routing)
  - [ain config](#ain-config)
- [Configuration](#configuration)
  - [User Config](#user-config)
  - [Project Config Overlay](#project-config-overlay)
  - [Secret Management](#secret-management)
  - [Config Precedence](#config-precedence)
- [Routing & Policies](#routing--policies)
  - [Intelligent Routing](#intelligent-routing)
  - [Policy Files](#policy-files)
  - [Task Classification](#task-classification)
  - [Fallback Chains](#fallback-chains)
- [Output Modes](#output-modes)
- [Library API](#library-api)
  - [run()](#run)
  - [stream()](#stream)
  - [route()](#route)
  - [Configuration Functions](#configuration-functions)
  - [Utility Functions](#utility-functions)
- [TypeScript Types](#typescript-types)
- [Docker](#docker)
- [Architecture](#architecture)
- [Development](#development)
- [Exit Codes](#exit-codes)
- [License](#license)

---

## Features

- **Provider-agnostic** — works with any OpenAI-compatible API endpoint
- **Shell-safe** — clean stdout, diagnostics to stderr, proper exit codes
- **Structured output** — JSON, JSONL, JSON Schema validation, field extraction
- **Streaming** — progressive token output with think-block filtering
- **Intelligent routing** — automatic model selection by task type and policy
- **Fallback chains** — automatic retry on alternate models when a provider fails
- **Retry with backoff** — configurable retry logic for transient failures
- **Project overlays** — per-project `ain.yaml` overrides checked into repos
- **Dual-use** — works as a CLI tool and as a Node.js library
- **Zero runtime bloat** — only 3 production dependencies (commander, yaml, zod)

---

## Installation

### npm (recommended)

```bash
npm install -g @felipematos/ain-cli
```

### From source

```bash
git clone https://github.com/felipematos/ain.git
cd ain
npm install
npm run build
npm link
```

### Docker

```bash
docker build -t ain .
docker run --rm ain ask "Hello, world"
```

### Verify installation

```bash
ain --version
ain doctor
```

---

## Quick Start

```bash
# 1. Initialize configuration
ain config init

# 2. Add a provider (LM Studio, Ollama, OpenAI, etc.)
ain providers add local --base-url http://localhost:1234/v1 --set-default

# 3. Refresh model catalog
ain models refresh

# 4. Ask a question
ain ask "What is the capital of Brazil?"

# 5. Stream a response
ain ask "Explain quantum entanglement briefly" --stream

# 6. Get structured JSON output
ain run --prompt "Get info about France" --json

# 7. Schema-validated output
ain run --prompt "Extract company info" --schema company.schema.json

# 8. Extract a single field
ain run --prompt "Return facts about Japan" --schema facts.json --field capital

# 9. Use intelligent routing (picks the best model for the task)
ain ask "Classify this email as spam or not" --route
```

---

## CLI Reference

### `ain ask`

Human-friendly prompt execution. Defaults to plain text output.

```bash
ain ask "<prompt>" [options]
```

| Option | Description |
|--------|-------------|
| `--stream` | Stream tokens progressively |
| `--json` | Output as pretty-printed JSON envelope |
| `--jsonl` | Output as compact single-line JSON |
| `--model <id>` | Override model (ID or alias) |
| `--provider <name>` | Override provider |
| `--system <text>` | System prompt |
| `--file <path>` | Append file content to prompt |
| `--temperature <n>` | Sampling temperature |
| `--max-tokens <n>` | Maximum tokens in response |
| `--timeout <ms>` | Request timeout in milliseconds |
| `--retry <n>` | Max retry attempts |
| `--skip-think` | Suppress reasoning/thinking preamble |
| `--route` | Use intelligent routing |
| `--tier <tier>` | Force a specific tier (`fast`, `general`, `reasoning`) |
| `--policy <name>` | Use a named routing policy |
| `--dry-run` | Preview routing decision without executing |
| `--verbose` | Show extra diagnostics on stderr |

**Examples:**

```bash
# Basic usage
ain ask "Summarize this text" --file ./article.txt

# Translate with a specific model, suppress thinking
ain ask "Translate to Portuguese" --model qwen-reason --skip-think

# Stream with routing
ain ask "Write a haiku about coding" --stream --route

# Force fast tier
ain ask "Is this spam?" --route --tier fast

# Preview routing without running
ain ask "Explain relativity" --dry-run

# Pipe stdin
echo "some text" | ain ask "Summarize this:"
```

### `ain run`

Machine-oriented execution with structured output modes. Designed for scripts and pipelines.

```bash
ain run --prompt "<prompt>" [options]
```

Accepts the same options as `ain ask`, plus:

| Option | Description |
|--------|-------------|
| `--schema <path>` | Validate output against a JSON Schema file |
| `--field <key>` | Extract a single field from JSON output (supports dot notation) |

**Examples:**

```bash
# JSON envelope output
ain run --prompt "List 3 colors" --json

# Compact JSONL for piping
ain run --prompt "Analyze this log" --jsonl

# Schema validation
ain run --prompt "Extract user info" --schema user.schema.json

# Field extraction with dot notation
ain run --prompt "City facts" --schema city.json --field location.coordinates

# Policy-based routing with fallback
ain run --prompt "Classify this ticket" --policy local-first

# Reliability options
ain run --prompt "Process data" --retry 5 --timeout 30000
```

### `ain providers`

Manage LLM provider connections.

```bash
# Add a provider
ain providers add <name> --base-url <url> [--api-key <key>] [--timeout <ms>] [--set-default]

# List all providers
ain providers list
ain providers list --json     # Machine-readable output

# Show provider details
ain providers show <name>

# Remove a provider
ain providers remove <name>

# Set default provider
ain providers set-default <name>
```

**Examples:**

```bash
# Local LM Studio
ain providers add lmstudio --base-url http://localhost:1234/v1 --set-default

# Ollama
ain providers add ollama --base-url http://localhost:11434/v1 --set-default

# OpenAI (API key from environment variable)
ain providers add openai --base-url https://api.openai.com/v1 --api-key env:OPENAI_API_KEY

# Remote server with extended timeout
ain providers add remote --base-url http://gpu-server:8080/v1 --timeout 120000
```

### `ain models`

Manage model catalog and metadata.

```bash
# List cached models (* = default)
ain models list

# Fetch live from provider API
ain models list --live

# Machine-readable JSON output
ain models list --json

# Refresh model cache
ain models refresh
ain models refresh <provider>    # Specific provider only

# Set model metadata
ain models set <provider> <model-id> [--alias <alias>] [--tag <tag>...] [--context <size>]
```

**Examples:**

```bash
# Tag models for routing
ain models set local liquid/lfm2.5-1.2b --alias liquid-fast --tag fast --tag local
ain models set local qwen3.5-4b-mlx --alias qwen-reason --tag reasoning --tag local
ain models set local google/gemma-3n-e4b --context 32768
```

### `ain doctor`

Run health checks on configuration and provider connectivity.

```bash
ain doctor                      # Check everything
ain doctor --provider <name>    # Check specific provider
ain doctor --json               # Machine-readable output
```

Checks performed:
- Config file exists and is valid YAML
- Project overlay detection
- Provider count
- API key resolution (including `env:` references)
- Endpoint reachability and latency

### `ain routing`

Inspect and manage the routing system.

```bash
# Simulate a routing decision
ain routing simulate "<prompt>"
ain routing simulate "<prompt>" --json

# List available policies
ain routing policies
ain routing policies --verbose    # Show tier details

# Scaffold a policies.yaml file
ain routing init-policies
```

### `ain config`

Manage AIN configuration.

```bash
# Create initial config
ain config init

# Show config file path
ain config path

# Display current configuration
ain config show

# Set defaults
ain config set-default --provider <name> --model <id>
ain config set-default --temperature 0.3 --max-tokens 2048
```

---

## Configuration

### User Config

Located at `~/.ain/config.yaml`. Created with `ain config init`.

```yaml
version: 1

providers:
  local:
    kind: openai-compatible
    baseUrl: http://localhost:1234/v1
    timeoutMs: 60000
    models:
      - id: liquid/lfm2.5-1.2b
        alias: liquid-fast
        tags: [local, fast, cheap]
        contextWindow: 8192
      - id: google/gemma-3n-e4b
        alias: gemma-general
        tags: [local, general]
      - id: qwen3.5-4b-mlx
        alias: qwen-reason
        tags: [local, reasoning]

  openai:
    kind: openai-compatible
    baseUrl: https://api.openai.com/v1
    apiKey: env:OPENAI_API_KEY
    models: []

defaults:
  provider: local
  model: google/gemma-3n-e4b
  temperature: 0.7
  maxTokens: 2048
```

#### Provider Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"openai-compatible"` | Yes | Provider adapter type |
| `baseUrl` | string (URL) | Yes | API base URL |
| `apiKey` | string | No | API key or `env:VAR_NAME` reference |
| `defaultHeaders` | `Record<string, string>` | No | Custom HTTP headers |
| `timeoutMs` | number | No | Request timeout (default: 60000) |
| `models` | `ModelConfig[]` | No | Model catalog |

#### Model Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Model identifier (e.g., `gpt-4o`) |
| `alias` | string | No | Short alias for `--model` flag |
| `contextWindow` | number | No | Context window size |
| `maxTokens` | number | No | Max output tokens |
| `capabilities` | `string[]` | No | Model capabilities |
| `tags` | `string[]` | No | Tags for routing (e.g., `fast`, `reasoning`, `local`) |

### Project Config Overlay

Place an `ain.yaml` file in your project directory to override settings per-project:

```yaml
# ./ain.yaml — checked into the repo
version: 1

providers:
  team-server:
    kind: openai-compatible
    baseUrl: http://team-gpu:1234/v1

defaults:
  provider: team-server
  model: specific-model
  temperature: 0.3
```

Project config merges over `~/.ain/config.yaml`. Project providers and defaults take precedence. `ain config show` and `ain doctor` indicate when a project overlay is active.

### Secret Management

API keys can reference environment variables using the `env:` prefix:

```yaml
providers:
  openai:
    kind: openai-compatible
    baseUrl: https://api.openai.com/v1
    apiKey: env:OPENAI_API_KEY
```

AIN resolves `env:OPENAI_API_KEY` to `process.env.OPENAI_API_KEY` at runtime. The `ain doctor` command verifies that referenced environment variables are set.

### Config Precedence

Values are resolved in this order (first wins):

1. **CLI arguments** — `--model`, `--temperature`, etc.
2. **Environment variables** — resolved via `env:` references
3. **Project config** — `./ain.yaml`
4. **User config** — `~/.ain/config.yaml`
5. **Built-in defaults** — timeout 60s, etc.

---

## Routing & Policies

### Intelligent Routing

AIN can automatically select the best model for a given task based on prompt analysis:

```bash
# Auto-route (uses default policy or heuristic fallback)
ain ask "Classify this email as spam" --route
# → Routes to 'fast' tier (classification task)

ain ask "Write a detailed essay about AI ethics" --route
# → Routes to 'general' tier (generation task)

ain ask "Analyze step by step why this algorithm fails" --route
# → Routes to 'reasoning' tier
```

### Policy Files

Define routing policies in `~/.ain/policies.yaml`:

```yaml
version: 1
defaultPolicy: local-first

policies:
  local-first:
    description: Route all tasks locally, use fast models for simple tasks
    localFirst: true
    tiers:
      fast:
        provider: local
        model: liquid/lfm2.5-1.2b
        temperature: 0.1
        maxTokens: 512
      general:
        provider: local
        model: google/gemma-3n-e4b
        temperature: 0.7
        maxTokens: 2048
      reasoning:
        provider: local
        model: qwen3.5-4b-mlx
        temperature: 0.6
        maxTokens: 4096
    fallbackChain:
      - local/google/gemma-3n-e4b

  cloud-premium:
    description: Use cloud models for maximum quality
    tiers:
      fast:
        provider: openai
        model: gpt-4o-mini
      general:
        provider: openai
        model: gpt-4o
      reasoning:
        provider: openai
        model: o1
```

Use a specific policy:

```bash
ain run --prompt "Complex analysis task" --policy cloud-premium
```

Scaffold a starter policies file:

```bash
ain routing init-policies
```

### Task Classification

AIN classifies prompts into task types that map to model tiers:

| Task Type | Trigger Keywords | Model Tier |
|-----------|-----------------|------------|
| Classification | classify, categorize, label, is this, what type | `fast` |
| Extraction | extract, parse, find all, list all, get the | `fast` |
| Generation | write, generate, create, compose, summarize, translate | `general` |
| Reasoning | reason, analyze, explain why, think, step by step | `reasoning` |
| Unknown | (no match) | `general` |

### Fallback Chains

When a provider fails after retries, AIN automatically tries each entry in the fallback chain:

```yaml
# In policies.yaml
policies:
  resilient:
    tiers:
      general:
        provider: local
        model: gemma-3n-e4b
    fallbackChain:
      - local/liquid/lfm2.5-1.2b     # try a different local model
      - openai/gpt-4o-mini            # fall back to cloud
```

Fallback chains work with both `run()` and `stream()` in the library API.

---

## Output Modes

| Mode | Flag | Output |
|------|------|--------|
| Text | *(default)* | Plain text to stdout |
| JSON | `--json` | Pretty-printed JSON envelope |
| JSONL | `--jsonl` | Compact single-line JSON (pipe-friendly) |
| Schema | `--schema file.json` | JSON envelope with schema-validated `output` field |
| Field | `--field key` | Single extracted value (supports dot notation: `--field address.city`) |
| Stream | `--stream` | Tokens written progressively to stdout |

### JSON Envelope Format

```json
{
  "ok": true,
  "provider": "local",
  "model": "google/gemma-3n-e4b",
  "mode": "text",
  "output": "The capital of Brazil is Brasília.",
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 12,
    "total_tokens": 27
  }
}
```

When using `--json` mode or `--schema`, the `mode` field is `"json"` and `output` contains the parsed object instead of a string.

---

## Library API

AIN can be used as a Node.js/TypeScript library:

```bash
npm install @felipematos/ain-cli
```

### `run()`

Execute a prompt and get a structured result.

```typescript
import { run } from '@felipematos/ain-cli';

const result = await run({
  prompt: 'What is the capital of France?',
  provider: 'local',
  model: 'gemma-general',
});

console.log(result.output); // "Paris"
console.log(result.ok);     // true
console.log(result.usage);  // { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
```

#### RunOptions

```typescript
interface RunOptions {
  prompt: string;              // The prompt to send
  provider?: string;           // Provider name (uses default if omitted)
  model?: string;              // Model ID or alias (uses default if omitted)
  system?: string;             // System prompt
  temperature?: number;        // Sampling temperature
  maxTokens?: number;          // Max output tokens
  jsonMode?: boolean;          // Request JSON output
  schema?: object;             // JSON Schema for validation
  noThink?: boolean;           // Suppress reasoning blocks
  maxRetries?: number;         // Retry attempts (default: 3)
  timeoutMs?: number;          // Timeout in milliseconds
  fallbackChain?: Array<{      // Alternate models if primary fails
    provider: string;
    model: string;
  }>;
}
```

#### RunResult

```typescript
interface RunResult {
  ok: boolean;                 // Whether the call succeeded
  provider: string;            // Provider that handled the request
  model: string;               // Model that was used
  output: string;              // Raw text output
  parsedOutput?: unknown;      // Parsed JSON (when jsonMode or schema is set)
  usage?: {                    // Token usage (if reported by provider)
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;              // Error message (when ok is false)
}
```

### `stream()`

Stream tokens as an async generator.

```typescript
import { stream } from '@felipematos/ain-cli';

for await (const token of stream({ prompt: 'Tell me a story' })) {
  process.stdout.write(token);
}
```

Streaming supports fallback chains — if the primary provider fails, AIN transparently retries with the next candidate.

### `route()`

Get an intelligent routing decision without executing.

```typescript
import { route, run } from '@felipematos/ain-cli';

const decision = route({ prompt: 'Classify this email as spam' });
// {
//   provider: 'local',
//   model: 'liquid/lfm2.5-1.2b',
//   tier: 'fast',
//   rationale: 'Policy routing: tier=fast, policy tier config',
//   fallbackChain: [{ provider: 'local', model: 'google/gemma-3n-e4b' }]
// }

// Execute with the routing decision
const result = await run({
  prompt: 'Classify this email as spam',
  provider: decision.provider,
  model: decision.model,
  fallbackChain: decision.fallbackChain,
});
```

### Configuration Functions

```typescript
import {
  loadConfig,       // Load merged config (user + project overlay)
  loadUserConfig,   // Load ~/.ain/config.yaml only
  saveConfig,       // Write config to ~/.ain/config.yaml
  initConfig,       // Create initial config
  addProvider,      // Add a provider to config
  removeProvider,   // Remove a provider
  resolveModel,     // Resolve model ID or alias to actual model ID
  resolveProvider,  // Resolve provider by name
  configExists,     // Check if config file exists
  getConfigPath,    // Get config file path
  getConfigDir,     // Get config directory (~/.ain/)
} from '@felipematos/ain-cli';
```

### Utility Functions

```typescript
import {
  createAdapter,       // Create an OpenAI-compatible provider adapter
  classifyTask,        // Classify a prompt into a task type
  estimateComplexity,  // Estimate prompt complexity (low/medium/high)
  runDoctorChecks,     // Run health checks programmatically
  withRetry,           // Retry a function with exponential backoff
  isTransientError,    // Check if an error is retryable
  stripMarkdownFences, // Remove ```json fences from model output
  cleanModelOutput,    // Remove think blocks and EOS tokens
  loadPolicies,        // Load routing policies from disk
  simulateRoute,       // Dry-run routing decision
  listProviders,       // Get configured provider names
} from '@felipematos/ain-cli';
```

---

## TypeScript Types

All types are exported for use in TypeScript projects:

```typescript
import type {
  // Configuration
  AinConfig,
  ProviderConfig,
  ModelConfig,
  DefaultsConfig,

  // Execution
  RunOptions,
  RunResult,

  // Routing
  RoutingRequest,
  RoutingDecision,
  RoutingPolicy,
  PolicyFile,
  TierConfig,
  ModelTier,        // 'fast' | 'general' | 'reasoning' | 'premium'
  TaskType,         // 'classification' | 'extraction' | 'generation' | 'reasoning' | 'unknown'

  // Doctor
  CheckResult,
} from '@felipematos/ain-cli';
```

---

## Docker

AIN includes a multi-stage Dockerfile for containerized usage:

```bash
# Build the image
docker build -t ain .

# Run a command
docker run --rm ain ask "Hello, world"

# With environment variables for API keys
docker run --rm -e OPENAI_API_KEY="sk-..." ain ask "Hello" --provider openai

# Mount a config directory
docker run --rm -v ~/.ain:/root/.ain ain ask "Hello"

# Mount a project directory with ain.yaml overlay
docker run --rm -v $(pwd):/work -w /work -v ~/.ain:/root/.ain ain run --prompt "Analyze" --json
```

The Docker image uses `node:20-alpine` and includes only production dependencies.

---

## Architecture

AIN follows a six-layer architecture that separates concerns cleanly:

```
┌─────────────────────────────────────────────┐
│              CLI Interface                   │  ← argument parsing, stdin/file input
├─────────────────────────────────────────────┤
│            Config / Registry                 │  ← providers, models, aliases, defaults
├─────────────────────────────────────────────┤
│           Provider Adapters                  │  ← OpenAI-compatible normalization
├─────────────────────────────────────────────┤
│           Execution Engine                   │  ← request building, API calls, retry
├─────────────────────────────────────────────┤
│           Output Renderer                    │  ← text, JSON, JSONL, schema validation
├─────────────────────────────────────────────┤
│           Routing Engine                     │  ← task classification, policy routing
└─────────────────────────────────────────────┘
```

### Key Design Principles

- **Routing is separate from execution** — "which model" is a different concern from "how to call it"
- **OpenAI-compatible adapter first** — a single adapter unlocks LM Studio, Ollama, vLLM, OpenAI, and many more
- **Shell-safe by default** — clean stdout for piping, diagnostics to stderr, meaningful exit codes
- **Minimal dependencies** — only 3 production deps: commander, yaml, zod

### Module Map

```
src/
├── cli/           # Command handlers (ask, run, providers, models, doctor, routing, config)
├── config/        # Config loading, Zod schemas, secret resolution, project overlays
├── providers/     # OpenAICompatibleAdapter (chat, stream, health check, model listing)
├── execution/     # run(), stream(), schema validation, think-block filtering
├── output/        # Output formatting (text, JSON envelope, JSONL)
├── routing/       # route(), simulateRoute(), classifyTask(), policy loading
├── doctor/        # Health checks (config, auth, connectivity)
├── shared/        # Retry logic with exponential backoff
└── index.ts       # Library exports
```

---

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/felipematos/ain.git
cd ain
npm install
npm link    # Install CLI globally for development
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source code |
| `npm run typecheck` | Type-check without emitting |
| `npm run dev -- <args>` | Run CLI from source (via tsx) |

### Running Tests

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Skip integration tests (require a running provider)
SKIP_INTEGRATION=1 npm test
```

### Project Structure

```
ain/
├── src/                  # TypeScript source
├── test/                 # Test suite (Vitest)
├── dist/                 # Compiled output (generated)
├── docs/                 # Examples and plans
│   └── examples/         # Sample config and policy files
├── packages/             # Related packages
│   └── openclaw-plugin-ain/  # OpenClaw integration
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile
├── LICENSE
└── README.md
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (invalid config, schema validation failure, provider unreachable, etc.) |

Errors are written to stderr. When using `--json` or `--jsonl`, errors are also formatted as JSON on stderr:

```json
{ "ok": false, "error": "Provider returned an empty response" }
```

---

## License

MIT License

Copyright (c) 2025 Felipe Matos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
