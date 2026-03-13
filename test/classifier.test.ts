import { describe, it, expect } from 'vitest';
import { classifyTask, estimateComplexity } from '../src/routing/classifier.js';

describe('classifyTask', () => {
  it('classifies classification prompts', () => {
    expect(classifyTask('Classify this message as spam or not')).toBe('classification');
    expect(classifyTask('Categorize the following into categories')).toBe('classification');
    expect(classifyTask('Is this email spam?')).toBe('classification');
  });

  it('classifies extraction prompts', () => {
    expect(classifyTask('Extract all names from this text')).toBe('extraction');
    expect(classifyTask('Parse the JSON and find the user ID')).toBe('extraction');
    expect(classifyTask('List all phone numbers in this document')).toBe('extraction');
  });

  it('classifies reasoning prompts', () => {
    expect(classifyTask('Reason through this problem step by step')).toBe('reasoning');
    expect(classifyTask('Analyze why this code is slow')).toBe('reasoning');
    expect(classifyTask('Explain why the approach is wrong')).toBe('reasoning');
  });

  it('classifies generation prompts', () => {
    expect(classifyTask('Write a poem about the ocean')).toBe('generation');
    expect(classifyTask('Summarize this article')).toBe('generation');
    expect(classifyTask('Translate this to French')).toBe('generation');
  });

  it('returns unknown for ambiguous prompts', () => {
    expect(classifyTask('Hello')).toBe('unknown');
    expect(classifyTask('What is 2+2?')).toBe('unknown');
  });
});

describe('estimateComplexity', () => {
  it('returns low for short prompts', () => {
    expect(estimateComplexity('Hello world')).toBe('low');
  });

  it('returns medium for moderate prompts', () => {
    const prompt = 'word '.repeat(30);
    expect(estimateComplexity(prompt)).toBe('medium');
  });

  it('returns high for long prompts', () => {
    const prompt = 'word '.repeat(200);
    expect(estimateComplexity(prompt)).toBe('high');
  });
});
