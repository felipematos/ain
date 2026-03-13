# AIN Architecture

## Core Principle
AIN should separate three layers cleanly:

1. **Execution Core**
   - run prompts against providers/models
2. **Output Contracts**
   - text / JSON / schema
3. **Routing Engine**
   - choose provider/model/policy

This separation keeps the base CLI simple and stable while allowing routing to evolve independently.

## Architectural Layers

### Layer 1 — CLI Interface
Parses arguments, stdin, files, environment, and output mode.

### Layer 2 — Config / Registry
Loads providers, models, aliases, defaults, policies.

### Layer 3 — Provider Adapters
Normalizes communication with model providers.

### Layer 4 — Execution Engine
Builds request, runs call, normalizes response, returns structured result.

### Layer 5 — Output Renderer
Prints plain text, JSON envelope, or validated structured output.

### Layer 6 — Routing Engine (later)
Given task metadata and policy, chooses execution target.

## Why routing must be separate
Routing is not the same thing as inference.

Inference asks:
- how do I call this model?

Routing asks:
- which model should I call?

That distinction is foundational for keeping AIN reusable and testable.

## Adapter-first strategy
AIN should begin with a strong OpenAI-compatible adapter because it unlocks:
- LM Studio
- many hosted providers
- many self-hosted gateways
- future local wrappers

## Config precedence
Recommended order later:
1. CLI args
2. environment variables
3. project config
4. user config
5. built-in defaults

## Future integration path
AIN can later power:
- OpenClaw plugin
- n8n node
- MCP wrapper
- CI helper
- shell automations
