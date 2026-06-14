// Cinematic mode: hide all UI and go fullscreen for an ambient, lean-back view.
// Any mouse move or tap briefly reveals the controls (so you can leave); Esc exits.
export function initCinematic() {
  const box = document.getElementById('cinematic') as HTMLInputElement;
  const body = document.body;
  let revealTimer: ReturnType<typeof setTimeout>;

  const isOn = () => body.classList.contains('cinematic');

  const reveal = () => {
    body.classList.add('reveal');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => body.classList.remove('reveal'), 3000);
  };

  const enter = () => {
    body.classList.add('cinematic');
    document.documentElement.requestFullscreen?.().catch(() => {});
    reveal();
  };

  const exit = () => {
    body.classList.remove('cinematic', 'reveal');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (box.checked) box.checked = false; // keep the toggle in sync on Esc / fullscreen exit
  };

  box.addEventListener('change', () => (box.checked ? enter() : exit()));
  window.addEventListener('mousemove', () => { if (isOn()) reveal(); });
  window.addEventListener('touchstart', () => { if (isOn()) reveal(); }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOn()) exit(); });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isOn()) exit();
  });
}
