import type { TaskType } from './types.js';

const CLASSIFICATION_PATTERNS = [
  { pattern: /\b(classify|categorize|label|is this|what type|which category)\b/i, type: 'classification' as TaskType },
  { pattern: /\b(extract|parse|find all|list all|get the|retrieve)\b/i, type: 'extraction' as TaskType },
  { pattern: /\b(reason|analyze|explain why|think|deduce|infer|step by step)\b/i, type: 'reasoning' as TaskType },
  { pattern: /\b(write|generate|create|compose|draft|summarize|translate)\b/i, type: 'generation' as TaskType },
];

export function classifyTask(prompt: string): TaskType {
  for (const { pattern, type } of CLASSIFICATION_PATTERNS) {
    if (pattern.test(prompt)) return type;
  }
  return 'unknown';
}

export function estimateComplexity(prompt: string): 'low' | 'medium' | 'high' {
  const tokenEstimate = prompt.split(/\s+/).length;
  if (tokenEstimate < 20) return 'low';
  if (tokenEstimate < 100) return 'medium';
  return 'high';
}
