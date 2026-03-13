import { z } from 'zod';

export const ModelConfigSchema = z.object({
  id: z.string(),
  alias: z.string().optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  capabilities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const ProviderConfigSchema = z.object({
  kind: z.literal('openai-compatible'),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  defaultHeaders: z.record(z.string()).optional(),
  timeoutMs: z.number().optional().default(60000),
  models: z.array(ModelConfigSchema).optional().default([]),
});

export const DefaultsConfigSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

export const AinConfigSchema = z.object({
  version: z.literal(1),
  providers: z.record(ProviderConfigSchema).optional().default({}),
  defaults: DefaultsConfigSchema.optional().default({}),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;
export type AinConfig = z.infer<typeof AinConfigSchema>;
