/* ==========================================================================
   IGT MISSIONS RDC — app.js — Application principale & boîte à outils UI
   ========================================================================== */
'use strict';

const UI = (() => {
  const openModals = [];
  function modal(opts) {
    const ov = Utils.el('div', { class: 'overlay' + (opts.full ? ' open' : ' open') });
    ov.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''} ${opts.full ? 'full' : ''}">
      <div class="modal-header"><h3>${opts.title || ''}</h3><button class="xclose">&times;</button></div>
      <div class="modal-body">${opts.body || ''}</div>
      ${opts.footer ? `<div class="modal-footer">${opts.footer}</div>` : ''}
    </div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); const i = openModals.indexOf(ov); if (i >= 0) openModals.splice(i, 1); };
    ov.querySelector('.xclose').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov && opts.closeOnBackdrop !== false) close(); });
    openModals.push(ov);
    return { el: ov, close, body: ov.querySelector('.modal-body'), footer: ov.querySelector('.modal-footer') };
  }
  function confirmOk(msg, title, okLabel, danger) {
    return Utils.confirmDialog(title || 'Confirmation', msg, okLabel || 'Confirmer', !!danger);
  }
  function badge(statut) {
    const map = {
      'DISPONIBLE': 'bd-vert', 'EN MISSION': 'bd-rouge', 'EN_MISSION': 'bd-rouge', 'VISITÉE RÉCEMMENT': 'bd-orange',
      'VISITEE_RECENT': 'bd-orange', 'SOUS SUIVI': 'bd-jaune', 'ARCHIVÉE': 'bd-gris', 'ARCHIVEE': 'bd-gris',
      'ACTIF': 'bd-vert', 'INACTIF': 'bd-gris', 'PROGRAMMEE': 'bd-bleu', 'EN_COURS': 'bd-rouge',
      'TERMINEE': 'bd-vert', 'BROUILLON': 'bd-gris', 'VALIDÉE': 'bd-vert', 'IMPRIMÉE': 'bd-bleu',
      'ARCHIVÉ': 'bd-gris', 'ARCHIVE': 'bd-gris', 'actif': 'bd-vert', 'inactif': 'bd-gris', 'DISPONIBLE ': 'bd-vert'
    };
    const cls = map[String(statut)] || 'bd-clair';
    return `<span class="badge ${cls}">${Utils.esc(String(statut || '—'))}</span>`;
  }
  function field(label, inputHtml, opts) {
    opts = opts || {};
    return `<div class="field ${opts.full ? 'full' : ''}">
      ${label ? `<label>${label}</label>` : ''}
      ${opts.ph ? `<div class="ph">${opts.ph}</div>` : ''}
      ${inputHtml}
      <div class="err"></div>
    </div>`;
  }
  function input(name, value, ph, type) {
    return `<input type="${type || 'text'}" data-name="${name}" value="${Utils.esc(value == null ? '' : value)}" placeholder="${Utils.esc(ph || '')}" />`;
  }
  function textarea(name, value, ph) {
    return `<textarea data-name="${name}" rows="3" placeholder="${Utils.esc(ph || '')}">${Utils.esc(value == null ? '' : value)}</textarea>`;
  }
  function select(name, options, value) {
    let html = `<select data-name="${name}">`;
    (options || []).forEach((o) => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      html += `<option value="${Utils.esc(v)}" ${String(v) === String(value == null ? '' : value) ? 'selected' : ''}>${Utils.esc(l)}</option>`;
    });
    return html + '</select>';
  }
  function collect(container) {
    const data = {};
    container.querySelectorAll('[data-name]').forEach((el) => {
      data[el.getAttribute('data-name')] = el.value;
    });
    return data;
  }
  function emptyMessage(icon, text) {
    return `<div class="empty"><div class="e-ic">${icon || ''}</div>${text || 'Aucune donnée'}</div>`;
  }
  function toolbarHtml() {
    return '';
  }
  function confirmModal(title, subtitle, onOk, okLabel) {
    // surcouche conviviale
  }

  /* ---------- Icônes SVG (homogènes, style trait) ---------- */
  const ICON_PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    entreprises: '<path d="M3 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M15 9h4a2 2 0 0 1 2 2v10"/><path d="M21 21H3"/><path d="M9 7h2M9 11h2M9 15h2"/>',
    agents: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    equipes: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    missions: '<circle cx="12" cy="12" r="9"/><polygon points="16 8 13.5 13.5 8 16 10.5 10.5 16 8"/>',
    ordres: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    calendrier: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    historique: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    statistiques: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    archives: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    alertes: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    parametres: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron_down: '<path d="m6 9 6 6 6-6"/>',
    chevron_left: '<path d="m15 18-6-6 6-6"/>',
    chevron_right: '<path d="m9 18 6-6-6-6"/>',
    arrow_left: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    building: '<path d="M3 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M15 9h4a2 2 0 0 1 2 2v10"/><path d="M21 21H3"/><path d="M9 7h2M9 11h2M9 15h2"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
    dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    refresh: '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'
  };
  function icon(name, size) {
    const p = ICON_PATHS[name] || ICON_PATHS.dots;
    return `<svg class="ic-svg" width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
  const ICON_NAMES = Object.keys(ICON_PATHS);

  return { modal, confirmOk, badge, field, input, textarea, select, collect, emptyMessage, icon, ICON_NAMES };
})();

/* Fournisseur de provinces (utilisé par les filtres des modules) */
window.PROVINCES_PROVIDER = async () => {
  const names = await PARAMETRES.getProvinceNames();
  const entrepriseProv = (await DB.getAll('entreprises')).map((e) => e.province).filter(Boolean);
  return Array.from(new Set(names.concat(entrepriseProv).filter((n) => n && n.length))).sort();
};

const APP = (() => {
  let netState = true;

  /* Inhjecte les icônes SVG dans les éléments [data-icon] */
  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      el.innerHTML = UI.icon(el.getAttribute('data-icon'), el.getAttribute('data-ic-size') ? parseInt(el.getAttribute('data-ic-size'), 10) : 18);
    });
  }

  function setTheme(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('igt_theme', theme || 'light'); } catch (e) {}
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = UI.icon(theme === 'dark' ? 'sun' : 'moon', 18);
    // met à jour le thème au démarrage
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem('igt_theme'); } catch (e) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(t || (prefersDark ? 'dark' : 'light'));
  }

  /* Horloge temps réel */
  function startClock() {
    const dEl = document.getElementById('tb-date'), tEl = document.getElementById('tb-time');
    if (!dEl || !tEl) return;
    const tick = () => {
      const now = new Date();
      const day = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][now.getDay()];
      const mon = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][now.getMonth()];
      dEl.textContent = `${day} ${String(now.getDate()).padStart(2,'0')} ${mon} ${now.getFullYear()}`;
      tEl.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* Menu utilisateur */
  function userMenu() {
    const tb = document.getElementById('tb-user');
    if (!tb) return;
    let menu = document.querySelector('.user-menu');
    const close = () => { if (menu) menu.remove(); menu = null; };
    const open = () => {
      close();
      menu = document.createElement('div');
      menu.className = 'user-menu';
      menu.innerHTML = `<div class="um-head"><div class="n" id="um-name">Gestionnaire Administrateur</div><div class="r">Accès complet</div></div>
        <a data-um="profile">${UI.icon('user',16)} Mon profil</a>
        <a data-um="settings">${UI.icon('parametres',16)} Paramètres</a>
        <a data-um="security">${UI.icon('alertes',16)} Sécurité</a>
        <a class="logout" id="um-logout">${UI.icon('logout',16)} Déconnexion</a>`;
      document.body.appendChild(menu);
      menu.querySelectorAll('[data-um]').forEach((a) => a.addEventListener('click', () => {
        const v = a.getAttribute('data-um');
        close();
        if (v === 'settings') Router.navigate('parametres');
        else if (v === 'profile') Router.navigate('parametres');
        else if (v === 'security') Router.navigate('parametres');
      }));
      menu.querySelector('#um-logout').addEventListener('click', (e) => { e.preventDefault(); close(); Auth.logout(); });
    };
    tb.addEventListener('click', () => { if (menu) close(); else open(); });
    document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target) && !tb.contains(e.target)) close(); });
  }

  /* Notifications (nombre) */
  async function refreshBell() {
    const bell = document.getElementById('bell');
    if (!bell) return;
    try {
      const alerts = await ALERTES.getAll();
      bell.innerHTML = UI.icon('bell', 18);
      if (alerts.length > 0) {
        const d = document.createElement('span');
        d.className = 'dot';
        d.textContent = alerts.length > 9 ? '9+' : String(alerts.length);
        d.style.display = 'flex'; d.style.alignItems = 'center'; d.style.justifyContent = 'center';
        d.style.fontSize = '9px'; d.style.fontWeight = '700';
        bell.appendChild(d);
      }
    } catch (e) {}
  }

  function updateActiveMenu(name) {
    document.querySelectorAll('.sb-link').forEach((a) => a.classList.toggle('active', a.getAttribute('data-route') === name));
    document.querySelectorAll('.sidebar').forEach((s) => s.classList.remove('open'));
    const back = document.querySelector('.sb-backdrop'); if (back) back.classList.remove('open');
  }

  function buildSidebar(menu) {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = `<div class="sb-brand"><img src="./assets/logo/logo.png" alt="IGT RDC" /><div><div class="t">IGT RDC</div><div class="s">Gestion &amp; Missions</div></div></div>
      <nav class="sb-nav"><div class="grp">Menu principal</div>${menu.slice(0, 7).map((m) => linkHtml(m)).join('')}
      <div class="grp">Suivi &amp; analyse</div>${menu.slice(7).map((m) => linkHtml(m)).join('')}
      <div class="sb-link logout" id="logout-link"><span class="ic">${UI.icon('logout',18)}</span>Déconnexion</div></nav>
      <div class="sb-footer">Créé par Inspecteur Limengo Daniel (Pmiller) 2026</div>`;
    sb.querySelectorAll('.sb-link[data-route]').forEach((a) => a.addEventListener('click', () => Router.navigate(a.getAttribute('data-route'))));
    const lo = document.getElementById('logout-link');
    if (lo) lo.addEventListener('click', () => Auth.logout());
    hydrateIcons(sb);
  }
  function linkHtml(m) {
    return `<a class="sb-link" data-route="${m.route}"><span class="ic">${UI.icon(m.icon, 19)}</span>${m.label}</a>`;
  }

  function bindTopbar(menu) {
    const burger = document.getElementById('burger');
    if (burger) burger.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); const b = document.querySelector('.sb-backdrop'); if (b) b.classList.toggle('open'); });
    const back = document.querySelector('.sb-backdrop');
    if (back) back.addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); back.classList.remove('open'); });
    const bell = document.getElementById('bell');
    if (bell) bell.addEventListener('click', () => { Router.navigate('alertes'); });
    const tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    hydrateIcons(document);
    userMenu();
  }

  function updateNetBadge() {
    const el = document.getElementById('net-chip');
    if (el) { el.className = 'chip ' + (netState ? 'online' : 'offline'); el.innerHTML = netState ? `<span style="width:7px;height:7px;border-radius:50%;background:var(--vert);display:inline-block"></span> En ligne` : `<span style="width:7px;height:7px;border-radius:50%;background:var(--orange);display:inline-block"></span> Hors ligne`; }
  }
  function setNet(state) { netState = state; updateNetBadge(); }

  async function testStartup() {
    // Tests automatiques de base
    const results = [];
    const dbOk = await DB.available();
    results.push({ label: 'IndexedDB', ok: dbOk });
    results.push({ label: 'Service Worker', ok: ('serviceWorker' in navigator) });
    results.push({ label: 'PWA', ok: ('serviceWorker' in navigator) });
    let storeOk = true; try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { storeOk = false; }
    results.push({ label: 'Stockage local', ok: storeOk });
    if (!dbOk) Utils.toast('Le navigateur ne permet pas le stockage local nécessaire. Les données ne seront pas conservées.', 'err', 'Stockage indisponible');
    return results;
  }

  async function init() {
    await DB.init();
    await Auth.seedDefault();
    await PARAMETRES.seedSettings();
    await PARAMETRES.loadProvinces();
    await PARAMETRES.seedStructures();

    const menu = [
      { route: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
      { route: 'entreprises', label: 'Entreprises', icon: 'building' },
      { route: 'agents', label: 'Agents', icon: 'user' },
      { route: 'equipes', label: 'Équipes', icon: 'users' },
      { route: 'missions', label: 'Missions', icon: 'flag' },
      { route: 'ordres', label: 'Ordres de mission', icon: 'ordres' },
      { route: 'calendrier', label: 'Calendrier', icon: 'calendrier' },
      { route: 'historique', label: 'Historique', icon: 'historique' },
      { route: 'statistiques', label: 'Statistiques', icon: 'statistiques' },
      { route: 'archives', label: 'Archives', icon: 'archives' },
      { route: 'alertes', label: 'Alertes', icon: 'bell' },
      { route: 'parametres', label: 'Paramètres', icon: 'parametres' }
    ];

    registerRoutes();
    initTheme();
    buildSidebar(menu);
    bindTopbar(menu);

    // Nom d'utilisateur & avatar
    const sess = Auth.getSession();
    if (sess && sess.user) {
      const un = document.getElementById('tb-username');
      if (un) un.textContent = sess.user.nom || 'Administrateur';
      const av = document.getElementById('tb-avatar');
      if (av) av.textContent = (sess.user.nom || 'AD').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    }

    document.getElementById('app-shell').classList.add('active');
    startClock();
    Router.start();
    refreshBell();

    // Réseau / hors ligne
    updateNetBadge();
    window.addEventListener('online', () => setNet(true));
    window.addEventListener('offline', () => setNet(false));

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    await testStartup();
    await ALERTES.seedStartup();
    refreshBell();
  }

  function registerRoutes() {
    Router.register('dashboard', { title: 'Tableau de bord', render: DASHBOARD.render });
    Router.register('entreprises', { title: 'Entreprises', render: ENTREPRISES.render });
    Router.register('agents', { title: 'Agents', render: AGENTS.render });
    Router.register('equipes', { title: 'Équipes', render: EQUIPES.render });
    Router.register('missions', { title: 'Missions', render: MISSIONS.render });
    Router.register('ordres', { title: 'Ordres de mission', render: ORDRES.render });
    Router.register('historique', { title: 'Historique', render: HISTORIQUE.render });
    Router.register('calendrier', { title: 'Calendrier', render: CALENDRIER.render });
    Router.register('statistiques', { title: 'Statistiques', render: STATISTIQUES.render });
    Router.register('archives', { title: 'Archives', render: ARCHIVES.render });
    Router.register('alertes', { title: 'Alertes', render: ALERTES.render });
    Router.register('parametres', { title: 'Paramètres', render: PARAMETRES.render });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.IGT_AUTH_PAGE) return; // page login gérée par Auth.init
    if (!Auth.guard()) return; // protège app.html
    init().catch((e) => console.error('Init app', e));
  });

  return { init, updateActiveMenu, setNet, testStartup };
})();
