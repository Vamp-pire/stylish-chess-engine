// 오프닝 이론(북) 판별. 데이터는 scripts/build-openings.mjs가 만든 public/openings.json.
import { positionKey } from './openingKey.js';

export interface OpeningInfo { eco: string; name: string; exact: boolean }
export interface OpeningData { names: [string, string][]; positions: Record<string, number> }

export class OpeningBook {
  constructor(private data: OpeningData) {}

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
/** 브라우저/Worker: 필요할 때 한 번만 내려받는다 */
export function loadOpeningBook(url: string): Promise<OpeningBook> {
  cached ??= fetch(url).then((r) => r.json()).then((d: OpeningData) => new OpeningBook(d));
  return cached;
}
