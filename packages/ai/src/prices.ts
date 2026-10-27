// Price table (ai-orchestration.md §0, checked 2026-10-27 — re-verify before Phase 5). USD per million tokens.
// Cache writes are billed at 1.25× the input price (5-minute cache); cache reads at the listed rate.
import type { AiUsage } from './provider.ts';

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  // Haiku 5.5 price applies to prompts ≤ 100K tokens (all of FitG's calls).
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** The Batches API is 50% off. */
export const BATCH_DISCOUNT = 0.5;

export function costUsd(model: string, usage: AiUsage, opts: { batch?: boolean } = {}): number {
  const p = PRICES[model];
  if (!p) return 0;
  const cost =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return Number((opts.batch ? cost * BATCH_DISCOUNT : cost).toFixed(6));
}
