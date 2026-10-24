'use strict';

const deck = document.getElementById('deck');
const slides = [...deck.querySelectorAll('.slide')];
const progress = document.getElementById('progress');
const counter = document.getElementById('counter');
const hud = document.querySelector('.hud');
let current = -1;

// ---------- scale the 1600x900 stage to the screen ----------
function fit() {
  const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  deck.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener('resize', fit);
fit();

// ---------- navigation ----------
function go(n) {
  n = Math.max(0, Math.min(slides.length - 1, n));
  if (n === current) return;
  slides.forEach((s, i) => {
    s.classList.toggle('active', i === n);
    s.classList.toggle('past', i < n);
    s.setAttribute('aria-hidden', String(i !== n));
  });
  current = n;
  progress.style.width = `${((n + 1) / slides.length) * 100}%`;
  counter.textContent = `${n + 1} / ${slides.length}`;
  document.title = `${slides[n].dataset.label} · Phone Superpowers`;
  history.replaceState(null, '', `#${n + 1}`);
}
const next = () => go(current + 1);
const prev = () => go(current - 1);

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
      e.preventDefault(); next(); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
      e.preventDefault(); prev(); break;
    case 'Home': go(0); break;
    case 'End': go(slides.length - 1); break;
    case 'f': case 'F':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
      break;
  }
});

// Click the left third to go back, anywhere else to go forward.
document.addEventListener('click', e => {
  if (e.target.closest('a, button')) return;
  if (e.clientX < window.innerWidth / 3) prev(); else next();
});

let touchX = null, touchY = null;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    e.preventDefault(); // swallow the click that follows the swipe
    dx < 0 ? next() : prev();
  }
});

window.addEventListener('hashchange', () => go(Number(location.hash.slice(1)) - 1 || 0));

// Hide the progress bar while presenting; show it when the mouse moves.
let idleTimer;
document.addEventListener('mousemove', () => {
  hud.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => hud.classList.add('idle'), 2000);
});

// ---------- demo link + QR codes ----------
const demoUrl = new URL('demo/', location.href.split('#')[0]).href;
document.querySelectorAll('.demo-url').forEach(el => { el.textContent = demoUrl.replace(/^https?:\/\//, ''); });
if (window.QRCode) {
  document.querySelectorAll('[data-qr]').forEach(el => {
    new QRCode(el, { text: demoUrl, width: 400, height: 400, correctLevel: QRCode.CorrectLevel.M });
  });
}

// ---------- tiny syntax highlighter for the code slides ----------
const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const token = /(\/\/.*$)|('[^'\n]*'|`[^`\n]*`|"[^"\n]*")|\b(const|let|await|new|if|async|return)\b|\b(\d+(?:\.\d+)?)\b/gm;
document.querySelectorAll('pre:not(.sms) code').forEach(el => {
  const src = el.textContent;
  let out = '', last = 0;
  for (const m of src.matchAll(token)) {
    out += escapeHtml(src.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n';
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  el.innerHTML = out + escapeHtml(src.slice(last));
});

// The first slide appears without the slide-in, so the page never opens blank.
deck.classList.add('instant');
go(Number(location.hash.slice(1)) - 1 || 0);
setTimeout(() => deck.classList.remove('instant'), 50);
