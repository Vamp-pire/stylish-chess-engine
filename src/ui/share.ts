// 공유 링크: 서버가 없으므로 기보 자체를 압축해 주소(#g=...)에 담는다.
// 주석은 시계 기록([%clk])만 남기고, 헤더는 화면에 쓰는 것만 남겨 주소를 짧게 한다.

const KEEP = ['Event', 'Site', 'Date', 'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'TimeControl', 'SetUp', 'FEN'];

/** 공유용으로 기보를 줄인다 */
export function slimPgn(pgn: string): string {
  const headers = [...pgn.matchAll(/\[(\w+) "([^"]*)"\]/g)].filter((m) => KEEP.includes(m[1])).map((m) => `[${m[1]} "${m[2]}"]`);
  const body = pgn.replace(/\[[^\]]*"\]\s*/g, '')
    .replace(/\{([^}]*)\}/g, (_, c: string) => { const clk = c.match(/\[%clk [^\]]+\]/); return clk ? `{${clk[0]}}` : ''; })
    .replace(/\$\d+/g, '').replace(/\s+/g, ' ').trim();
  return `${headers.join('\n')}\n\n${body}`;
}

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** 기보 → 주소용 문자열 ('z' + 압축, 압축을 못 하는 브라우저는 'p' + 원문) */
export async function encodeGame(pgn: string): Promise<string> {
  const raw = new TextEncoder().encode(slimPgn(pgn));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { /* 아래로 */ }
  }
  return 'p' + b64url(raw);
}

export async function decodeGame(code: string): Promise<string> {
  const bytes = fromB64url(code.slice(1));
  if (code[0] === 'z') return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
  return new TextDecoder().decode(bytes);
}

/** 현재 주소 기준 공유 링크 */
export async function shareUrl(pgn: string, depth: number): Promise<string> {
  const u = new URL(location.href);
  u.hash = `g=${await encodeGame(pgn)}&d=${depth}`;
  return u.toString();
}

/** 주소에 담긴 공유 기보 (없으면 null) */
export async function readSharedGame(): Promise<{ pgn: string; depth: number | null } | null> {
  const h = new URLSearchParams(location.hash.slice(1));
  const g = h.get('g');
  if (!g) return null;
  try { return { pgn: await decodeGame(g), depth: h.get('d') ? Number(h.get('d')) : null }; } catch { return null; }
}
