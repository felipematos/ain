import { run } from '../execution/runner.js';
import type { ClassificationResult, LlmClassifierConfig, ModelTier, RoutingConfig } from './types.js';
import { classifyWithHeuristic } from './classifier.js';

const VALID_TIERS: ModelTier[] = ['ultra-fast', 'fast', 'general', 'reasoning', 'coding', 'creative'];

const CLASSIFICATION_PROMPT = `Classify this prompt into exactly one category. Reply with ONLY the category name.

Categories: ultra-fast, fast, general, reasoning, coding, creative

- ultra-fast: trivial yes/no, simple lookup
- fast: short answers, extraction, simple tasks
- general: balanced tasks, summaries, explanations
- reasoning: math, logic, analysis, step-by-step
- coding: code generation, debugging, refactoring
- creative: stories, poems, brainstorming

Prompt: {PROMPT}

Category:`;

export async function classifyWithLlm(prompt: string, config: LlmClassifierConfig): Promise<ClassificationResult | undefined> {
  try {
    const truncated = prompt.length > 500 ? prompt.slice(0, 500) : prompt;
    const classificationPrompt = CLASSIFICATION_PROMPT.replace('{PROMPT}', truncated);

    const result = await run({
      prompt: classificationPrompt,
      provider: config.provider,
      model: config.model,
      temperature: 0,
      maxTokens: 10,
      timeoutMs: config.timeoutMs,
    });

    const raw = result.output.trim().toLowerCase().replace(/[^a-z-]/g, '');
    const tier = VALID_TIERS.find(t => raw === t || raw.startsWith(t));
    if (!tier) return undefined;

    return {
      taskType: tier === 'coding' ? 'coding' : tier === 'creative' ? 'creative' : tier === 'reasoning' ? 'reasoning' : 'unknown',
      tier,
      confidence: 0.9,
      source: 'llm',
    };
  } catch {
    return undefined;
  }
}

export async function classify(prompt: string, routingConfig?: RoutingConfig): Promise<ClassificationResult> {
  if (routingConfig?.llmClassifier?.enabled) {
    const llmResult = await classifyWithLlm(prompt, routingConfig.llmClassifier);
    if (llmResult) return llmResult;
  }
  return classifyWithHeuristic(prompt);
}
