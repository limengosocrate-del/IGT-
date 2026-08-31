/* ==========================================================================
   IGT MISSIONS RDC — auth.js — Authentification & session
   Un unique compte : Gestionnaire Administrateur (admin / admin2026)
   ========================================================================== */
'use strict';

const Auth = (() => {
  const SESSION_KEY = 'igt_session';

  const DEFAULT_ACCOUNT = {
    id: 'USER-ADMIN-001',
    username: 'admin',
    password: 'admin2026',
    nom: 'Gestionnaire Administrateur',
    role: 'Gestionnaire Administrateur',
    createdAt: ''
  };

  /* ---------- Session ---------- */
  function createSession(user) {
    const session = { user, loginAt: Utils.nowStamp(), sid: 'sess_' + Date.now() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return session;
  }
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* ---------- Compte par défaut (amorçage) ---------- */
  async function seedDefault() {
    try {
      await DB.init();
      const users = await DB.getAll('users');
      if (!users || users.length === 0) {
        await DB.put('users', Object.assign({}, DEFAULT_ACCOUNT));
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Vérification des identifiants ---------- */
  async function verify(username, password) {
    await DB.init();
    let account = null;
    const users = await DB.getAll('users');
    if (users && users.length) account = users[0];
    else { account = DEFAULT_ACCOUNT; await DB.put('users', account); }
    if (String(account.username) === String(username).trim() && String(account.password) === String(password)) {
      return { ok: true, user: { id: account.id, username: account.username, nom: account.nom || 'Gestionnaire Administrateur', role: account.role || 'Gestionnaire Administrateur' } };
    }
    return { ok: false, error: 'Identifiant ou mot de passe incorrect.' };
  }

  /* ---------- Connexion / déconnexion ---------- */
  async function login(username, password) {
    const res = await verify(username, password);
    if (!res.ok) { await AUDIT.log('LOGIN', 'auth', 'Échec connexion', 'admin', { username }); return res; }
    const session = createSession(res.user);
    await AUDIT.log('LOGIN', 'auth', 'Connexion', res.user.username, {});
    return { ok: true, session };
  }
  function logout() {
    const s = getSession();
    const user = s ? s.user : null;
    document && AUDIT.log('LOGOUT', 'auth', 'Déconnexion', user ? user.username : 'admin', {});
    clearSession();
    window.location.href = './index.html';
  }

  /* ---------- Garde de la page app.html ---------- */
  function guard() {
    const s = getSession();
    if (!s) { window.location.replace('./index.html'); return false; }
    return true;
  }

  /* ---------- Initialisation page login ---------- */
  async function init() {
    const form = Utils.$('#login-form');
    const verShow = (input, err, ok) => {
      if (!ok) { input.classList.add('invalid'); Utils.$(err).textContent = 'Ce champ est obligatoire.'; }
      else { input.classList.remove('invalid'); Utils.$(err).textContent = ''; }
      return ok;
    };
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = Utils.$('#login-user'), p = Utils.$('#login-pass');
        let ok = true;
        ok = verShow(u, '#err-user', u.value.trim() !== '') && ok;
        ok = verShow(p, '#err-pass', p.value !== '') && ok;
        if (!ok) return;
        const btn = Utils.$('#btn-login');
        btn.disabled = true; btn.textContent = 'Connexion...';
        const res = await login(u.value.trim(), p.value);
        if (res.ok) { window.location.href = './app.html'; return; }
        Utils.$('#err-general').textContent = res.error || 'Connexion impossible.';
        btn.disabled = false; btn.textContent = 'Se connecter';
      });
    }

    // Affichage / masquage du mot de passe
    const pw = Utils.$('#login-pass'), pwToggle = Utils.$('#pw-toggle');
    if (pw && pwToggle) {
      const eyeOpen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      const eyeOff = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      pwToggle.addEventListener('click', () => {
        const isPass = pw.type === 'password';
        pw.type = isPass ? 'text' : 'password';
        pwToggle.innerHTML = isPass ? eyeOff : eyeOpen;
        pwToggle.setAttribute('aria-label', isPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      });
    }

    // Vérification QR (page login)
    const vopen = Utils.$('#verify-overlay');
    const openVerif = () => { if (vopen) { vopen.classList.add('open'); if (Utils.$('#verify-code')) Utils.$('#verify-code').focus(); } };
    const closeVerif = () => { if (vopen) vopen.classList.remove('open'); };
    const vlink = Utils.$('#verify-link');
    if (vlink) vlink.addEventListener('click', (e) => { e.preventDefault(); openVerif(); });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => {
      const id = b.getAttribute('data-close'); const ov = document.getElementById(id); if (ov) ov.classList.remove('open');
    }));
    const vrun = Utils.$('#verify-run');
    const vcode = Utils.$('#verify-code');
    const vres = Utils.$('#verify-result');
    if (vrun) vrun.addEventListener('click', async () => {
      const code = (vcode.value || '').trim();
      if (!code) { vres.innerHTML = '<p class="muted">Saisissez une référence.</p>'; return; }
      try {
        await DB.init();
        const ordres = await DB.getAll('ordres');
        const ordre = ordres.find(o => String(o.reference).toUpperCase() === String(code).toUpperCase());
        if (ordre) {
          const ents = ordre.entrepriseIds && ordre.entrepriseIds.length ? await Promise.all(ordre.entrepriseIds.map(id => DB.get('entreprises', id))) : [];
          vres.innerHTML = `<div class="val-panel green"><div class="val-title">🟢 ORDRE TROUVÉ</div>
            <div class="kv"><dt>Numéro</dt><dd>${Utils.esc(ordre.reference)}</dd>
            <dt>Date</dt><dd>${Utils.fmtDate(ordre.date)}</dd>
            <dt>Mission</dt><dd>${Utils.esc(ordre.missionReference || '—')}</dd>
            <dt>Équipe</dt><dd>${Utils.esc(ordre.equipeNom || '—')}</dd>
            <dt>Entreprise(s)</dt><dd>${ents.filter(Boolean).map(e => Utils.esc(e.denomination)).join(', ') || '—'}</dd>
            <dt>Statut</dt><dd>${Utils.esc(ordre.statut)}</dd></div></div>`;
        } else {
          vres.innerHTML = `<div class="val-panel red"><div class="val-title">🔴 AUCUN ORDRE</div><div class="muted">Aucun ordre ne correspond à cette référence.</div></div>`;
        }
      } catch (e) {
        vres.innerHTML = `<div class="val-panel red"><div class="val-title">🔴 ERREUR</div><div class="muted">Impossible de vérifier : la base locale n'est pas disponible sur cet appareil.</div></div>`;
      }
    });
  }

  return { init, login, logout, verify, guard, getSession, clearSession, seedDefault, DEFAULT_ACCOUNT };
})();
