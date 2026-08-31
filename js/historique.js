/* ==========================================================================
   IGT MISSIONS RDC — historique.js — Historique & recherche globale
   ========================================================================== */
'use strict';

const HISTORIQUE = (() => {
  const fields = ['entreprise', 'agent', 'equipe', 'ordre', 'date', 'province', 'mission'];

  async function globalSearch(q, opts) {
    opts = opts || {};
    const nq = Utils.norm(q || '');
    const nk = Utils.normKey(q || '');

    const missions = await DB.getAll('missions');
    const entreprises = await DB.getAll('entreprises');
    const agents = await DB.getAll('agents');
    const equipes = await DB.getAll('equipes');
    const ordres = await DB.getAll('ordres');

    const matches = (str) => !nq || Utils.norm(str).includes(nq) || Utils.normKey(str).includes(nk);

    const resMissions = missions.filter((m) => matches(m.reference) || matches(m.objet) || matches(m.structure));
    const resEntreprises = entreprises.filter((e) => matches(e.denomination) || matches(e.rccm) || matches(e.ville) || matches(e.province));
    const resAgents = agents.filter((a) => matches(a.nom) || matches(a.matricule) || matches(a.grade));
    const resEquipes = equipes.filter((e) => matches(e.nom));
    const resOrdres = ordres.filter((o) => matches(o.reference));

    // combiner en entrées d'historique
    const entries = [];
    resMissions.forEach((m) => entries.push({ type: 'mission', date: m.dateDebut || m.dateCreation, titre: m.reference, sous: (m.objet || '').slice(0, 80), ref: m.id }));
    resEntreprises.forEach((e) => entries.push({ type: 'entreprise', date: e.derniereVisite || e.dateEnregistrement, titre: e.denomination, sous: (e.ville || '') + ' — ' + (e.province || ''), ref: e.id }));
    resAgents.forEach((a) => entries.push({ type: 'agent', date: a.derniereMission || a.creeLe, titre: a.nom + ' ' + (a.postnom || ''), sous: a.grade || a.fonction || '', ref: a.id }));
    resEquipes.forEach((e) => entries.push({ type: 'equipe', date: e.derniereMission || e.creeLe, titre: e.nom, sous: e.chefMission || '', ref: e.id }));
    resOrdres.forEach((o) => entries.push({ type: 'ordre', date: o.date, titre: o.reference, sous: o.equipeNom || '', ref: o.id }));

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { missions: resMissions, entreprises: resEntreprises, agents: resAgents, equipes: resEquipes, ordres: resOrdres, entries };
  }

  async function buildHistorique() {
    const hist = await DB.getAll('historique');
    hist.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return hist;
  }

  const render = async function render(container) {
    let q = '';
    async function draw() {
      const res = await globalSearch(q);
      container.innerHTML = `
        <h2 class="section-title">Historique</h2>
        <div class="card">
          <div class="toolbar">
            <div class="searchbox" style="flex:1;min-width:220px"><span class="si">${UI.icon('search',18)}</span><input id="hi-q" placeholder="Recherche globale (entreprise, agent, équipe, ordre, date, province, mission...)" value="${Utils.esc(q)}"/></div>
            <button class="btn sec" id="hi-reset">Réinitialiser</button>
          </div>
          <div id="hi-results">
            <div class="grid-stats" style="grid-template-columns:repeat(5,1fr)">
              ${[['Missions', res.missions.length], ['Entreprises', res.entreprises.length], ['Agents', res.agents.length], ['Équipes', res.equipes.length], ['Ordres', res.ordres.length]].map(([lab, n]) => `<div class="stat c-bl"><div class="b"></div><div class="v">${n}</div><div class="l">${lab}</div></div>`).join('')}
            </div>
            ${res.entries.length ? `<div class="muted" style="margin:6px 0 10px">${res.entries.length} résultat(s)</div>` : '<div class="muted">Saisissez un terme pour rechercher.</div>'}
            <div id="hi-entries">${res.entries.slice(0, 40).map((e) => `<div class="alert-item" data-type="${e.type}" data-ref="${e.ref}"><div class="a-ic">${iconFor(e.type)}</div><div style="flex:1"><div class="a-t">${Utils.esc(e.titre)}</div><div class="a-m">${Utils.esc(e.sous)}</div><div class="a-d">${Utils.fmtDate(e.date)}</div></div><button class="btn sm sec" data-jump="${e.type}:${e.ref}">Ouvrir</button></div>`).join('')}</div>
          </div>
        </div>`;
      container.querySelector('#hi-q').addEventListener('input', Utils.debounce(() => { q = container.querySelector('#hi-q').value; draw(); }, 250));
      container.querySelector('#hi-reset').addEventListener('click', () => { q=''; draw(); });
      container.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
        const [type, ref] = b.getAttribute('data-jump').split(':');
        const map = { mission: 'missions', entreprise: 'entreprises', agent: 'agents', equipe: 'equipes', ordre: 'ordres' };
        Router.navigate(map[type] || 'missions');
      }));
    }
    function iconFor(t) { return { mission: '🧭', entreprise: '🏢', agent: '👤', equipe: '👥', ordre: '📄' }[t] || '•'; }
    await draw();
  };

  return { globalSearch, buildHistorique, fields, render };
})();
