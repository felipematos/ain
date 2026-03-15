import { describe, it, expect } from 'vitest';
import { MODEL_CATALOG, CATALOG_VERSION, findCatalogModel, matchCatalogModel, getCatalogModelsByTier, getModelTiers } from '../src/routing/model-catalog.js';
import type { ModelTier } from '../src/routing/types.js';

describe('MODEL_CATALOG', () => {
  it('has at least 25 entries', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(25);
  });

  it('has a version string', () => {
    expect(CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('all entries have valid tiers', () => {
    const validTiers: ModelTier[] = ['ultra-fast', 'fast', 'general', 'reasoning', 'coding', 'creative'];
    for (const model of MODEL_CATALOG) {
      expect(model.tiers.length).toBeGreaterThan(0);
      for (const tier of model.tiers) {
        expect(validTiers).toContain(tier);
      }
    }
  });

  it('all entries have required fields', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.local).toBe('boolean');
    }
  });
});

describe('findCatalogModel', () => {
  it('finds exact match', () => {
    const model = findCatalogModel('openai/gpt-4o-mini');
    expect(model).toBeDefined();
    expect(model!.name).toBe('GPT-4o Mini');
  });

  it('returns undefined for non-existent model', () => {
    expect(findCatalogModel('nonexistent/model')).toBeUndefined();
  });
});

describe('matchCatalogModel', () => {
  it('matches exact id', () => {
    const model = matchCatalogModel('openai/gpt-4o-mini');
    expect(model).toBeDefined();
    expect(model!.id).toBe('openai/gpt-4o-mini');
  });

  it('matches by suffix (strip provider)', () => {
    const model = matchCatalogModel('gpt-4o-mini');
    expect(model).toBeDefined();
    expect(model!.id).toBe('openai/gpt-4o-mini');
  });

  it('matches by substring', () => {
    const model = matchCatalogModel('deepseek-r1');
    expect(model).toBeDefined();
    expect(model!.id).toBe('deepseek/deepseek-r1');
  });

  it('returns undefined for no match', () => {
    expect(matchCatalogModel('totally-unknown-model-xyz')).toBeUndefined();
  });
});

describe('getCatalogModelsByTier', () => {
  it('returns models for ultra-fast tier', () => {
    const models = getCatalogModelsByTier('ultra-fast');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.tiers).toContain('ultra-fast');
    }
  });

  it('returns models for reasoning tier', () => {
    const models = getCatalogModelsByTier('reasoning');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.tiers).toContain('reasoning');
    }
  });

  it('returns models for coding tier', () => {
    const models = getCatalogModelsByTier('coding');
    expect(models.length).toBeGreaterThan(0);
  });

  it('returns models for creative tier', () => {
    const models = getCatalogModelsByTier('creative');
    expect(models.length).toBeGreaterThan(0);
  });
});

describe('getModelTiers', () => {
  it('returns tiers for known model', () => {
    const tiers = getModelTiers('openai/o3');
    expect(tiers).toContain('reasoning');
  });

  it('returns tiers for fuzzy match', () => {
    const tiers = getModelTiers('gpt-4o-mini');
    expect(tiers).toContain('fast');
  });

  it('returns undefined for unknown model', () => {
    expect(getModelTiers('totally-unknown-model-xyz')).toBeUndefined();
  });
});
