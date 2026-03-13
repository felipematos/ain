# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIN (AI Node) is a standalone CLI and library for running LLM tasks with predictable, scriptable behavior. It is provider-agnostic and designed for terminal use, shell scripts, CI pipelines, and workflow automation.

**Current status:** v0.8.0 — fully implemented, all CLI commands working, 91 unit+integration tests passing.

## Architecture

Six-layer design separating concerns cleanly:

1. **CLI Interface** — argument parsing, stdin/file input, output mode selection
2. **Config/Registry** — providers, models, aliases, defaults (`~/.ain/config.yaml`)
3. **Provider Adapters** — normalize communication (OpenAI-compatible first)
4. **Execution Engine** — build request, call provider, normalize response
5. **Output Renderer** — text, JSON envelope, or schema-validated output
6. **Routing Engine** — model selection by policy (future phase)

## Module Structure

```
src/
  cli/           # Command handlers (ask, run, providers, models, doctor)
  config/        # Config loading, validation, secret resolution
  providers/     # Provider adapters (OpenAICompatibleProviderAdapter)
  execution/     # Request building, API calls, response normalization
  output/        # Output formatting (text, JSON, schema)
  routing/       # Policy-based model selection (later)
  doctor/        # Health checks and diagnostics
  shared/        # Common utilities
  index.ts       # Library exports
```

## CLI Commands

- `ain ask "<prompt>"` — human-friendly prompt execution (`--stream`, `--json`, `--jsonl`, `--route`, `--field`)
- `ain run --prompt "..."` — machine-oriented execution (`--json`, `--jsonl`, `--schema`, `--dry-run`, `--policy`)
- `ain providers add|list|remove|show` — provider management
- `ain models list [--provider]` — model catalog
- `ain doctor` — health checks
- `ain config init|path` — config management
- `ain routing simulate|policies|init-policies` — routing inspection

## Config Location

- User config: `~/.ain/config.yaml`
- Project override: `./ain.yaml` (future)
- Secrets via `env:VAR_NAME` pattern

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Lint code
npm link             # Install CLI globally for development
```

## Key Design Principles

- **Routing is separate from execution** — "which model" vs "how to call"
- **OpenAI-compatible adapter first** — unlocks LM Studio, Ollama, hosted providers
- **Shell-safe by default** — clean stdout, diagnostics to stderr, proper exit codes
- **Config precedence:** CLI args > env vars > project config > user config > defaults
