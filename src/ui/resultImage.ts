// 내 결과 이미지 만들기: 유형 카드를 캔버스로 그려 복사·저장·공유한다. 프로필 사진을 넣으면 기물 자리에 들어간다.
// 사진은 이 브라우저 안에서만 쓰이고 서버로 보내지 않는다.
import { openModal } from './modal';
import { TYPE_DATA, groupOf } from '../core/chessType';
import { tr, getLang } from '../i18n';

export interface ResultImageInput { code: string; name: string; pcts: number[] }

/** 그룹별 배경색 (scripts/build-type-images.mjs와 같음) */
const GROUP_COLOR: Record<string, [string, string, string]> = {
  AW: ['#5c1712', '#c2382d', '#ff8a7a'],
  AS: ['#5a3008', '#c47a14', '#ffcf7a'],
  PW: ['#241850', '#6a52cf', '#b7a8ff'],
  PS: ['#0d3a2a', '#26875d', '#8fe3bd'],
};
const PIECE: Record<string, string> = {
  AWIO: 'knight', AWIE: 'queen', AWRO: 'bishop', AWRE: 'rook',
  ASIO: 'bishop', ASIE: 'queen', ASRO: 'knight', ASRE: 'rook',
  PWIO: 'pawn', PWIE: 'rook', PWRO: 'knight', PWRE: 'king',
  PSIO: 'pawn', PSIE: 'rook', PSRO: 'bishop', PSRE: 'king',
};
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const SITE = 'stylish-chess-engine.pages.dev';

type Format = 'square' | 'story';
const SIZE: Record<Format, [number, number]> = { square: [1080, 1080], story: [1080, 1920] };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 같은 그림은 한 번만 불러온다 (다시 그릴 때 깜빡임·타이밍 차이 방지) */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function cachedImage(src: string) {
  let p = imageCache.get(src);
  if (!p) { p = loadImage(src); imageCache.set(src, p); p.catch(() => imageCache.delete(src)); }
  return p;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(tr('이미지를 불러오지 못했습니다', 'Could not load the image')));
    img.src = src;
  }).then(async (img) => { await img.decode?.().catch(() => null); return img; });
}

/** 최대 너비에 맞춰 줄바꿈 (공백 기준) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function draw(canvas: HTMLCanvasElement, input: ResultImageInput, format: Format, nick: string, photo: HTMLImageElement | null) {
  const [W, H] = SIZE[format];
  await Promise.all([
    document.fonts.ready,
    ...['800', '700', '500'].map((w) => document.fonts.load(`${w} 40px ${FONT}`, '가A').catch(() => null)),
    cachedImage('/img/pieces/knight.svg'),
    photo ? cachedImage(`/img/pieces/${PIECE[input.code]}.svg`) : cachedImage(`/img/scenes/${input.code}.png`),
  ]);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const t = TYPE_DATA.types.find((x) => x.code === input.code)!;
  const g = input.code.slice(0, 2);
  const [dark, mid, light] = GROUP_COLOR[g];
  const group = groupOf(input.code);
  const story = format === 'story';

  // 배경: 그라데이션 + 체스판 무늬 + 빛
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, dark); bg.addColorStop(1, mid);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  const cell = story ? 120 : 96;
  for (let r = 0; r < Math.ceil(H / cell) + 1; r++) for (let c = 0; c < Math.ceil(W / cell) + 1; c++) {
    if ((r + c) % 2) continue;
    if (!story && c * cell < W * 0.45) continue; // 정사각형은 오른쪽에만
    ctx.beginPath(); ctx.roundRect(c * cell + 6, r * cell + 6, cell - 12, cell - 12, cell * 0.12); ctx.fill();
  }
  const cx = story ? W / 2 : 790, cy = story ? 560 : 300, radius = story ? 300 : 200;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.2);
  glow.addColorStop(0, hexA(light, 0.45)); glow.addColorStop(1, hexA(light, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // 사진(원형) 또는 유형 기물
  if (photo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    const s = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
    ctx.drawImage(photo, cx - (photo.width * s) / 2, cy - (photo.height * s) / 2, photo.width * s, photo.height * s);
    ctx.restore();
    ctx.lineWidth = story ? 14 : 10; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    // 사진 아래쪽에 작은 기물 배지
    const badge = story ? 120 : 92, bx = cx + radius * 0.62, by = cy + radius * 0.62;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by, badge / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(bx, by, badge / 2 - 6, 0, Math.PI * 2); ctx.fill();
    const pc = await cachedImage(`/img/pieces/${PIECE[input.code]}.svg`);
    ctx.drawImage(pc, bx - badge * 0.36, by - badge * 0.38, badge * 0.72, badge * 0.72);
  } else {
    // 사진이 없으면 유형 장면(기물과 화살표, 투명 PNG)
    const sc = await cachedImage(`/img/scenes/${input.code}.png`);
    const ss = radius * 2.3;
    ctx.drawImage(sc, cx - ss / 2, cy - ss / 2, ss, ss);
  }

  // 로고
  const knight = await cachedImage('/img/pieces/knight.svg');
  const lx = story ? W / 2 - 110 : 80, ly = story ? 110 : 96;
  ctx.drawImage(knight, lx, ly - 40, 52, 52);
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('Stylish', lx + 62, ly);
  const sw = ctx.measureText('Stylish').width;
  ctx.fillStyle = light; ctx.fillText('.', lx + 62 + sw, ly);

  // 글자 영역
  const align: CanvasTextAlign = story ? 'center' : 'left';
  const x = story ? W / 2 : 80;
  let y = story ? cy + radius + 110 : 210;
  ctx.textAlign = align;
  if (nick) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 ${story ? 44 : 38}px ${FONT}`;
    ctx.fillText(tr(`${nick}의 체스 유형`, `${nick}'s chess type`), x, y);
  }
  // 그룹 이름표
  ctx.font = `700 ${story ? 32 : 28}px ${FONT}`;
  const en = getLang() === 'en';
  const pill = en ? group.name : `${group.name} · ${group.en}`;
  const pw = ctx.measureText(pill).width + 40;
  const pillY = story ? y + 50 : y + 46;
  const pillX = story ? x - pw / 2 : x;
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.roundRect(pillX, pillY, pw, story ? 54 : 48, 27); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
  ctx.fillText(pill, pillX + 20, pillY + (story ? 38 : 34));
  ctx.textAlign = align;

  y = story ? pillY + 260 : 560;
  ctx.font = `800 ${story ? 230 : 190}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '8px';
  ctx.fillText(input.code, x, y);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';

  y += story ? 120 : 100;
  ctx.font = `800 ${story ? 96 : 80}px ${FONT}`;
  const nameW = ctx.measureText(t.name).width;
  ctx.font = `500 ${story ? 44 : 38}px ${FONT}`;
  const enW = en ? 0 : ctx.measureText(t.en).width;
  const nameX = story ? x - (nameW + (en ? 0 : 20) + enW) / 2 : x;
  ctx.textAlign = 'left';
  ctx.font = `800 ${story ? 96 : 80}px ${FONT}`; ctx.fillStyle = '#ffffff';
  ctx.fillText(t.name, nameX, y);
  ctx.font = `500 ${story ? 44 : 38}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  if (!en) ctx.fillText(t.en, nameX + nameW + 20, y);
  ctx.textAlign = align;

  ctx.font = `500 ${story ? 46 : 40}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const lines = wrapText(ctx, t.tagline, story ? 860 : 900);
  y += story ? 90 : 76;
  for (const l of lines) { ctx.fillText(l, x, y); y += story ? 62 : 54; }

  // 축 막대
  const rowH = story ? 76 : 50;
  y += story ? 40 : 14;
  const left = story ? 120 : 80, right = W - left;
  const labelW = story ? 170 : 150;
  const trackX = left + labelW, trackW = right - labelW - trackX;
  input.pcts.forEach((pct, i) => {
    const ax = TYPE_DATA.axes[i];
    const first = input.code[i] === ax.letters[0];
    const ry = y + i * rowH;
    ctx.font = `${first ? 800 : 500} ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = first ? '#ffffff' : 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left'; ctx.fillText(`${ax.letters[0]} ${ax.names[0]}`, left, ry);
    ctx.font = `${first ? 500 : 800} ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = first ? 'rgba(255,255,255,0.55)' : '#ffffff';
    ctx.textAlign = 'right'; ctx.fillText(`${ax.names[1]} ${ax.letters[1]}`, right, ry);
    const ty = ry - (story ? 12 : 9);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(trackX, ty - 5, trackW, 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(trackX + trackW / 2 - 1, ty - 12, 2, 24);
    const mx = trackX + trackW * (1 - pct / 100);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, ty, story ? 15 : 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(mx, ty, story ? 8 : 6, 0, Math.PI * 2); ctx.fill();
  });

  // 아래 주소
  ctx.textAlign = align;
  ctx.font = `500 ${story ? 34 : 28}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(`${tr('나의 체스 유형은?', "What's your chess type?")} ${SITE}`, story ? W / 2 : 80, H - (story ? 90 : 46));
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('이미지를 만들지 못했습니다', 'Could not create the image')))), 'image/png'));

export function openResultImage(input: ResultImageInput) {
  const t = TYPE_DATA.types.find((x) => x.code === input.code);
  if (!t) return;
  const body = openModal(tr('내 결과 이미지 만들기', 'Make my result image'), `
    <div class="ri">
      <div class="ri-preview"><canvas class="ri-canvas" aria-label="${tr('결과 이미지 미리보기', 'Result image preview')}"></canvas></div>
      <div class="ri-side">
        <div class="ri-field">
          <span class="ri-label">${tr('프로필 사진 (선택)', 'Profile photo (optional)')}</span>
          <div class="ri-row">
            <label class="ri-file">${tr('사진 고르기', 'Choose photo')}<input type="file" accept="image/*" hidden /></label>
            <button type="button" class="ghost" data-ri-clear hidden>${tr('사진 빼기', 'Remove photo')}</button>
          </div>
          <span class="faint">${tr('사진은 이 기기 안에서만 쓰이고 어디에도 올라가지 않아요. 사진이 없으면 유형 장면이 들어가요.', 'Your photo stays on this device and is never uploaded. Without a photo, the type scene is used.')}</span>
        </div>
        <label class="ri-field"><span class="ri-label">${tr('닉네임 (선택)', 'Nickname (optional)')}</span>
          <input class="ri-nick" maxlength="20" value="${esc(input.name)}" placeholder="${tr('이미지에 넣을 이름', 'Name to show on the image')}" /></label>
        <div class="ri-field"><span class="ri-label">${tr('모양', 'Format')}</span>
          <div class="ri-seg"><button type="button" data-ri-format="square" class="on">${tr('정사각형 (피드)', 'Square (feed)')}</button><button type="button" data-ri-format="story">${tr('세로 (스토리)', 'Vertical (story)')}</button></div>
        </div>
        <div class="ri-actions">
          <button type="button" class="ri-primary" data-ri-copy>${tr('이미지 복사', 'Copy image')}</button>
          <button type="button" data-ri-save>${tr('저장', 'Save')}</button>
          <button type="button" data-ri-share hidden>${tr('공유', 'Share')}</button>
        </div>
        <p class="ri-msg faint" aria-live="polite"></p>
      </div>
    </div>`);
  const canvas = body.querySelector<HTMLCanvasElement>('.ri-canvas')!;
  const msg = body.querySelector<HTMLElement>('.ri-msg')!;
  const nickInput = body.querySelector<HTMLInputElement>('.ri-nick')!;
  const fileInput = body.querySelector<HTMLInputElement>('input[type=file]')!;
  const clearBtn = body.querySelector<HTMLButtonElement>('[data-ri-clear]')!;
  let format: Format = 'square';
  let photo: HTMLImageElement | null = null;
  let photoUrl: string | null = null;
  let seq = 0;
  /** 지금 설정 그대로 새 캔버스에 끝까지 그린다 (미리보기와 내보내기가 같은 함수를 쓴다) */
  const render = async () => {
    const off = document.createElement('canvas');
    await draw(off, input, format, nickInput.value.trim(), photo);
    return off;
  };
  const redraw = async () => {
    const my = ++seq;
    try {
      const off = await render();
      if (my !== seq) return; // 더 최근 요청이 있으면 버린다
      canvas.width = off.width; canvas.height = off.height;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
    } catch (e) { if (my === seq) msg.textContent = String(e instanceof Error ? e.message : e); }
  };
  const say = (text: string) => { msg.textContent = text; };
  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(f);
    try { photo = await loadImage(photoUrl); clearBtn.hidden = false; say(''); }
    catch { photo = null; say(tr('이 사진 형식은 열 수 없어요. JPG나 PNG로 다시 골라 주세요.', 'This photo format cannot be opened. Please choose a JPG or PNG.')); }
    redraw();
  };
  clearBtn.onclick = () => { photo = null; clearBtn.hidden = true; fileInput.value = ''; redraw(); };
  let nickTimer = 0;
  nickInput.oninput = () => { clearTimeout(nickTimer); nickTimer = window.setTimeout(redraw, 200); };
  const exportBlob = () => { clearTimeout(nickTimer); redraw(); return render().then(toBlob); };
  body.querySelectorAll<HTMLButtonElement>('[data-ri-format]').forEach((b) => b.onclick = () => {
    format = b.dataset.riFormat as Format;
    body.querySelectorAll('[data-ri-format]').forEach((x) => x.classList.toggle('on', x === b));
    canvas.classList.toggle('story', format === 'story');
    redraw();
  });
  const fileName = () => `stylish-${input.code}-${format}.png`;

  body.querySelector<HTMLButtonElement>('[data-ri-copy]')!.onclick = async () => {
    try {
      // 사용자 동작 안에서 바로 호출해야 하므로 Blob은 Promise로 넘긴다 (Safari)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob() })]);
      say(tr('복사했어요! 카톡·인스타·디스코드 등에 붙여넣기 하세요.', 'Copied! Paste it into Instagram, Discord, X and more.'));
    } catch {
      say(tr('이 브라우저에서는 이미지 복사가 안 돼요. 저장을 눌러 주세요.', "This browser can't copy images. Please use Save."));
    }
  };
  body.querySelector<HTMLButtonElement>('[data-ri-save]')!.onclick = async () => {
    const url = URL.createObjectURL(await exportBlob());
    const a = document.createElement('a');
    a.href = url; a.download = fileName(); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(tr('저장했어요.', 'Saved.'));
  };
  const shareBtn = body.querySelector<HTMLButtonElement>('[data-ri-share]')!;
  const probe = new File([new Blob()], 'x.png', { type: 'image/png' });
  shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [probe] }));
  shareBtn.onclick = async () => {
    try {
      const file = new File([await exportBlob()], fileName(), { type: 'image/png' });
      await navigator.share({ files: [file], title: tr('Stylish 체스 유형', 'Stylish chess type'), text: tr(`나의 체스 유형은 ${input.code} ${t.name}! https://${SITE}/types/${input.code}`, `My chess type is ${input.code}, the ${t.name}! https://${SITE}/en/types/${input.code}`) });
    } catch { /* 공유 창을 닫은 경우 */ }
  };
  redraw();
}
