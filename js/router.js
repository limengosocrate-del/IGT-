/* ==========================================================================
   IGT MISSIONS RDC — router.js — Navigation par modules (hash-based)
   ========================================================================== */
'use strict';

const Router = (() => {
  const routes = {};
  let current = '';

  function register(name, cfg) {
    // cfg : { title, render(container, params), onLeave }
    routes[name] = cfg;
  }

  function navigate(name, params) {
    window.location.hash = name;
  }

  function parseHash() {
    const h = window.location.hash.replace(/^#\/?/, '');
    if (!h) return { name: 'dashboard', params: {} };
    const [name, ...rest] = h.split('/');
    const params = {};
    rest.forEach((p, i) => { params['p' + (i + 1)] = decodeURIComponent(p || ''); });
    return { name: name || 'dashboard', params };
  }

  function render() {
    const { name, params } = parseHash();
    if (!routes[name]) { window.location.hash = 'dashboard'; return; }
    if (name === current && routes[name] && routes[name]._mounted) return;
    if (current && routes[current] && routes[current].onLeave) try { routes[current].onLeave(); } catch (e) {}
    current = name;
    const container = Utils.$('#route-view');
    if (!container) return;
    const cfg = routes[name];
    if (cfg.onLeave) {} 
    container.innerHTML = '';
    routes[name]._mounted = true;
    Promise.resolve(cfg.render(container, params)).catch((e) => {
      console.error('Erreur rendu route', name, e);
      container.innerHTML = `<div class="card"><div class="empty"><div class="e-ic">⚠</div>Erreur de chargement du module.</div></div>`;
    });
    const title = cfg.title || 'IGT RDC';
    document.title = title + ' — Système de Gestion et de Planification des Missions de l\'Inspection Générale du Travail RDC';
    try { if (typeof APP !== 'undefined' && typeof APP.updateActiveMenu === 'function') APP.updateActiveMenu(name); } catch (e) {}
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { register, navigate, render, start };
})();
