# AIN

**AIN (AI Node)** is a standalone CLI and library for running LLM tasks with predictable, scriptable behavior. Provider-agnostic, shell-safe, and built for automation.

```bash
npm install -g ain-cli
```

## Quick Start

```bash
# Set up a provider (OpenAI-compatible: LM Studio, Ollama, local servers, OpenAI)
ain config init
ain providers add mac-mini --base-url http://localhost:1234/v1 --set-default
ain models refresh

# Ask a question
ain ask "What is the capital of Brazil?"
# Brasília

# Stream the response
ain ask "Explain quantum entanglement briefly" --stream

# Get JSON output
ain run --prompt "Get info about France" --json

# Schema-validated structured output
ain run --prompt "Extract company info" --schema company.schema.json

# Extract a single field
ain run --prompt "Return country facts about Japan" --schema facts.json --field capital

# Use intelligent routing (picks the best model automatically)
ain ask "Classify this email as spam or not" --route
```

## Commands

### `ain ask [prompt]`

Human-friendly prompt execution. Defaults to plain text output.

```bash
ain ask "Summarize this text" --file ./article.txt
ain ask "Translate to Portuguese" --model qwen-reason --skip-think
ain ask "..." --stream --route --verbose
ain ask "What is the capital?" --jsonl        # compact single-line JSON
echo "some text" | ain ask "Summarize:"
```

### `ain run`

Machine-oriented execution with structured output modes.

```bash
ain run --prompt "..." --json                          # JSON envelope (pretty-printed)
ain run --prompt "..." --jsonl                         # compact single-line JSON
ain run --prompt "..." --schema schema.json            # Schema validation
ain run --prompt "..." --field name                    # Extract field
ain run --prompt "..." --policy local-first            # Policy routing with fallback
ain run --prompt "..." --dry-run                       # Preview routing
ain run --prompt "..." --stream                        # Streaming
ain run --prompt "..." --retry 5 --timeout 30000       # Reliability options
ain run --prompt "..." --skip-think                    # Disable reasoning preamble
```

### `ain providers`

```bash
ain providers add mac-mini --base-url http://localhost:1234/v1 --set-default
ain providers list
ain providers show mac-mini
ain providers remove mac-mini
ain providers set-default mac-mini
```

### `ain models`

```bash
ain models list                          # Cached models
ain models list --live                   # Fetch from provider API
ain models refresh                       # Update cache
ain models refresh mac-mini              # For specific provider
```

### `ain doctor`

```bash
ain doctor                  # Check all providers
ain doctor --provider mac-mini
ain doctor --json           # Machine-readable
```

### `ain routing`

```bash
ain routing simulate "Classify this as spam"     # Preview routing decision
ain routing simulate "Write an essay" --json
ain routing policies                              # List policies
ain routing init-policies                         # Scaffold policies.yaml
```

### `ain config`

```bash
ain config init
ain config path
ain config show
ain config set-default --provider mac-mini --model gemma-general
ain config set-default --temperature 0.3 --max-tokens 2048
```

## Config File

`~/.ain/config.yaml`:

```yaml
version: 1
providers:
  mac-mini:
    kind: openai-compatible
    baseUrl: http://localhost:1234/v1
    timeoutMs: 60000
    models:
      - id: liquid/lfm2.5-1.2b
        alias: liquid-fast
        tags: [local, fast, cheap]
      - id: google/gemma-3n-e4b
        alias: gemma-general
        tags: [local, general]
      - id: qwen3.5-4b-mlx
        alias: qwen-reason
        tags: [local, reasoning]
defaults:
  provider: mac-mini
  model: google/gemma-3n-e4b
  temperature: 0.7      # optional — applied when not overridden per-call
  maxTokens: 2048       # optional — applied when not overridden per-call
```

Secrets via `env:VAR_NAME`: `apiKey: env:OPENAI_API_KEY`

## Routing Policies

`~/.ain/policies.yaml`:

```yaml
version: 1
defaultPolicy: local-first
policies:
  local-first:
    tiers:
      fast:      { provider: mac-mini, model: liquid/lfm2.5-1.2b }
      general:   { provider: mac-mini, model: google/gemma-3n-e4b }
      reasoning: { provider: mac-mini, model: qwen3.5-4b-mlx }
    fallbackChain:
      - mac-mini/google/gemma-3n-e4b    # try general if tier model fails
```

When a provider fails after retries, `run()` and `stream()` automatically try each entry in `fallbackChain` before throwing.

## Library API

```typescript
import { run, stream, route, loadConfig, classifyTask } from 'ain-cli';

// Run a prompt
const result = await run({ prompt: 'Hello', provider: 'mac-mini' });
console.log(result.output);

// With fallback chain — tries fast model, falls back to general on failure
const decision = route({ prompt: 'Classify this email' });
const result2 = await run({
  prompt: 'Classify this email',
  provider: decision.provider,
  model: decision.model,
  fallbackChain: decision.fallbackChain,
});

// Stream tokens (also supports fallbackChain)
for await (const token of stream({ prompt: 'Tell me a story' })) {
  process.stdout.write(token);
}

// Route intelligently
// { tier: 'fast', provider: 'mac-mini', model: 'liquid/lfm2.5-1.2b', ... }

// Classify a task
classifyTask('Analyze step by step why this fails'); // 'reasoning'
```

## Output Modes

| Mode | Flag | Output |
|------|------|--------|
| Text | (default) | Plain text to stdout |
| JSON | `--json` | `{ ok, provider, model, output, usage }` pretty-printed |
| JSONL | `--jsonl` | Same envelope, compact single line (pipe-friendly) |
| Schema | `--schema file.json` | Validated JSON object |
| Field | `--field key` | Single extracted value (supports dot notation: `--field address.city`) |
| Stream | `--stream` | Tokens written progressively |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (bad config, invalid schema, provider unreachable) |

## License

MIT
