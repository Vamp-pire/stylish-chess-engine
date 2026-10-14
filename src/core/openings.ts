// 오프닝 이론(북) 판별. 데이터는 scripts/build-openings.mjs가 만든 public/openings.json.
import { positionKey } from './openingKey.js';

import { STYLE_KEYS, RISK_KINDS, type StyleKey } from './styles.js';

export interface OpeningInfo { eco: string; name: string; exact: boolean }
export interface OpeningData { names: [string, string][]; positions: Record<string, number> }

/** 미리 분석한 오프닝 스타일 데이터 (scripts/openings/build-styles.mjs → public/opening-styles.json) */
export interface OpeningStylesData {
  keys: string[]; risks: string[];
  /** "ECO\t이름" → [백, 흑]. 한쪽: [수 개수, 스타일 점수(keys 순서), 위험 판정 수(risks 순서)] */
  styles: Record<string, [OpeningSideRaw | null, OpeningSideRaw | null]>;
}
type OpeningSideRaw = [number, number[], number[]];

/** 한 오프닝의 한쪽(백 또는 흑) 스타일: 이론 수순 전체를 묶은 성향 */
export interface OpeningSideStyle {
  eco: string; name: string;
  /** 스타일 점수 평균 (0~100) */
  scores: Record<StyleKey, number>;
  /** 이 쪽 수 하나당 위험 판정(희생·함정·도박) 비율 */
  riskRate: number;
}

export class OpeningBook {
  constructor(private data: OpeningData, private styles: OpeningStylesData | null = null) {}

  /** 오프닝의 백·흑 스타일 (미리 분석한 데이터가 없으면 null) */
  styleOf(info: OpeningInfo | null): { w: OpeningSideStyle | null; b: OpeningSideStyle | null } | null {
    const raw = info && this.styles?.styles[`${info.eco}\t${info.name}`];
    if (!raw || !info) return null;
    const keys = this.styles!.keys;
    const side = (x: OpeningSideRaw | null): OpeningSideStyle | null => {
      if (!x) return null;
      const scores = Object.fromEntries(STYLE_KEYS.map((k) => [k, 0])) as Record<StyleKey, number>;
      keys.forEach((k, i) => { if (k in scores) scores[k as StyleKey] = x[1][i] ?? 0; });
      const risks = x[2].reduce((s, v, i) => s + (RISK_KINDS.includes(this.styles!.risks[i] as never) ? v : 0), 0);
      return { eco: info.eco, name: info.name, scores, riskRate: x[0] ? risks / x[0] : 0 };
    };
    return { w: side(raw[0]), b: side(raw[1]) };
  }

  /** 국면이 오프닝 이론에 있으면 그 이름 */
  lookup(fen: string): OpeningInfo | null {
    const v = this.data.positions[positionKey(fen)];
    if (v === undefined) return null;
    const exact = v >= 0;
    const [eco, name] = this.data.names[exact ? v : -1 - v];
    return { eco, name, exact };
  }
}

let cached: Promise<OpeningBook> | null = null;
/** 브라우저/Worker: 필요할 때 한 번만 내려받는다. 오프닝 스타일(같은 폴더의 opening-styles.json)은 못 받아도 이론 판별은 된다 */
export function loadOpeningBook(url: string): Promise<OpeningBook> {
  cached ??= Promise.all([
    fetch(url).then((r) => r.json() as Promise<OpeningData>),
    fetch(new URL('opening-styles.json', url)).then((r) => (r.ok ? (r.json() as Promise<OpeningStylesData>) : null)).catch(() => null),
  ]).then(([d, st]) => new OpeningBook(d, st));
  return cached;
}
