import { describe, it, expect } from 'vitest';
import { classifyTask, estimateComplexity, selectTierFromTask, classifyWithHeuristic } from '../src/routing/classifier.js';

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
  });

  it('classifies generation prompts', () => {
    expect(classifyTask('Summarize this article')).toBe('generation');
    expect(classifyTask('Translate this to French')).toBe('generation');
  });

  it('classifies coding prompts', () => {
    expect(classifyTask('Write a function to sort an array')).toBe('coding');
    expect(classifyTask('Debug this Python code')).toBe('coding');
    expect(classifyTask('Refactor the API endpoint')).toBe('coding');
    expect(classifyTask('Implement a binary search algorithm')).toBe('coding');
    expect(classifyTask('Fix this syntax error in the code')).toBe('coding');
  });

  it('classifies creative prompts', () => {
    expect(classifyTask('Write a poem about the ocean')).toBe('creative');
    expect(classifyTask('Tell me a story about a dragon')).toBe('creative');
    expect(classifyTask('Compose a haiku about spring')).toBe('creative');
    expect(classifyTask('Brainstorm ideas for a screenplay')).toBe('creative');
  });

  it('prioritizes coding over generation for code-related prompts', () => {
    expect(classifyTask('Write a function that reverses a string')).toBe('coding');
    expect(classifyTask('Create an API endpoint for users')).toBe('coding');
  });

  it('prioritizes creative over coding when creative keywords present', () => {
    expect(classifyTask('Write a poem about Python programming')).toBe('creative');
    expect(classifyTask('Write a story about debugging')).toBe('creative');
    expect(classifyTask('Create a song about JavaScript')).toBe('creative');
  });

  it('prioritizes creative over generation for creative prompts', () => {
    expect(classifyTask('Write a poem about the moon')).toBe('creative');
    expect(classifyTask('Write a short story about AI')).toBe('creative');
  });

  it('classifies "explain why/how" as reasoning, not generation', () => {
    expect(classifyTask('Explain why recursion causes stack overflow')).toBe('reasoning');
    expect(classifyTask('Explain how binary search works')).toBe('reasoning');
  });

  it('classifies generic "explain" as generation', () => {
    expect(classifyTask('Explain the concept of gravity')).toBe('generation');
  });

  it('returns unknown for ambiguous prompts', () => {
    expect(classifyTask('Hello')).toBe('unknown');
    expect(classifyTask('What is 2+2?')).toBe('unknown');
  });

  it('only scans first 2000 chars (keywords buried past that are ignored)', () => {
    const padding = 'A'.repeat(2500);
    expect(classifyTask(padding + ' Summarize this text')).toBe('unknown');
    expect(classifyTask('Summarize this: ' + padding)).toBe('generation');
  });

  // Multilingual tests
  it('classifies Portuguese prompts', () => {
    expect(classifyTask('Classifique este texto')).toBe('classification');
    expect(classifyTask('Extrair nomes deste documento')).toBe('extraction');
    expect(classifyTask('Resolver este problema passo a passo')).toBe('reasoning');
    expect(classifyTask('Implementar uma função de ordenação')).toBe('coding');
    expect(classifyTask('Escrever um poema sobre o mar')).toBe('creative');
    expect(classifyTask('Resumir este artigo')).toBe('generation');
  });

  it('classifies Spanish prompts', () => {
    expect(classifyTask('Clasificar este mensaje como spam')).toBe('classification');
    expect(classifyTask('Extraer todos los nombres')).toBe('extraction');
    expect(classifyTask('Resolver paso a paso')).toBe('reasoning');
    expect(classifyTask('Implementar una función de búsqueda')).toBe('coding');
    expect(classifyTask('Escribir una historia de ficción')).toBe('creative');
    expect(classifyTask('Traducir este texto al inglés')).toBe('generation');
  });

  it('classifies French prompts', () => {
    expect(classifyTask('Classer ce message')).toBe('classification');
    expect(classifyTask('Extraire les données')).toBe('extraction');
    expect(classifyTask('Résoudre étape par étape')).toBe('reasoning');
    expect(classifyTask('Implémenter une fonction de tri')).toBe('coding');
    expect(classifyTask('Écrire un poème sur la mer')).toBe('creative');
    expect(classifyTask('Résumer cet article')).toBe('generation');
  });

  it('classifies German prompts', () => {
    expect(classifyTask('Klassifizieren Sie diese Nachricht')).toBe('classification');
    expect(classifyTask('Extrahieren Sie alle Namen')).toBe('extraction');
    expect(classifyTask('Lösen Sie Schritt für Schritt')).toBe('reasoning');
    expect(classifyTask('Implementieren Sie eine Funktion')).toBe('coding');
    expect(classifyTask('Schreiben Sie ein Gedicht über das Meer')).toBe('creative');
    expect(classifyTask('Zusammenfassen Sie diesen Artikel')).toBe('generation');
  });

  it('classifies Chinese prompts', () => {
    expect(classifyTask('分类这条消息')).toBe('classification');
    expect(classifyTask('提取所有名字')).toBe('extraction');
    expect(classifyTask('一步一步解决这个问题')).toBe('reasoning');
    expect(classifyTask('实现一个排序函数')).toBe('coding');
    expect(classifyTask('写一首关于海洋的诗')).toBe('creative');
    expect(classifyTask('翻译这段文字')).toBe('generation');
  });

  it('classifies Japanese prompts', () => {
    expect(classifyTask('このメッセージを分類して')).toBe('classification');
    expect(classifyTask('すべての名前を抽出して')).toBe('extraction');
    expect(classifyTask('ステップバイステップで解く')).toBe('reasoning');
    expect(classifyTask('ソート関数を実装して')).toBe('coding');
    expect(classifyTask('海についての詩を書いて')).toBe('creative');
    expect(classifyTask('この記事を要約して')).toBe('generation');
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

  it('returns high for huge non-space content (binary/base64)', () => {
    expect(estimateComplexity('A'.repeat(100000))).toBe('high');
  });

  it('returns medium for moderate non-space content', () => {
    expect(estimateComplexity('A'.repeat(200))).toBe('medium');
  });

  it('returns low only for truly short content', () => {
    expect(estimateComplexity('hi')).toBe('low');
    expect(estimateComplexity('')).toBe('low');
  });
});

describe('selectTierFromTask', () => {
  it('maps classification tasks correctly', () => {
    expect(selectTierFromTask('classification', 'low')).toBe('ultra-fast');
    expect(selectTierFromTask('classification', 'medium')).toBe('fast');
    expect(selectTierFromTask('classification', 'high')).toBe('fast');
  });

  it('maps extraction tasks correctly', () => {
    expect(selectTierFromTask('extraction', 'low')).toBe('fast');
    expect(selectTierFromTask('extraction', 'medium')).toBe('fast');
    expect(selectTierFromTask('extraction', 'high')).toBe('general');
  });

  it('maps generation tasks correctly', () => {
    expect(selectTierFromTask('generation', 'low')).toBe('fast');
    expect(selectTierFromTask('generation', 'medium')).toBe('general');
    expect(selectTierFromTask('generation', 'high')).toBe('general');
  });

  it('maps reasoning tasks correctly', () => {
    expect(selectTierFromTask('reasoning', 'low')).toBe('general');
    expect(selectTierFromTask('reasoning', 'medium')).toBe('reasoning');
    expect(selectTierFromTask('reasoning', 'high')).toBe('reasoning');
  });

  it('maps coding tasks correctly', () => {
    expect(selectTierFromTask('coding', 'low')).toBe('fast');
    expect(selectTierFromTask('coding', 'medium')).toBe('coding');
    expect(selectTierFromTask('coding', 'high')).toBe('coding');
  });

  it('maps creative tasks correctly', () => {
    expect(selectTierFromTask('creative', 'low')).toBe('general');
    expect(selectTierFromTask('creative', 'medium')).toBe('creative');
    expect(selectTierFromTask('creative', 'high')).toBe('creative');
  });

  it('maps unknown tasks to general', () => {
    expect(selectTierFromTask('unknown', 'low')).toBe('general');
    expect(selectTierFromTask('unknown', 'medium')).toBe('general');
    expect(selectTierFromTask('unknown', 'high')).toBe('general');
  });
});

describe('classifyWithHeuristic', () => {
  it('returns a ClassificationResult shape', () => {
    const result = classifyWithHeuristic('Debug this code');
    expect(result).toHaveProperty('taskType');
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('source', 'heuristic');
    expect(result.taskType).toBe('coding');
    expect(typeof result.confidence).toBe('number');
  });

  it('returns lower confidence for unknown tasks', () => {
    const result = classifyWithHeuristic('Hello');
    expect(result.taskType).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('returns higher confidence for identified tasks', () => {
    const result = classifyWithHeuristic('Classify this text');
    expect(result.taskType).toBe('classification');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });
});
