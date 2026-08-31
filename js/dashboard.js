/* ==========================================================================
   IGT MISSIONS RDC — dashboard.js — Tableau de bord institutionnel (temps réel)
   ========================================================================== */
'use strict';

const DASHBOARD = (() => {
  async function computeStats() {
    const entreprises = (await DB.getAll('entreprises')).filter((e) => !e.archive);
    const missions = await DB.getAll('missions');
    const agents = (await DB.getAll('agents')).filter((a) => a.actif !== false);
    const ordres = await DB.getAll('ordres');
    const aujourdhui = Utils.todayISO();
    const moisAvert = await MISSIONS.recentWindowMonths();

    const enMission = entreprises.filter((e) => e.statut === 'EN_MISSION').length;

    const limite = Utils.addMonths(aujourdhui, -moisAvert);
    const visiteesRecement = entreprises.filter((e) => e.derniereVisite && String(e.derniereVisite) >= String(limite)).length;

    const enCours = missions.filter((m) => m.statut === 'EN_MISSION').length;
    const programmees = missions.filter((m) => m.statut === 'PROGRAMMEE').length;
    const terminees = missions.filter((m) => m.statut === 'TERMINEE').length;
    const annulees = missions.filter((m) => m.statut === 'ANNULEE').length;
    const brouillons = missions.filter((m) => m.statut === 'BROUILLON').length;

    const alerts = await ALERTES.getAll();
    const conflits = alerts.filter((a) => a.type === 'conflit').length;

    return {
      totalEntreprises: entreprises.length, enMission, visiteesRecement,
      enCours, programmees, terminees, annulees, brouillons,
      agentsActifs: agents.length, totalMissions: missions.length, ordres: ordres.length,
      conflits, alertes: alerts.length, totalAlertes: alerts.length, moisAvert
    };
  }

  async function upcoming() {
    const missions = await DB.getAll('missions');
    const aujourdhui = Utils.todayISO();
    const list = missions
      .filter((m) => (m.statut === 'PROGRAMMEE' || m.statut === 'EN_MISSION') && (m.dateFin || '') >= aujourdhui)
      .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)))
      .slice(0, 6);
    const out = [];
    for (const m of list) {
      const eq = m.equipeId ? await EQUIPES.getEquipe(m.equipeId) : null;
      const ents = m.entrepriseIds ? (await Promise.all(m.entrepriseIds.map((id) => ENTREPRISES.getEntreprise(id)))).filter(Boolean) : [];
      out.push(Object.assign({}, m, { equipeNom: eq ? eq.nom : '', entrepriseNoms: ents.map((e) => e.denomination) }));
    }
    return out;
  }

  function statClassFor(name) {
    return { c1: 'c-bleu', c2: 'c-cyan', c3: 'c-or', c4: 'c-vert', c5: 'c-rouge', c6: 'c-violet' }[name] || 'c-bleu';
  }

  async function render(container) {
    const s = await computeStats();
    const up = await upcoming();

    container.innerHTML = `
      ${SLIDES.widget()}
      ${tileGrid()}
      <div class="welcome-banner">
        <div class="wb-ic">${UI.icon('dashboard', 26)}</div>
        <div style="flex:1">
          <h2>Tableau de bord</h2>
          <p>Vue d'ensemble en temps réel du Système de Gestion et de Planification des Missions de l'Inspection Générale du Travail RDC</p>
        </div>
        <div class="wb-dec"></div><div class="wb-dec2"></div>
      </div>

      <div class="grid-stats">
        ${statCard('c-bleu', 'user', s.agentsActifs, 'Agents', 'enregistrés', 0)}
        ${statCard('c-cyan', 'flag', s.totalMissions, 'Missions', 'au total', 1)}
        ${statCard('c-or', 'missions', s.enCours + s.programmees, 'Missions planifiées', 'en cours + à venir', 2)}
        ${statCard('c-vert', 'building', s.totalEntreprises, 'Entreprises', 'contrôlées', 3)}
        ${statCard('c-rouge', 'ordres', s.ordres, 'Ordres de mission', 'générés', 4)}
        ${statCard('c-violet', 'alertes', s.totalAlertes, 'Alertes', s.conflits ? 'dont ' + s.conflits + ' conflit(s)' : 'aucune alerte', 5)}
      </div>

      <div class="dash-grid">
        <div class="card">
          <h3><span class="ci">${UI.icon('statistiques', 18)}</span>Activité des missions</h3>
          ${renderChart(s)}
          <div class="chart-legend">
            <span class="li"><span class="sq" style="background:var(--bleu-3)"></span>En cours</span>
            <span class="li"><span class="sq" style="background:var(--cyan)"></span>Programmées</span>
            <span class="li"><span class="sq" style="background:var(--vert)"></span>Terminées</span>
            <span class="li"><span class="sq" style="background:var(--gris-texte)"></span>Annulées</span>
          </div>
        </div>

        <div class="card">
          <h3><span class="ci">${UI.icon('calendrier', 18)}</span>Prochaines missions</h3>
          ${up.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Mission</th><th>Équipe</th><th>Province</th><th>Début</th><th>Fin</th><th>Statut</th></tr></thead><tbody>
            ${up.map((m) => `<tr><td><div class="cell-primary">${Utils.esc(m.reference)}</div><div class="cell-sub">${Utils.esc((m.entrepriseNoms || []).slice(0, 2).join(', '))}${(m.entrepriseNoms || []).length > 2 ? '…' : ''}</div></td><td>${Utils.esc(m.equipeNom || '—')}</td><td>${Utils.esc(m.province || '—')}</td><td>${Utils.fmtDate(m.dateDebut)}</td><td>${Utils.fmtDate(m.dateFin)}</td><td>${UI.badge(m.statut)}</td></tr>`).join('')}
          </tbody></table></div>` : UI.emptyMessage(UI.icon('calendrier', 26), 'Aucune mission à venir.')}
        </div>

        <div class="card full">
          <h3><span class="ci">${UI.icon('historique', 18)}</span>Activité récente</h3>
          <div id="dash-activity">chargement...</div>
        </div>
      </div>`;

    bind(container);
    loadActivity(container.querySelector('#dash-activity'));
    try { SLIDES.start(container); } catch (e) {}
  }

  /* Menu en tuiles (grille d'accès rapide) — mode d'affichage type application */
  function tileGrid() {
    const tiles = [
      { route: 'agents', icon: 'user', label: 'Agents' },
      { route: 'entreprises', icon: 'building', label: 'Entreprises' },
      { route: 'equipes', icon: 'users', label: 'Équipes' },
      { route: 'missions', icon: 'flag', label: 'Missions' },
      { route: 'ordres', icon: 'ordres', label: 'Ordres de mission' },
      { route: 'calendrier', icon: 'calendrier', label: 'Calendrier' },
      { route: 'historique', icon: 'historique', label: 'Historique' },
      { route: 'statistiques', icon: 'statistiques', label: 'Statistiques' },
      { route: 'archives', icon: 'archives', label: 'Archives' },
      { route: 'alertes', icon: 'bell', label: 'Alertes' },
      { route: 'parametres', icon: 'parametres', label: 'Paramètres' }
    ];
    return `<div class="home-tiles"><div class="ht-label">${UI.icon('dashboard', 18)} Espaces de gestion</div>
      <div class="ht-grid">${tiles.map((t) => `<a class="htile" data-route="${t.route}"><span class="hti">${UI.icon(t.icon, 26)}</span><span class="htn">${t.label}</span></a>`).join('')}</div>
    </div>`;
  }

  function statCard(cls, icon, value, label, sub, delay) {
    return `<div class="stat ${cls}" style="animation-delay:${delay * 60}ms"><div class="b"></div>
      <div class="ico">${UI.icon(icon, 20)}</div>
      <div class="v">${value}</div><div class="l">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }

  function renderChart(s) {
    const data = [
      { label: 'En cours', v: s.enCours, cls: 'b-enm' },
      { label: 'Programmées', v: s.programmees, cls: 'b-prog' },
      { label: 'Terminées', v: s.terminees, cls: 'b-term' },
      { label: 'Annulées', v: s.annulees, cls: 'b-cancel' }
    ];
    if (!data.some((d) => d.v > 0)) {
      return `<div class="chart-bars" style="height:180px;align-items:center;justify-content:center">${UI.emptyMessage(UI.icon('statistiques', 26), 'Aucune mission — créez votre première mission.')}</div>`;
    }
    const max = Math.max(30, ...data.map((d) => d.v));
    return `<div class="chart-bars">${data.map((d) => `
      <div class="chart-col"><div class="val-m">${d.v}</div><div class="bar ${d.cls}" style="height:${Math.round(d.v / max * 100)}%"></div><div class="lb">${d.label}</div></div>`).join('')}</div>`;
  }

  function bind(container) {
    const q = (id) => container.querySelector('#' + id);
    const qa = (id) => { const el = q(id); if (el) el.addEventListener('click', () => Router.navigate(id.replace('qa-', ''))); };
    qa('qa-mission'); qa('qa-entreprise'); qa('qa-agent'); qa('qa-equipe'); qa('qa-ordres'); qa('qa-hist');
    container.querySelectorAll('.htile[data-route]').forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); Router.navigate(t.getAttribute('data-route')); }));
  }

  async function loadActivity(el) {
    try {
      const logs = await AUDIT.getAll();
      const relevant = logs.filter((l) => ['CREATE', 'VALIDATE', 'PRINT', 'ARCHIVE', 'UPDATE', 'LOGIN', 'IMPORT'].includes(l.type)).slice(0, 9);
      if (!relevant.length) { el.innerHTML = UI.emptyMessage(UI.icon('historique', 26), 'Aucune activité enregistrée.'); return; }
      const ic = { CREATE: 'g', VALIDATE: 'o', PRINT: 'b', ARCHIVE: 'r', UPDATE: '', LOGIN: 'b', IMPORT: 'g' };
      el.innerHTML = `<ul class="timeline">${relevant.map((l) => `
        <li><span class="tm-ic ${ic[l.type] || ''}">${iconForAction(l.type)}</span>
          <div style="flex:1"><div class="tm-t">${titleForAction(l, relevant)}</div><div class="tm-d">${l.module ? 'Module ' + Utils.esc(l.module) : ''}${l.identifiant ? ' — ' + Utils.esc(l.identifiant) : ''}</div></div>
          <span class="tm-time">${Utils.fmtDate(l.date)} — ${Utils.esc(l.heure)}</span></li>`).join('')}</ul>`;
    } catch (e) { el.innerHTML = UI.emptyMessage(UI.icon('historique', 26), 'Aucune activité.'); }
  }
  function iconForAction(t) { return UI.icon({ CREATE: 'plus', VALIDATE: 'check', PRINT: 'print', ARCHIVE: 'archives', UPDATE: 'edit', LOGIN: 'user', IMPORT: 'download' }[t] || 'dot', 17); }
  function titleForAction(l, all) {
    const map = {
      'Mission créée': 'Création d\'une mission', 'Mission validée': 'Validation d\'une mission',
      'Ordre imprimé': 'Ordre de mission imprimé', 'Mission archivée': 'Mission archivée',
      'Connexion': 'Connexion au système', 'Déconnexion': 'Déconnexion',
      'Export de la base': 'Export de la base', 'Import de la base': 'Import de la base'
    };
    return Utils.esc(map[l.objet] || l.objet || l.type);
  }

  return { render, computeStats };
})();
