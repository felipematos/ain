import type { TaskType, ModelTier, ClassificationResult } from './types.js';

// Cap input to first 2000 chars for keyword matching — keywords are almost always near the start.
// This avoids O(n) regex scans on huge prompts with attached files.
const MAX_CLASSIFY_CHARS = 2000;

// Creative keywords that override coding when both are present.
// "Write a poem about Python" → creative, not coding.
const CREATIVE_OVERRIDE = /\b(poem|poetry|story|stories|song|essay|fiction|narrative|novella|screenplay|haiku|limerick|sonnet|monologue|fable|myth|fairy tale|poema|poesia|história|canção|ficção|poème|poésie|histoire|chanson|Gedicht|Geschichte|Lied|Fiktion|Erzählung)\b/i;

// Priority order: most specific first, with creative-override guard on coding.
const CLASSIFICATION_PATTERNS: Array<{ pattern: RegExp; type: TaskType }> = [
  // 1. coding — EN + PT/ES/FR/DE/ZH/JA
  //    Guarded: if creative keywords co-occur, skip this match (handled in classifyTask)
  {
    pattern: /\b(code review|codebase|source code|write code|program(?:ming)?|function(?:\s+(?:to|that|for|which))|implement|debug|refactor|algorithm|api endpoint|regex|unit test|compile|syntax error|variable|class\s|method\s|import\s|loop\s|array|typescript|javascript|python|rust|golang|sql\b|html|css|bug\b|error handling|stack trace|linter|eslint)/i,
    type: 'coding',
  },
  {
    pattern: /\b(código|programar|função|implementar|depurar|refatorar|algoritmo|teste unitário|programación|función|implementar|depurar|refactorizar|algoritmo|prueba unitaria|programmer|fonction|implémenter|déboguer|refactoriser|algorithme|test unitaire|programmieren|Funktion|implementieren|debuggen|refaktorisieren|Algorithmus|Unittest)/i,
    type: 'coding',
  },
  {
    pattern: /(代码|编程|函数|实现|调试|重构|算法|单元测试|コード|プログラム|関数|実装|デバッグ|リファクタリング|アルゴリズム|ユニットテスト)/,
    type: 'coding',
  },

  // 2. creative — EN + multilingual
  {
    pattern: /\b(poem|poetry|story|stories|song|essay|fiction|narrative|brainstorm|imagine|novella|screenplay|haiku|limerick|sonnet|monologue|dialogue|fable|myth|fairy tale|metaphor|allegory)/i,
    type: 'creative',
  },
  {
    pattern: /\b(poema|poesia|história|canção|ensaio|ficção|narrativa|imaginar|poema|poesía|historia|canción|ensayo|ficción|narrativa|imaginar|poème|poésie|histoire|chanson|essai|récit|imaginer|Gedicht|Geschichte|Lied|Aufsatz|Fiktion|Erzählung|vorstellen)/i,
    type: 'creative',
  },
  {
    pattern: /(诗|诗歌|故事|小说|歌曲|散文|虚构|想象|詩|物語|小説|歌|エッセイ|フィクション|想像)/,
    type: 'creative',
  },

  // 3. classification — EN + multilingual
  {
    pattern: /\b(classify|categorize|label|is this|what type|which category|sort into|sentiment|spam or|positive or negative|true or false)\b/i,
    type: 'classification',
  },
  {
    pattern: /\b(classificar|categorizar|rotular|é isto|que tipo|classifique|clasificar|categorizar|etiquetar|es esto|qué tipo|clasifique|classer|catégoriser|étiqueter|est-ce|quel type|classez|klassifizieren|kategorisieren|beschriften|ist das|welcher Typ)\b/i,
    type: 'classification',
  },
  {
    pattern: /(分类|归类|标签|这是|什么类型|分類|カテゴリ|ラベル|これは|どのタイプ)/,
    type: 'classification',
  },

  // 4. extraction — EN + multilingual
  {
    pattern: /\b(extract|parse|find all|list all|get the|retrieve|scrape|pull out|identify all|enumerate)\b/i,
    type: 'extraction',
  },
  {
    pattern: /\b(extrair|analisar|encontrar todos|listar todos|obter|recuperar|extraer|analizar|encontrar todos|listar todos|obtener|recuperar|extraire|analyser|trouver tous|lister tous|obtenir|récupérer|extrahieren|parsen|alle finden|alle auflisten|abrufen)\b/i,
    type: 'extraction',
  },
  {
    pattern: /(提取|解析|找到所有|列出所有|获取|检索|抽出|解析|すべて見つける|すべてリスト|取得|検索)/,
    type: 'extraction',
  },

  // 5. reasoning — EN + multilingual
  //    Includes "explain why" — more analytical than generation's generic "explain"
  {
    pattern: /\b(reason|analyze|prove|solve|step by step|calculate|compare|evaluate|math|logic|deduce|infer|derive|theorem|equation|probability|statistical|hypothesis|contradiction|explain why|explain how)\b/i,
    type: 'reasoning',
  },
  {
    pattern: /\b(raciocinar|analisar|provar|resolver|passo a passo|calcular|comparar|avaliar|matemática|lógica|razonar|analizar|probar|resolver|paso a paso|calcular|comparar|evaluar|matemática|lógica|raisonner|analyser|prouver|résoudre|étape par étape|calculer|comparer|évaluer|mathématique|logique|begründen|analysieren|beweisen|lösen|Schritt für Schritt|berechnen|vergleichen|bewerten|Mathematik|Logik)\b/i,
    type: 'reasoning',
  },
  {
    pattern: /(推理|分析|证明|解决|一步一步|计算|比较|评估|数学|逻辑|推論|分析|証明|解く|ステップバイステップ|計算|比較|評価|数学|論理)/,
    type: 'reasoning',
  },

  // 6. generation — EN + multilingual (catch-all for creation tasks)
  {
    pattern: /\b(generate|create|draft|summarize|translate|rewrite|compose|write|paraphrase|rephrase|explain|describe|outline|suggest)\b/i,
    type: 'generation',
  },
  {
    pattern: /\b(gerar|criar|rascunhar|resumir|traduzir|reescrever|compor|escrever|generar|crear|redactar|resumir|traducir|reescribir|componer|escribir|générer|créer|rédiger|résumer|traduire|réécrire|composer|écrire|generieren|erstellen|entwerfen|zusammenfassen|übersetzen|umschreiben|verfassen|schreiben)\b/i,
    type: 'generation',
  },
  {
    pattern: /(生成|创建|草稿|总结|翻译|重写|撰写|写|生成|作成|下書き|要約|翻訳|書き直す|書く)/,
    type: 'generation',
  },
];

export function classifyTask(prompt: string): TaskType {
  // Fix #5: only scan first 2000 chars for performance on huge prompts
  const text = prompt.length > MAX_CLASSIFY_CHARS ? prompt.slice(0, MAX_CLASSIFY_CHARS) : prompt;

  for (const { pattern, type } of CLASSIFICATION_PATTERNS) {
    if (pattern.test(text)) {
      // Fix #1/#2: if coding matched but creative keywords also present, yield to creative
      if (type === 'coding' && CREATIVE_OVERRIDE.test(text)) {
        continue;
      }
      return type;
    }
  }
  return 'unknown';
}

export function estimateComplexity(prompt: string): 'low' | 'medium' | 'high' {
  // Fast path: if char count alone already implies high, skip splitting
  const charBasedEstimate = Math.ceil(prompt.length / 5);
  if (charBasedEstimate >= 100) return 'high';

  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  const tokenEstimate = Math.max(wordCount, charBasedEstimate);
  if (tokenEstimate < 20) return 'low';
  if (tokenEstimate < 100) return 'medium';
  return 'high';
}

const TIER_MAP: Record<TaskType, Record<'low' | 'medium' | 'high', ModelTier>> = {
  classification: { low: 'ultra-fast', medium: 'fast', high: 'fast' },
  extraction:     { low: 'fast',       medium: 'fast', high: 'general' },
  generation:     { low: 'fast',       medium: 'general', high: 'general' },
  reasoning:      { low: 'general',    medium: 'reasoning', high: 'reasoning' },
  coding:         { low: 'fast',       medium: 'coding', high: 'coding' },
  creative:       { low: 'general',    medium: 'creative', high: 'creative' },
  unknown:        { low: 'general',    medium: 'general', high: 'general' },
};

export function selectTierFromTask(taskType: TaskType, complexity: 'low' | 'medium' | 'high'): ModelTier {
  return TIER_MAP[taskType][complexity];
}

export function classifyWithHeuristic(prompt: string): ClassificationResult {
  const taskType = classifyTask(prompt);
  const complexity = estimateComplexity(prompt);
  const tier = selectTierFromTask(taskType, complexity);
  return {
    taskType,
    tier,
    confidence: taskType === 'unknown' ? 0.3 : 0.7,
    source: 'heuristic',
  };
}
