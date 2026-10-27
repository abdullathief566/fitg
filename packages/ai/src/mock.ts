// MockProvider (ai-orchestration.md §1, §8): reads fixtures/ai/<type>/*.json and runs the SAME schema and code
// validators as the real provider. CI and Phases 1–4 use only this. In the app (no file system) fixtures are bundled
// as JSON imports through a pluggable FixtureSource.
import type { CallType } from '@fitg/contracts';
import { ZERO_USAGE, type AiCall, type AiCallLogger, type AiProvider, type AiResult } from './provider.ts';
import { outcomeLabel, validateOutput } from './validators.ts';

export interface Fixture {
  scenario: string;
  /** 'valid' | 'refused' | 'reject:<reason>' */
  expect: string;
  allowedNumbers?: number[];
  input?: Record<string, unknown>;
  /** Structured calls. */
  output?: unknown;
  /** coach_chat: an API-shaped response (stop_reason, content blocks). */
  response?: unknown;
  note?: string;
}

export interface NamedFixture {
  /** File name, e.g. `valid.json` (selection order is by file name). */
  name: string;
  fixture: Fixture;
}

export interface FixtureSource {
  list(type: CallType): NamedFixture[];
}

/** A FixtureSource over an in-memory map (the app bundles fixtures as JSON imports). */
export function memoryFixtureSource(byType: Partial<Record<CallType, NamedFixture[]>>): FixtureSource {
  return { list: (type) => [...(byType[type] ?? [])].sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * Selection: the fixture whose `scenario` equals `call.scenario`; with no scenario, the FIRST fixture (by file name)
 * whose `expect` is `valid`.
 */
export function selectFixture(fixtures: NamedFixture[], scenario?: string): NamedFixture | undefined {
  if (scenario !== undefined) return fixtures.find((f) => f.fixture.scenario === scenario);
  return fixtures.find((f) => f.fixture.expect === 'valid');
}

export class MockProvider implements AiProvider {
  constructor(
    private readonly source: FixtureSource,
    private readonly log?: AiCallLogger,
  ) {}

  async complete<T>(call: AiCall<T>): Promise<AiResult<T>> {
    const fixtures = this.source.list(call.type);
    const chosen = selectFixture(fixtures, call.scenario);
    const base = { usage: { ...ZERO_USAGE }, costUsd: 0, model: 'mock', latencyMs: 0 };
    if (!chosen) {
      await this.log?.({
        userId: call.userId,
        callType: call.type,
        provider: 'mock',
        model: 'mock',
        usage: { ...ZERO_USAGE },
        costUsd: 0,
        latencyMs: 0,
        status: 'error',
        validated: false,
        error: `no fixture for ${call.type}${call.scenario ? ` / ${call.scenario}` : ''}`,
      });
      return { ok: false, status: 'error', ...base };
    }
    const f = chosen.fixture;
    const raw = call.type === 'coach_chat' ? f.response : f.output;
    const outcome = validateOutput(call.type, raw, { ...(call.validation ?? {}), allowedNumbers: call.allowedNumbers });
    const status: AiResult<T>['status'] =
      outcome.status === 'valid' ? 'ok' : outcome.status === 'refused' ? 'refused' : 'invalid';
    await this.log?.({
      userId: call.userId,
      callType: call.type,
      provider: 'mock',
      model: 'mock',
      usage: { ...ZERO_USAGE },
      costUsd: 0,
      latencyMs: 0,
      status,
      validated: outcome.status === 'valid',
      ...(outcome.refusalCategory ? { refusalCategory: outcome.refusalCategory } : {}),
      ...(outcome.status === 'reject' ? { error: outcomeLabel(outcome) } : {}),
    });
    const result: AiResult<T> = { ok: outcome.status === 'valid', status, raw, ...base };
    if (outcome.status === 'valid') result.value = outcome.value as T;
    if (outcome.reason) result.reason = outcome.reason;
    if (outcome.refusalCategory) result.refusalCategory = outcome.refusalCategory;
    return result;
  }
}
