const modal = document.getElementById('about-modal')!;
const openBtn = document.getElementById('about-btn')!;
const closeBtn = document.getElementById('about-close')!;

export function initAbout() {
  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
