// Cloudflare Pages Function: /app 링크를 카톡·디스코드 등에 붙였을 때 보이는 미리보기(제목·설명·이미지)를 링크마다 바꿔 끼운다.
// 화면 내용은 그대로이고, <head>의 og 태그와 <title>만 바꾼다. 계산이 거의 없어 무료 범위 안에서 돈다.
//  - /app?vs=…  : 친구 비교 신청 → "○○님(PSIO 장인)이 체스 유형 비교를 신청했어요" + 그 유형 그림
//  - /app?g=코드 : 그룹 유형 지도 → "○○ 그룹의 체스 유형 지도 · N명" + 가장 많은 유형 그림
//  - /app?source=…&user=… : 아이디 고정 주소 → "○○의 체스 스타일 분석"
import TYPES from '../src/data/chess-types.json';

const SITE = 'https://stylish-chess-engine.pages.dev';
const CODE_RE = /^[AP][WS][IR][OE]$/;

function typeName(code, en) {
  const t = TYPES.types.find((x) => x.code === code);
  if (!t) return '';
  return en ? t.en : t.name;
}

function decodeVs(s) {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const [code, , name] = JSON.parse(json);
    return CODE_RE.test(code) ? { code, name: String(name ?? '').slice(0, 30) } : null;
  } catch { return null; }
}

async function groupInfo(code, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !/^[A-Za-z2-9]{6}$/.test(code)) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_group`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function metaFor(url, env) {
  const p = url.searchParams;
  const en = p.get('lang') === 'en';
  const vs = p.get('vs') ? decodeVs(p.get('vs')) : null;
  if (vs) {
    const who = vs.name || (en ? 'A friend' : '친구');
    const name = typeName(vs.code, en);
    return {
      title: en ? `${who} (${vs.code}, the ${name}) wants to compare chess types` : `${who}님(${vs.code} ${name})이 체스 유형 비교를 신청했어요`,
      description: en ? 'Analyze your recent games and see both chess types side by side. Free, no sign-up.' : '내 아이디로 최근 게임을 분석하고 두 사람의 체스 유형을 나란히 비교해 보세요. 무료, 가입 없음.',
      image: `${SITE}/img/types/${en ? 'en/' : ''}${vs.code}.png`,
    };
  }
  const g = p.get('g');
  if (g) {
    const info = await groupInfo(g, env);
    if (!info) return null;
    const members = info.members ?? [];
    const count = {};
    for (const m of members) if (m.type && CODE_RE.test(m.type)) count[m.type] = (count[m.type] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      title: en ? `${info.name}: chess type map · ${members.length} members` : `${info.name} 그룹의 체스 유형 지도 · ${members.length}명`,
      description: top
        ? (en ? `Most common: ${top} ${typeName(top, true)}. Add your own type and see where you fit.` : `가장 많은 유형: ${top} ${typeName(top, false)}. 내 유형도 넣고 어디쯤인지 확인해 보세요.`)
        : (en ? 'Add your chess type and see the group map.' : '내 체스 유형을 넣고 그룹 지도를 확인해 보세요.'),
      image: top ? `${SITE}/img/types/${en ? 'en/' : ''}${top}.png` : `${SITE}/img/types/landing.png`,
    };
  }
  const user = p.get('user');
  if (user && /^[A-Za-z0-9_-]{1,40}$/.test(user)) {
    return {
      title: en ? `${user}'s chess style analysis | Stylish` : `${user}의 체스 스타일 분석 | Stylish`,
      description: en ? 'Recent games analyzed move by move: chess type, traps and gambles, and the master you play like.' : '최근 게임을 수마다 분석해 체스 유형, 함정수·도박수, 닮은 유명 선수까지 보여줘요.',
      image: `${SITE}/img/types/landing.png`,
    };
  }
  return null;
}

export async function onRequestGet(ctx) {
  const res = await ctx.next();
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const meta = await metaFor(new URL(ctx.request.url), ctx.env);
  if (!meta) return res;
  const set = (attr) => ({ element(e) { e.setAttribute('content', attr); } });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(meta.title); } })
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[name="description"]', set(meta.description))
    .on('meta[property="og:image"]', set(meta.image))
    .transform(res);
}
