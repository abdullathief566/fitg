// UUIDv5 (RFC 4122, SHA-1 name-based) with zero dependencies, plus the id factories the planners use.
import { utf8Bytes } from './hash.ts';

/** FitG's fixed namespace (types.md §0). Reference rows: id = uuidv5(key). Never change it. */
export const FITG_NAMESPACE = '6f1c2c1e-7a3b-4c5d-9e8f-0a1b2c3d4e5f';

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/** SHA-1 of a byte array → 20 bytes. */
export function sha1(bytes: readonly number[]): number[] {
  const ml = bytes.length * 8;
  const msg = [...bytes, 0x80];
  while (msg.length % 64 !== 56) msg.push(0);
  // 64-bit big-endian length (high word stays 0 for any realistic input).
  const hi = Math.floor(ml / 0x100000000);
  const lo = ml >>> 0;
  msg.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  msg.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80).fill(0);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((msg[j] ?? 0) << 24) | ((msg[j + 1] ?? 0) << 16) | ((msg[j + 2] ?? 0) << 8) | (msg[j + 3] ?? 0);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl((w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0), 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const out: number[] = [];
  for (const h of [h0, h1, h2, h3, h4]) out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  return out;
}

function uuidToBytes(uuid: string): number[] {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`Not a uuid: ${uuid}`);
  const out: number[] = [];
  for (let i = 0; i < 32; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function bytesToUuid(b: readonly number[]): string {
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 version-5 uuid of `name` in `namespace` (default: FitG's namespace). */
export function uuidv5(name: string, namespace: string = FITG_NAMESPACE): string {
  const hash = sha1([...uuidToBytes(namespace), ...utf8Bytes(name)]).slice(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

/** Database uuid of a reference row (food, recipe, home dish, add-on): UUIDv5(key) in FitG's namespace. */
export function refId(key: string): string {
  return uuidv5(key);
}

/**
 * Makes ids for rows the planners create (sessions, sets, plan days, meals).
 * Ids are deterministic (pure functions can't draw randomness): uuidv5 of `scope:kind:parts…`.
 * Callers pass a per-user scope (the user id) so two users never share a row id.
 */
export type IdFactory = (kind: string, ...parts: Array<string | number>) => string;

export function makeIds(scope: string): IdFactory {
  return (kind, ...parts) => uuidv5(`${scope}:${kind}:${parts.join(':')}`);
}

/** Default factory for local/offline use and tests. Production callers pass makeIds(userId). */
export const defaultIds: IdFactory = makeIds('local');
