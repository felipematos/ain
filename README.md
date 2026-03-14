# AIN — AI Node

**The missing CLI for LLMs.** One command, any provider, structured output, intelligent routing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@felipematos/ain-cli.svg)](https://www.npmjs.com/package/@felipematos/ain-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

```bash
npm install -g @felipematos/ain-cli
```

AIN turns any OpenAI-compatible API into a scriptable, shell-safe command. No boilerplate. No SDKs. Just prompts in, answers out.

```bash
$ ain What is the capital of Brazil?
Brasilia

$ ain Is Brad Pitt an actor? --bool
true

$ ain Explain quantum entanglement briefly --stream
Quantum entanglement is a phenomenon where two particles become...

$ ain List 3 programming languages --json
{
  "output": ["Python", "TypeScript", "Rust"]
}
```

### Why AIN?

- **Any provider, one interface.** OpenAI, Anthropic, Groq, Mistral, DeepSeek, Ollama, LM Studio, vLLM — AIN works with all of them through a single, consistent CLI. Switch providers by changing one flag.

- **Built for automation.** Clean stdout for piping, diagnostics to stderr, JSON/JSONL/boolean output modes, schema validation, field extraction, and proper exit codes. AIN is a first-class citizen in shell scripts, CI pipelines, and cron jobs.

- **Intelligent routing.** Don't hardcode models. AIN classifies your prompt and picks the right model tier automatically — fast models for simple tasks, reasoning models for complex ones. Define policies, set fallback chains, and let AIN handle the rest.

- **Agent-ready.** AIN integrates with AI agent frameworks like [OpenClaw](https://github.com/openclaw/openclaw) via the [`openclaw-plugin-ain`](https://www.npmjs.com/package/openclaw-plugin-ain) plugin. Your AIN providers, routing engine, and execution layer become tools that agents can call directly. Available on [ClawHub](https://clawhub.ai).

- **Zero friction.** No quotes needed. Command aliases (`ain r`, `ain p`, `ain d`). Option abbreviations (`--st`, `--ro`). An onboarding wizard on first run. Templates for 14 providers. You're productive in seconds.

```bash
# Use it in scripts
result=$(ain r Extract the sentiment --json --field output)

# Pipe content through it
cat article.txt | ain Summarize this in 3 bullet points

# Route intelligently across models
ain Classify this support ticket --route --tier fast

# Use as a Node.js library
import { run, stream, route } from '@felipematos/ain-cli';
const result = await run({ prompt: 'Hello', provider: 'openai' });
```

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
  - [Default Command](#default-command)
  - [Command Aliases](#command-aliases)
  - [Option Abbreviations](#option-abbreviations)
  - [ain ask](#ain-ask)
  - [ain run](#ain-run)
  - [ain providers](#ain-providers)
  - [ain models](#ain-models)
  - [ain doctor](#ain-doctor)
  - [ain routing](#ain-routing)
  - [ain config](#ain-config)
- [Provider Templates](#provider-templates)
- [Onboarding Wizard](#onboarding-wizard)
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
- **No quotes needed** — `ain What is the capital of Brazil?` just works
- **Command aliases** — `a`(sk), `r`(un), `p`(roviders), `m`(odels), `c`(onfig), `d`(octor), `rt`(routing)
- **Option abbreviations** — `--st` for `--stream`, `--ro` for `--route`, and more
- **Provider templates** — one-command setup for OpenAI, Anthropic, Groq, and 11 more
- **Onboarding wizard** — interactive first-run setup guides you through provider configuration

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
# First run? The wizard will guide you. Or set up manually:
ain providers add --template openai --set-default
# Or: ain providers add --template ollama --set-default

# Ask a question (no quotes needed!)
ain What is the capital of Brazil?

# Stream a response
ain Explain quantum entanglement briefly --stream

# Get structured JSON output
ain r Get info about France --json

# Schema-validated output
ain r Extract company info --schema company.schema.json

# Extract a single field
ain r Return facts about Japan --schema facts.json --field capital

# Use intelligent routing (picks the best model automatically)
ain Classify this email as spam or not --route
```

---

## CLI Reference

### Default Command

If no command is given, AIN treats everything as a prompt (using `ask` under the hood). No quotes required — bare words are joined automatically, and options are parsed from the end:

```bash
ain What is the capital of Brazil?
ain Explain quantum entanglement briefly --stream
ain Translate this to Portuguese --model gpt-4o --skip-think
```

### Command Aliases

Every command has a short alias:

| Command | Alias | Example |
|---------|-------|---------|
| `ask` | `a` | `ain a Hello world` |
| `run` | `r` | `ain r Get info --json` |
| `providers` | `p` | `ain p list` |
| `models` | `m` | `ain m list --live` |
| `config` | `c` | `ain c show` |
| `doctor` | `d` | `ain d --json` |
| `routing` | `rt` | `ain rt policies` |

### Option Abbreviations

Long options can be abbreviated to their shortest unambiguous prefix:

| Abbreviation | Expands to | Notes |
|-------------|------------|-------|
| `--st` | `--stream` | |
| `--ro` | `--route` | |
| `--sk` | `--skip-think` | |
| `--dr` | `--dry-run` | |
| `--sc` | `--schema` | |
| `--po` | `--policy` | |
| `--tie` | `--tier` | `--ti` is ambiguous with `--timeout` |
| `--tim` | `--timeout` | |
| `--ret` | `--retry` | `--re` is ambiguous with `--remove-tag` |
| `--ma` | `--max-tokens` | |
| `--li` | `--live` | |
| `--bo` | `--bool` | |
| `--fo` | `--force` | |

Ambiguous prefixes (matching multiple options) are left as-is and will produce an error. Use a longer prefix to disambiguate.

### `ain ask`

Human-friendly prompt execution. Defaults to plain text output. This is the default command when no command is specified.

```bash
ain ask "<prompt>" [options]
ain <prompt words> [options]          # equivalent (default command)
```

| Option | Description |
|--------|-------------|
| `--stream` | Stream tokens progressively |
| `--json` | Output as pretty-printed JSON envelope |
| `--jsonl` | Output as compact single-line JSON |
| `--bool` | Output as boolean `true`/`false` |
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
# No quotes needed
ain Summarize this text --file ./article.txt

# Translate with a specific model, suppress thinking
ain Translate to Portuguese --model qwen-reason --sk

# Stream with routing
ain Write a haiku about coding --st --ro

# Force fast tier
ain Is this spam --ro --tie fast

# Preview routing without running
ain Explain relativity --dr

# Pipe stdin
echo "some text" | ain ask "Summarize this:"

# With quotes (also works)
ain ask "Tell me about France" --stream --verbose
```

### `ain run`

Machine-oriented execution with structured output modes. Designed for scripts and pipelines. Accepts a positional prompt (no `--prompt` needed):

```bash
ain run <prompt words> [options]
ain r <prompt words> [options]        # using alias
ain run --prompt "<prompt>" [options] # explicit flag (also works)
```

Accepts the same options as `ain ask`, plus:

| Option | Description |
|--------|-------------|
| `--schema <path>` | Validate output against a JSON Schema file |
| `--field <key>` | Extract a single field from JSON output (supports dot notation) |

**Examples:**

```bash
# JSON envelope output (no quotes needed)
ain r List 3 colors --json

# Compact JSONL for piping
ain r Analyze this log --jsonl

# Schema validation
ain r Extract user info --sc user.schema.json

# Field extraction with dot notation
ain r City facts --sc city.json --field location.coordinates

# Boolean output
ain r Is this a question --bool

# Policy-based routing with fallback
ain r Classify this ticket --po local-first

# Reliability options
ain r Process data --ret 5 --tim 30000

# With --prompt flag (still works)
ain run --prompt "Complex prompt with --dashes" --json
```

### `ain providers`

Manage LLM provider connections. Alias: `ain p`.

```bash
# Add from a template (recommended)
ain p add --template openai --set-default
ain p add --template ollama --set-default

# Add manually
ain p add <name> --base-url <url> [--api-key <key>] [--timeout <ms>] [--set-default]

# List available templates
ain p templates

# List configured providers
ain p list
ain p list --json     # Machine-readable output

# Show provider details
ain p show <name>

# Remove a provider
ain p remove <name>

# Set default provider
ain p set-default <name>
```

**Examples:**

```bash
# One-liner setup from templates
ain p add --template openai --api-key env:OPENAI_API_KEY --set-default
ain p add --template groq --set-default
ain p add --template anthropic --set-default
ain p add --template ollama --set-default

# Custom provider
ain p add my-server --base-url http://gpu-server:8080/v1 --timeout 120000

# Custom name with template base
ain p add my-openai --template openai --api-key sk-abc123
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

## Provider Templates

AIN ships with 14 built-in templates for quick provider setup. List them with `ain providers templates`:

| Template | Provider | Base URL | API Key Env Var |
|----------|----------|----------|-----------------|
| `openai` | OpenAI | `api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic` | Anthropic | `api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |
| `openrouter` | OpenRouter | `openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `xai` | xAI (Grok) | `api.x.ai/v1` | `XAI_API_KEY` |
| `zai` | Z.ai (Zhipu) | `api.z.ai/api/paas/v4` | `ZAI_API_KEY` |
| `groq` | Groq | `api.groq.com/openai/v1` | `GROQ_API_KEY` |
| `together` | Together AI | `api.together.xyz/v1` | `TOGETHER_API_KEY` |
| `mistral` | Mistral AI | `api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `deepseek` | DeepSeek | `api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| `fireworks` | Fireworks AI | `api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` |
| `ollama` | Ollama (local) | `localhost:11434/v1` | — |
| `lmstudio` | LM Studio (local) | `localhost:1234/v1` | — |
| `vllm` | vLLM (local) | `localhost:8000/v1` | — |
| `custom` | Any OpenAI-compatible | *(you provide)* | — |

Each cloud template includes pre-configured default models with aliases and routing tags. Use templates with:

```bash
ain providers add --template openai --set-default
ain providers add --template groq --api-key env:GROQ_API_KEY --set-default
```

---

## Onboarding Wizard

On first use (or when no providers are configured), AIN launches an interactive wizard that guides you through setup:

1. Presents a numbered list of provider templates (cloud + local)
2. For cloud providers: prompts for API key (detects existing env vars)
3. For local providers: confirms or customizes the base URL
4. Tests the connection and auto-discovers models
5. Sets the provider as default and shows getting-started commands

The wizard only runs in interactive terminals (TTY). For non-interactive environments, use `ain providers add --template <id>` instead.

To re-run the wizard, remove all providers and run any prompt command:

```bash
ain config init --force    # reset config
ain Hello                  # triggers wizard
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
| Bool | `--bool` | Boolean `true` or `false` to stdout |
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

### Boolean Mode

The `--bool` flag instructs the model to answer with `true` or `false`, and normalizes the output:

```bash
ain Is Brad Pitt an actor? --bool
# true

ain Is the Earth flat? --bool
# false

# Combine with --json for structured envelope
ain Is Python dynamically typed? --bool --json
# { "ok": true, ..., "mode": "bool", "output": true }

# Use in shell conditionals
if [ "$(ain Is this valid JSON --bool)" = "true" ]; then
  echo "Valid!"
fi
```

Boolean mode accepts `true`/`yes` as truthy and `false`/`no` as falsy from the model. Any other response produces an error. Combinable with `--json`/`--jsonl` for structured output.

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
  boolMode?: boolean;          // Request boolean true/false output
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
  parsedOutput?: unknown;      // Parsed JSON/boolean (when jsonMode, boolMode, or schema is set)
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
├── cli/           # Command handlers, preprocessor, templates, wizard
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

---

Created by [Felipe Matos](https://felipematos.net), CEO at [10K Digital](https://10k.digital) — an A.I. Accelerator for Businesses.
