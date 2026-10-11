// 간단한 대화 상자: 배경을 누르거나 Esc로 닫는다.

export function openModal(title: string, body: string, onClose?: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title.replace(/"/g, '&quot;')}">
      <div class="modal-head"><h2>${title}</h2><button class="ghost modal-close" aria-label="닫기">✕</button></div>
      <div class="modal-body">${body}</div>
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('modal-open');
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector<HTMLButtonElement>('.modal-close')!.onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  document.body.appendChild(wrap);
  (wrap as HTMLElement & { close?: () => void }).close = close;
  return wrap.querySelector<HTMLElement>('.modal-body')!;
}

export function closeModal(el: HTMLElement) {
  (el.closest('.modal-backdrop') as (HTMLElement & { close?: () => void }) | null)?.close?.();
}
