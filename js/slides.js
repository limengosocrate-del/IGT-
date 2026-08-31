/* ==========================================================================
   IGT MISSIONS RDC — slides.js — Diaporama institutionnel (12 photos / 8 s)
   Bandeau photo en haut du tableau de bord qui change automatiquement toutes
   les 8 secondes. Boutons de navigation précédent/suivant + indicateurs.
   ========================================================================== */
'use strict';

const SLIDES = (() => {
  const PANEL = 'Inspection Générale du Travail — RDC';

  const SLIDES = [
    { src: './assets/images/slides/01.jpg', cap: 'Siège de l\u2019Administration Centrale — Kinshasa' },
    { src: './assets/images/slides/02.jpg', cap: 'Inspecteurs du Travail en service' },
    { src: './assets/images/slides/03.jpg', cap: 'Contrôle en entreprise industrielle' },
    { src: './assets/images/slides/04.jpg', cap: 'Mission de contrôle dans le secteur minier' },
    { src: './assets/images/slides/05.jpg', cap: 'Session de travail institutionnelle' },
    { src: './assets/images/slides/06.jpg', cap: 'Signature des ordres de mission' },
    { src: './assets/images/slides/07.jpg', cap: 'Inspection des conditions de travail' },
    { src: './assets/images/slides/08.jpg', cap: 'Kinshasa, le fleuve Congo' },
    { src: './assets/images/slides/09.jpg', cap: 'Équipes en mission sur le terrain' },
    { src: './assets/images/slides/10.jpg', cap: 'Suivi et pilotage des missions' }
  ];

  let timer = null, idx = 0;

  function widget() {
    const items = SLIDES.map((s, i) => `
      <div class="slide ${i === 0 ? 'on' : ''}" style="background-image:url('${s.src}')">
        <div class="slide-shade"></div>
        <div class="slide-cap"><span class="sc-badge">${UI.icon('flag', 15)}</span><span>${Utils.esc(s.cap)}</span></div>
      </div>`).join('');
    const dots = SLIDES.map((_, i) => `<span class="sl-dot ${i === 0 ? 'on' : ''}" data-sl="${i}"></span>`).join('');
    return `
      <div class="slideshow" data-slideshow>
        <div class="slides-track">${items}</div>
        <div class="sl-nav">
          <button class="sl-btn" data-slprev title="Photo précédente">${UI.icon('chevron_left', 18)}</button>
          <div class="sl-dots">${dots}</div>
          <button class="sl-btn" data-slnext title="Photo suivante">${UI.icon('chevron_right', 18)}</button>
        </div>
        <div class="sl-count"><span data-slcount>1</span> / ${SLIDES.length}</div>
      </div>`;
  }

  function show(i, el) {
    if (!el) return;
    idx = (i + SLIDES.length) % SLIDES.length;
    const track = el.querySelector('.slides-track');
    el.querySelectorAll('.slide').forEach((s, k) => s.classList.toggle('on', k === idx));
    el.querySelectorAll('.sl-dot').forEach((d, k) => d.classList.toggle('on', k === idx));
    const cnt = el.querySelector('[data-slcount]');
    if (cnt) cnt.textContent = String(idx + 1);
    if (track) track.style.transform = 'translateX(-' + (idx * 100) + '%)';
  }

  function start(container) {
    const el = (container && container.querySelector('[data-slideshow]')) || document.querySelector('[data-slideshow]');
    if (!el) return;
    stop();
    el.querySelectorAll('[data-slprev]')[0].addEventListener('click', () => { show(idx - 1, el); restart(el); });
    el.querySelectorAll('[data-slnext]')[0].addEventListener('click', () => { show(idx + 1, el); restart(el); });
    el.querySelectorAll('.sl-dot').forEach((d) => d.addEventListener('click', () => { show(parseInt(d.getAttribute('data-sl'), 10), el); restart(el); }));
    timer = setInterval(() => show(idx + 1, el), 8000);
  }
  function restart(el) { stop(); timer = setInterval(() => show(idx + 1, el), 8000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function slidesCount() { return SLIDES.length; }

  return { widget, start, stop, show, slidesCount };
})();
