// AnthropicProvider — a stub until Phase 5 (the founder has no API credit yet; Phases 1–4 run fully on mock).
// Phase 5 implements it per ai-orchestration.md §0–§1 and §5: client.messages.parse + zodOutputFormat for structured
// calls; client.beta.messages.create for coach_chat (tools, betas, fallbacks, block_binding); never sampling params;
// tool_choice only auto; effort always set; read blocks by type; check stop_reason first; no fallbacks on Haiku or
// Batches. Verify the installed @anthropic-ai/sdk helpers before writing it.
import type { AiCall, AiProvider, AiResult } from './provider.ts';

export class AnthropicProvider implements AiProvider {
  constructor(_opts: { apiKey?: string; env?: Record<string, string | undefined> } = {}) {}

  complete<T>(_call: AiCall<T>): Promise<AiResult<T>> {
    return Promise.reject(new Error('AnthropicProvider is not enabled until Phase 5. Use AI_PROVIDER=mock.'));
  }
}
