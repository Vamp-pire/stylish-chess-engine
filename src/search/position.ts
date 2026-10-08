// 탐색용 빠른 보드 (0x88 방식). chess.js보다 수십 배 빠르게 수를 만들고 되돌린다.
// 칸 번호: sq = rank * 16 + file (rank 0 = 1랭크). sq & 0x88 이 0이 아니면 보드 밖.

export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const BLACK = 8;
export const WHITE_SIDE = 0, BLACK_SIDE = 1;

const FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DOUBLE = 3;

const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const K_OFF = [1, -1, 16, -16, 17, 15, -17, -15];
const B_OFF = [17, 15, -17, -15];
const R_OFF = [1, -1, 16, -16];

const PIECE_CHARS = '.pnbrqk';

/** 수 인코딩: from(7) | to(7) | promo(3) | flag(2) */
export const mFrom = (m: number) => m & 0x7f;
export const mTo = (m: number) => (m >> 7) & 0x7f;
export const mPromo = (m: number) => (m >> 14) & 0x7;
export const mFlag = (m: number) => (m >> 17) & 0x3;
const encode = (from: number, to: number, promo = 0, flag = 0) => from | (to << 7) | (promo << 14) | (flag << 17);

export const sqName = (s: number) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqFromName = (n: string) => (Number(n[1]) - 1) * 16 + (n.charCodeAt(0) - 97);

// 캐슬링 권리 마스크: 이 칸에서 기물이 움직이거나 잡히면 권리를 잃는다
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~2; // a1 → 백 퀸사이드
CASTLE_MASK[0x07] = 15 & ~1; // h1 → 백 킹사이드
CASTLE_MASK[0x04] = 15 & ~3; // e1
CASTLE_MASK[0x70] = 15 & ~8; // a8
CASTLE_MASK[0x77] = 15 & ~4; // h8
CASTLE_MASK[0x74] = 15 & ~12; // e8

interface Undo { move: number; captured: number; castling: number; ep: number; halfmove: number }

export class Position {
  board = new Int8Array(128);
  side = WHITE_SIDE;
  castling = 0; // 1=K 2=Q 4=k 8=q
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings = [0, 0];
  private stack: Undo[] = [];

  static fromFen(fen: string): Position {
    const p = new Position();
    const [placement, side, castle, ep, hm, fm] = fen.trim().split(/\s+/);
    const rows = placement.split('/');
    for (let i = 0; i < 8; i++) {
      let f = 0;
      for (const ch of rows[i]) {
        if (/\d/.test(ch)) { f += Number(ch); continue; }
        const t = PIECE_CHARS.indexOf(ch.toLowerCase());
        const s = (7 - i) * 16 + f;
        p.board[s] = t | (ch === ch.toLowerCase() ? BLACK : 0);
        if (t === K) p.kings[ch === ch.toLowerCase() ? 1 : 0] = s;
        f++;
      }
    }
    p.side = side === 'b' ? BLACK_SIDE : WHITE_SIDE;
    p.castling = (castle.includes('K') ? 1 : 0) | (castle.includes('Q') ? 2 : 0) | (castle.includes('k') ? 4 : 0) | (castle.includes('q') ? 8 : 0);
    p.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
    p.halfmove = Number(hm ?? 0);
    p.fullmove = Number(fm ?? 1);
    return p;
  }

  toFen(): string {
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const pc = this.board[r * 16 + f];
        if (!pc) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const ch = PIECE_CHARS[pc & 7];
        row += pc & BLACK ? ch : ch.toUpperCase();
      }
      rows.push(row + (empty || ''));
    }
    const c = this.castling;
    const castle = (c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '') || '-';
    return `${rows.join('/')} ${this.side ? 'b' : 'w'} ${castle} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  /** bySide 쪽이 s 칸을 공격하는가 */
  attacked(s: number, bySide: number): boolean {
    const b = this.board, col = bySide ? BLACK : 0;
    // 폰
    const pd = bySide ? 16 : -16; // 공격하는 폰이 있는 방향 (s 기준)
    for (const d of [pd - 1, pd + 1]) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === (P | col)) return true;
    }
    for (const d of N_OFF) { const t = s + d; if (!(t & 0x88) && b[t] === (N | col)) return true; }
    for (const d of K_OFF) { const t = s + d; if (!(t & 0x88) && b[t] === (K | col)) return true; }
    for (const d of B_OFF) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const pc = b[t];
        if (!pc) continue;
        if (pc === (B | col) || pc === (Q | col)) return true;
        break;
      }
    }
    for (const d of R_OFF) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const pc = b[t];
        if (!pc) continue;
        if (pc === (R | col) || pc === (Q | col)) return true;
        break;
      }
    }
    return false;
  }

  inCheck(side = this.side): boolean {
    return this.attacked(this.kings[side], side ^ 1);
  }

  /** 의사 합법 수 생성 (자기 킹이 체크에 남는 수 포함). capturesOnly면 잡기/승격만 */
  generate(capturesOnly = false): number[] {
    const out: number[] = [];
    const b = this.board, us = this.side, col = us ? BLACK : 0;
    const isEnemy = (pc: number) => pc !== 0 && (pc & BLACK) !== col;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const pc = b[s];
      if (!pc || (pc & BLACK) !== col) continue;
      const t = pc & 7;
      if (t === P) {
        const d = us ? -16 : 16;
        const startRank = us ? 6 : 1, promoRank = us ? 0 : 7;
        const one = s + d;
        const pushPromo = (from: number, to: number, flag = 0) => {
          if (to >> 4 === promoRank) for (const pr of [Q, R, B, N]) out.push(encode(from, to, pr, flag));
          else out.push(encode(from, to, 0, flag));
        };
        if (!(one & 0x88) && !b[one]) {
          if (!capturesOnly || one >> 4 === promoRank) pushPromo(s, one);
          const two = one + d;
          if (!capturesOnly && s >> 4 === startRank && !b[two]) out.push(encode(s, two, 0, FLAG_DOUBLE));
        }
        for (const cd of [d - 1, d + 1]) {
          const to = s + cd;
          if (to & 0x88) continue;
          if (isEnemy(b[to])) pushPromo(s, to);
          else if (to === this.ep) out.push(encode(s, to, 0, FLAG_EP));
        }
        continue;
      }
      if (t === N || t === K) {
        for (const d of t === N ? N_OFF : K_OFF) {
          const to = s + d;
          if (to & 0x88) continue;
          const x = b[to];
          if (x && !isEnemy(x)) continue;
          if (capturesOnly && !x) continue;
          out.push(encode(s, to));
        }
        if (t === K && !capturesOnly) this.genCastles(out, s);
        continue;
      }
      const dirs = t === B ? B_OFF : t === R ? R_OFF : K_OFF;
      for (const d of dirs) {
        for (let to = s + d; !(to & 0x88); to += d) {
          const x = b[to];
          if (x) { if (isEnemy(x)) out.push(encode(s, to)); break; }
          if (!capturesOnly) out.push(encode(s, to));
        }
      }
    }
    return out;
  }

  private genCastles(out: number[], ks: number) {
    const b = this.board, us = this.side, them = us ^ 1;
    const base = us ? 0x70 : 0;
    if (ks !== base + 4) return;
    const kRight = us ? 4 : 1, qRight = us ? 8 : 2;
    if (this.castling & kRight && !b[base + 5] && !b[base + 6] &&
      !this.attacked(base + 4, them) && !this.attacked(base + 5, them) && !this.attacked(base + 6, them))
      out.push(encode(base + 4, base + 6, 0, FLAG_CASTLE));
    if (this.castling & qRight && !b[base + 3] && !b[base + 2] && !b[base + 1] &&
      !this.attacked(base + 4, them) && !this.attacked(base + 3, them) && !this.attacked(base + 2, them))
      out.push(encode(base + 4, base + 2, 0, FLAG_CASTLE));
  }

  /** 수를 둔다. 자기 킹이 체크에 남으면 되돌리고 false */
  make(m: number): boolean {
    const b = this.board, from = mFrom(m), to = mTo(m), flag = mFlag(m), promo = mPromo(m);
    const pc = b[from];
    let captured = b[to];
    this.stack.push({ move: m, captured, castling: this.castling, ep: this.ep, halfmove: this.halfmove });

    if (flag === FLAG_EP) {
      const capSq = to + (this.side ? 16 : -16);
      captured = b[capSq];
      b[capSq] = 0;
      this.stack[this.stack.length - 1].captured = captured;
    }
    b[to] = promo ? promo | (pc & BLACK) : pc;
    b[from] = 0;
    if (flag === FLAG_CASTLE) {
      if (to > from) { b[from + 1] = b[from + 3]; b[from + 3] = 0; }
      else { b[from - 1] = b[from - 4]; b[from - 4] = 0; }
    }
    if ((pc & 7) === K) this.kings[this.side] = to;
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = (pc & 7) === P || captured ? 0 : this.halfmove + 1;
    if (this.side) this.fullmove++;
    this.side ^= 1;

    if (this.inCheck(this.side ^ 1)) { this.unmake(); return false; }
    return true;
  }

  unmake() {
    const u = this.stack.pop()!;
    const b = this.board, m = u.move, from = mFrom(m), to = mTo(m), flag = mFlag(m);
    this.side ^= 1;
    if (this.side) this.fullmove--;
    const moved = mPromo(m) ? P | (b[to] & BLACK) : b[to];
    b[from] = moved;
    if (flag === FLAG_EP) {
      b[to] = 0;
      b[to + (this.side ? 16 : -16)] = u.captured;
    } else b[to] = u.captured;
    if (flag === FLAG_CASTLE) {
      if (to > from) { b[from + 3] = b[from + 1]; b[from + 1] = 0; }
      else { b[from - 4] = b[from - 1]; b[from - 1] = 0; }
    }
    if ((moved & 7) === K) this.kings[this.side] = from;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
  }

  /** 한 수 쉬기 (위협 분석용) */
  makeNull() {
    this.stack.push({ move: 0, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove });
    this.ep = -1;
    this.side ^= 1;
  }

  unmakeNull() {
    const u = this.stack.pop()!;
    this.side ^= 1;
    this.ep = u.ep;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    for (const m of this.generate()) if (this.make(m)) { this.unmake(); out.push(m); }
    return out;
  }

  pieceAt(s: number) { return this.board[s]; }

  toUci(m: number): string {
    return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? PIECE_CHARS[mPromo(m)] : '');
  }

  fromUci(uci: string): number | null {
    for (const m of this.legalMoves()) if (this.toUci(m) === uci) return m;
    return null;
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of this.generate()) {
      if (!this.make(m)) continue;
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }
}
