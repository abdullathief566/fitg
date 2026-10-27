// Node/Deno-side helpers (file system). Kept out of the main entry so the app bundle never pulls in `fs`.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { CallType } from '@fitg/contracts';
import { AnthropicProvider } from './anthropic.ts';
import { MockProvider, type Fixture, type FixtureSource, type NamedFixture } from './mock.ts';
import type { AiCallLogger, AiProvider } from './provider.ts';

/** Reads `<dir>/<call_type>/*.json`, sorted by file name. */
export function nodeFixtureSource(dir: string): FixtureSource {
  const cache = new Map<CallType, NamedFixture[]>();
  return {
    list(type) {
      const hit = cache.get(type);
      if (hit) return hit;
      const folder = path.join(dir, type);
      const files = existsSync(folder)
        ? readdirSync(folder)
            .filter((f) => f.endsWith('.json'))
            .sort()
        : [];
      const list = files.map((name) => ({
        name,
        fixture: JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as Fixture,
      }));
      cache.set(type, list);
      return list;
    },
  };
}

/** AI_PROVIDER=mock (default) | anthropic. CI always runs with mock. */
export function createProvider(opts: {
  env: Record<string, string | undefined>;
  fixturesDir: string;
  log?: AiCallLogger;
}): AiProvider {
  const which = opts.env.AI_PROVIDER ?? 'mock';
  if (which === 'mock') return new MockProvider(nodeFixtureSource(opts.fixturesDir), opts.log);
  if (which === 'anthropic') {
    const key = opts.env.ANTHROPIC_API_KEY;
    return new AnthropicProvider({ env: opts.env, ...(key ? { apiKey: key } : {}) });
  }
  throw new Error(`Unknown AI_PROVIDER: ${which}`);
}
