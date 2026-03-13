# AIN

AIN (**AI Node**) is a standalone open-source CLI for registering LLM providers/models, executing prompts in different output modes, and later enabling intelligent model routing.

## Vision

AIN is designed to be:

- **OpenClaw-independent**
- **CLI-first**
- **workflow-friendly**
- **config-driven**
- **provider-agnostic**
- **ready for structured outputs and routing**

The core idea is simple: small AI tasks should be easy to run anywhere — terminal, scripts, CI, n8n, cron jobs, internal tools, and larger agent systems.

## Product Scope

AIN has two separable concerns:

1. **AIN Core**
   - standalone CLI
   - provider/model registry
   - prompt execution
   - freeform / JSON / schema-driven outputs
   - predictable machine-friendly behavior

2. **Intelligent Routing Layer**
   - choose the best model for a task
   - route by modality, complexity, latency, cost, and policy
   - support edge/local-first execution patterns

This repository starts with **AIN Core first** and will add routing as a second layer.

## Planned Capabilities

- Register providers from terminal
- Store config in YAML or JSON
- Support OpenAI-compatible providers first
- Support model catalogs per provider
- Freeform text output
- Standardized JSON output
- Schema-constrained structured output
- Non-interactive shell-safe operation
- Clean exit codes
- Provider health checks
- Optional local model support
- Later: intelligent routing policies

## Example UX

```bash
ain ask "What is the capital of Brazil?"
# Brasilia

ain ask "Extract the company name and invoice total" \
  --schema invoice.schema.json \
  --input ./invoice.txt

ain providers add openai-compatible local-lm \
  --base-url https://example.local/v1 \
  --api-key env:LOCAL_LM_API_KEY

ain models list
ain doctor
ain route "Summarize this contract"
```

## Status

Early planning / repository bootstrap.

See:

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROADMAP.md](./ROADMAP.md)

## License

TBD
