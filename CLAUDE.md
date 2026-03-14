# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIN (AI Node) is a standalone CLI and library for running LLM tasks with predictable, scriptable behavior. It is provider-agnostic and designed for terminal use, shell scripts, CI pipelines, and workflow automation.

**Current status:** v0.9.1 — fully implemented, all CLI commands working, 170 unit+integration tests passing.

## Architecture

Six-layer design separating concerns cleanly:

1. **CLI Interface** — argument parsing, stdin/file input, output mode selection, preprocessor, wizard
2. **Config/Registry** — providers, models, aliases, defaults (`~/.ain/config.yaml`)
3. **Provider Adapters** — normalize communication (OpenAI-compatible first)
4. **Execution Engine** — build request, call provider, normalize response
5. **Output Renderer** — text, JSON envelope, or schema-validated output
6. **Routing Engine** — model selection by policy (implemented: classifier, policy files, heuristic fallback)

## Module Structure

```
src/
  cli/           # Command handlers, preprocessor, templates, wizard
  config/        # Config loading, validation, secret resolution
  providers/     # Provider adapters (OpenAICompatibleProviderAdapter)
  execution/     # Request building, API calls, response normalization
  output/        # Output formatting (text, JSON, schema)
  routing/       # Policy-based model selection
  doctor/        # Health checks and diagnostics
  shared/        # Common utilities
  index.ts       # Library exports
```

## CLI Commands

- `ain <prompt words>` — default command (runs as `ask`), no quotes needed
- `ain ask "<prompt>"` / `ain a` — human-friendly prompt execution
- `ain run <prompt words>` / `ain r` — machine-oriented execution
- `ain providers` / `ain p` — provider management (add, list, remove, show, templates)
- `ain models` / `ain m` — model catalog and metadata management
- `ain doctor` / `ain d` — health checks
- `ain config` / `ain c` — config management
- `ain routing` / `ain rt` — routing inspection

## CLI Preprocessor

The preprocessor (`src/cli/preprocess.ts`) transforms argv before Commander parses it:
- **Default command:** bare words without a known command → `ask <joined prompt>`
- **Command aliases:** a→ask, r→run, p→providers, m→models, c→config, d→doctor, rt→routing
- **Option abbreviations:** `--st`→`--stream`, `--ro`→`--route`, etc. (prefix matching, ambiguous prefixes left as-is)

## Provider Templates

14 built-in templates in `src/cli/templates.ts`: OpenAI, Anthropic, OpenRouter, xAI, Z.ai, Groq, Together, Mistral, DeepSeek, Fireworks, Ollama, LM Studio, vLLM, Custom.

Use with: `ain providers add --template openai --set-default`

## Onboarding Wizard

Interactive wizard (`src/cli/wizard.ts`) triggers on first use when no providers are configured (TTY only). Guides through provider selection, API key setup, connection testing, and model discovery.

## Config Location

- User config: `~/.ain/config.yaml`
- Project override: `./ain.yaml` (merges over user config; project providers/defaults take precedence)
- Policies: `~/.ain/policies.yaml`
- Secrets via `env:VAR_NAME` pattern

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Lint code
npm link             # Install CLI globally for development
```

## Publishing

- npm package: `@felipematos/ain-cli` (scoped due to registry conflict with `aincli`)
- OpenClaw plugin: `openclaw-plugin-ain` (also on ClawHub)
- npm auth token required for publishing (2FA enabled)

## Key Design Principles

- **Routing is separate from execution** — "which model" vs "how to call"
- **OpenAI-compatible adapter first** — unlocks LM Studio, Ollama, hosted providers
- **Shell-safe by default** — clean stdout, diagnostics to stderr, proper exit codes
- **Config precedence:** CLI args > env vars > project config > user config > defaults

## Pre-Push Checklist

- **Always verify that README.md and other documentation are updated** to reflect any new features, changed behavior, new commands, new options, or modified APIs before pushing to GitHub.
- Run `npm test` to ensure all tests pass.
- Run `npm run build` to verify the TypeScript compiles cleanly.
