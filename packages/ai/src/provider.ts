// The provider interface (ai-orchestration.md §1). AI_PROVIDER=mock|anthropic; CI and Phases 1–4 use mock only.
import type { MessageParam, TextBlockParam, Tool, Usage } from '@anthropic-ai/sdk/resources/messages';
import type { z } from 'zod';
import type { CallType } from '@fitg/contracts';
import type { ValidationContext, ValidationOutcome } from './validators.ts';

export type { CallType };
export type ModelTier = 'strong' | 'fast' | 'vision';

/** Frozen system text blocks; the last one carries cache_control. */
export type SystemBlock = TextBlockParam;

export interface AiCall<T> {
  type: CallType;
  tier: ModelTier;
  effort: 'low' | 'medium' | 'high';
  system: SystemBlock[];
  /** SDK types — not redefined here. */
  messages: MessageParam[];
  /** Structured output (absent for coach_chat). */
  schema?: z.ZodType<T>;
  /** coach_chat only, all strict. */
  tools?: Tool[];
  /** Default 16000 for strong calls, 4000 for fast calls. */
  maxTokens: number;
  userId: string | null;
  /** For assertNoForeignNumbers on prose fields. */
  allowedNumbers: number[];
  /** Everything the code validators need (menus, candidates, template text, engine state…). */
  validation?: Omit<ValidationContext, 'allowedNumbers'>;
  /** Mock fixture selector. */
  scenario?: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: AiUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export function usageFromSdk(
  u: Pick<Usage, 'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>,
): AiUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export interface AiResult<T> {
  ok: boolean;
  value?: T;
  raw?: unknown;
  status: 'ok' | 'refused' | 'invalid' | 'error';
  /** The first failed check (§4.0), when status is 'invalid'. */
  reason?: ValidationOutcome['reason'];
  refusalCategory?: string;
  usage: AiUsage;
  costUsd: number;
  model: string;
  latencyMs: number;
}

export interface AiProvider {
  complete<T>(call: AiCall<T>): Promise<AiResult<T>>;
}

/** One row of `ai_calls` (cost, tokens, refusals). The server writes it; tests collect it. */
export interface AiCallLog {
  userId: string | null;
  callType: CallType;
  provider: 'mock' | 'anthropic';
  model: string;
  usage: AiUsage;
  costUsd: number;
  latencyMs: number;
  status: 'ok' | 'refused' | 'invalid' | 'error' | 'fallback_used';
  stopReason?: string;
  refusalCategory?: string;
  validated: boolean;
  error?: string;
}

export type AiCallLogger = (row: AiCallLog) => void | Promise<void>;

/** Model ids come from env with these defaults (ai-orchestration.md §0–§1). */
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  strong: 'claude-opus-5-5',
  fast: 'claude-haiku-5-5',
  vision: 'claude-haiku-5-5',
};

export function modelFor(tier: ModelTier, env: Record<string, string | undefined> = {}): string {
  if (tier === 'strong') return env.MODEL_STRONG ?? DEFAULT_MODELS.strong;
  if (tier === 'fast') return env.MODEL_FAST ?? DEFAULT_MODELS.fast;
  return env.MODEL_VISION ?? DEFAULT_MODELS.vision;
}
