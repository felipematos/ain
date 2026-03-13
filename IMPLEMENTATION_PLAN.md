# AIN — Complete Implementation Plan

## 1. Product Definition

### 1.1 What AIN is
AIN (AI Node) is a standalone CLI and library for running small and medium LLM tasks with predictable, scriptable behavior.

It is not tied to OpenClaw. It should work as:

- a terminal tool
- a shell/CI utility
- a workflow node in n8n-like systems
- a local-first AI execution layer
- a reusable npm package/library

### 1.2 What AIN is not
AIN v1 is **not**:

- a full agent framework
- a chat UI
- a persistent assistant shell with memory
- a workflow builder UI
- an OpenClaw plugin

Those can come later or live in separate integrations.

---

## 2. Product Goals

### Primary goals
1. Make LLM calls easy to run from terminal and scripts
2. Support multiple providers and models behind a unified UX
3. Support freeform and structured outputs
4. Make local/self-hosted models first-class citizens
5. Provide a solid base for later intelligent routing

### Secondary goals
1. Be pleasant for humans
2. Be deterministic for machines
3. Be easy to install (`npm i -g ain-cli` or similar)
4. Be easy to embed as a library

### Non-goals for v1
1. Browser GUI
2. Full multi-agent orchestration
3. Auto tool execution ecosystem
4. Fine-grained distributed tracing platform

---

## 3. Core User Stories

### CLI user
- As a user, I want to call a model with one command and get a clean answer.
- As a user, I want to register a provider once and reuse it later.
- As a user, I want to request JSON or schema-shaped output.
- As a user, I want shell-safe output for scripts.

### Workflow builder
- As a workflow designer, I want AIN to act as a tiny AI step.
- As a workflow designer, I want deterministic output modes and exit codes.
- As a workflow designer, I want to pin provider/model/policy per node.

### Local AI power user
- As a local AI user, I want to add LM Studio / Ollama / OpenAI-compatible servers.
- As a local AI user, I want fast local inference for cheap edge decisions.
- As a local AI user, I want health checks and model listing.

### Integrator
- As a developer, I want to import AIN as a JS/TS library.
- As an integrator, I want a stable config format and typed APIs.
- As an integrator, I want future OpenClaw integration without coupling AIN to OpenClaw internals.

---

## 4. Product Surfaces

### 4.1 CLI
Initial commands:

- `ain ask`
- `ain run`
- `ain providers add`
- `ain providers list`
- `ain providers remove`
- `ain models list`
- `ain doctor`
- `ain config path`
- `ain config init`

### 4.2 Library API
Initial exports:

- `loadConfig()`
- `saveConfig()`
- `listProviders()`
- `listModels()`
- `runPrompt()`
- `runStructured()`
- `healthCheckProvider()`

### 4.3 Config file
One user-owned config file, likely:

- `~/.ain/config.yaml`

Optional local project override later:

- `./ain.yaml`

---

## 5. Functional Scope by Phase

## Phase 0 — Bootstrap
- public GitHub repo
- README
- architecture doc
- roadmap
- implementation plan
- basic package structure
- license decision
- npm package naming decision

## Phase 1 — Core CLI and Config
- config file creation
- add/list/remove providers
- config validation
- support OpenAI-compatible providers first
- model listing via `/v1/models`
- simple prompt execution

## Phase 2 — Output Modes
- text output
- JSON mode
- schema mode
- stdin/file input support
- machine-readable errors and exit codes

## Phase 3 — Provider Abstraction
- normalize OpenAI-compatible chat/completions behavior
- support provider capabilities metadata
- support default params per provider/model
- support local/self-hosted providers cleanly

## Phase 4 — Routing Engine (AIN-native)
- task classification layer
- route by policy
- model tiers (`fast`, `general`, `reasoning`, `premium`)
- local-first routing
- fallback on failure

## Phase 5 — OpenClaw Integration
- separate plugin/repo or package
- import OpenClaw models/providers
- expose AIN as routing backend for OpenClaw

---

## 6. Command Design

## 6.1 `ain ask`
Human-friendly command for direct prompts.

Examples:

```bash
ain ask "What is the capital of Brazil?"
ain ask --model local/qwen "Summarize this email"
ain ask --provider mac-mini --model qwen3.5-4b-mlx "..."
```

Behavior:
- defaults to freeform text output
- prints only answer unless `--verbose`
- supports stdin and file input

## 6.2 `ain run`
More explicit machine-oriented command.

Examples:

```bash
ain run --prompt "Classify this message" --json
ain run --input ./payload.txt --schema ./schema.json
ain run --policy fast-edge --prompt "..."
```

## 6.3 Provider management

```bash
ain providers add openai-compatible mac-mini
ain providers list
ain providers show mac-mini
ain providers remove mac-mini
```

Fields:
- provider kind
- base URL
- auth mode
- API key source
- default headers
- timeout
- model defaults

## 6.4 Model management

```bash
ain models list
ain models list --provider mac-mini
ain models refresh mac-mini
```

## 6.5 Diagnostics

```bash
ain doctor
ain doctor --provider mac-mini
```

Checks:
- config exists and is valid
- provider auth source resolvable
- endpoint reachable
- `/v1/models` returns valid catalog

---

## 7. Output Modes

### 7.1 Freeform text
Default mode.

```bash
ain ask "..."
```

Output:
- stdout: plain text answer
- stderr: diagnostics only if needed

### 7.2 Standard JSON envelope
For automation.

```bash
ain run --json --prompt "..."
```

Envelope draft:

```json
{
  "ok": true,
  "provider": "mac-mini",
  "model": "qwen3.5-4b-mlx",
  "mode": "text",
  "output": "...",
  "usage": {}
}
```

### 7.3 Schema-driven structured output

```bash
ain run --schema ./schema.json --prompt "..."
```

Behavior:
- validate returned structure
- fail with non-zero exit code if invalid
- optionally retry with repair prompt in future phase

### 7.4 Delimited / compact modes
Later:
- `--raw`
- `--jsonl`
- `--quiet`
- `--field output`

---

## 8. Config Design

## 8.1 Preferred format
YAML for humans, JSON allowed later.

Suggested path:
- `~/.ain/config.yaml`

## 8.2 Draft schema

```yaml
version: 1
providers:
  mac-mini:
    kind: openai-compatible
    baseUrl: https://felipes-mac-mini.tail4f12c7.ts.net:8443/v1
    apiKey: env:AIN_MAC_MINI_API_KEY
    defaultHeaders: {}
    timeoutMs: 60000
    models:
      - id: liquid/lfm2.5-1.2b
        alias: liquid-fast
        contextWindow: 4096
        maxTokens: 2048
        capabilities: [text]
        tags: [local, fast, cheap]
      - id: google/gemma-3n-e4b
        alias: gemma-general
        contextWindow: 8192
        maxTokens: 4096
        capabilities: [text]
        tags: [local, general]
      - id: qwen3.5-4b-mlx
        alias: qwen-reason
        contextWindow: 8192
        maxTokens: 4096
        capabilities: [text]
        tags: [local, reasoning, portuguese]
defaults:
  provider: mac-mini
  model: google/gemma-3n-e4b
```

## 8.3 Secret handling
Supported forms:
- literal (discouraged)
- `env:VAR_NAME`
- later: OS keychain / 1Password / Doppler / file refs

---

## 9. Technical Architecture

## 9.1 Language/runtime
Recommended:
- TypeScript
- Node.js

Why:
- best fit for npm distribution
- easy CLI packaging
- strong ecosystem for validation, prompts, config, HTTP
- easy future OpenClaw integration without hard coupling

## 9.2 Internal modules
- `cli/`
- `config/`
- `providers/`
- `models/`
- `execution/`
- `output/`
- `routing/` (later)
- `doctor/`
- `shared/`

## 9.3 Provider adapter model
Start with one adapter interface:

- `OpenAICompatibleProviderAdapter`

Later possible adapters:
- Anthropic native
- Gemini native
- Ollama
- llama.cpp server
- custom HTTP adapters

## 9.4 Execution pipeline
1. load config
2. resolve input
3. resolve provider/model
4. build request payload
5. call provider
6. normalize response
7. shape output mode
8. print / return / exit

---

## 10. Intelligent Routing Vision (separate but planned)

AIN routing should be its own subsystem, not mixed into core execution.

### Inputs to routing
- modality
- input size
- requested output mode
- complexity hint
- latency requirement
- cost profile
- local-first policy
- provider health

### Output from routing
- chosen provider/model
- params (`maxTokens`, `temperature`, `noThink`, etc.)
- fallback chain
- rationale (optional)

### Important design principle
Routing is **policy/infrastructure**, not prompt behavior.

---

## 11. Packaging / Distribution

### GitHub
- public repo: `felipematos/ain`

### npm
Candidates:
- `ain`
- `ain-cli`
- `@ain/cli`

Need availability check before publish.

### Install target

```bash
npm install -g ain-cli
```

or

```bash
npx ain-cli ask "hello"
```

---

## 12. Repo Structure Proposal

```text
ain/
  src/
    cli/
    config/
    providers/
    execution/
    output/
    doctor/
    routing/
    index.ts
  docs/
    examples/
    schemas/
  test/
  README.md
  IMPLEMENTATION_PLAN.md
  ARCHITECTURE.md
  ROADMAP.md
  package.json
  tsconfig.json
```

---

## 13. Testing Strategy

### Unit tests
- config parsing
- provider resolution
- response normalization
- schema validation
- exit code behavior

### Integration tests
- mock OpenAI-compatible server
- local LM Studio/Ollama-compatible test harness
- CLI snapshot tests

### Real-world smoke tests
- `/v1/models`
- short prompt
- schema response
- invalid auth
- unreachable endpoint

---

## 14. Risks and Design Traps

1. Mixing routing with basic execution too early
2. Overfitting to OpenClaw internals
3. Hiding too much provider-specific behavior
4. Weak output contracts for automation
5. Noisy CLI output that breaks shell scripts
6. Poor secret-handling conventions
7. Confusing separation between provider/model alias/policy name

---

## 15. Recommended v1 Build Order

### Step 1
Bootstrap repo and docs

### Step 2
Create config schema and config loader

### Step 3
Implement `providers add/list/remove/show`

### Step 4
Implement `models list` through OpenAI-compatible `/v1/models`

### Step 5
Implement `ain ask`

### Step 6
Implement `ain run --json`

### Step 7
Implement `ain run --schema`

### Step 8
Implement `ain doctor`

### Step 9
Add routing RFC and policy format

---

## 16. Definition of Success for v1

AIN v1 is successful when a user can:

1. install it quickly
2. register a local or remote provider
3. list available models
4. run a prompt from terminal
5. request structured output reliably
6. use it safely in scripts and workflows

---

## 17. Immediate Next Deliverables

1. `ARCHITECTURE.md`
2. `ROADMAP.md`
3. package/bootstrap decision
4. initial TypeScript scaffold
5. config schema draft
