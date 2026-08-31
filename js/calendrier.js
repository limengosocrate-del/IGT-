/* ==========================================================================
   IGT MISSIONS RDC — calendrier.js — Calendrier des missions (mois/semaine/jour/liste)
   ========================================================================== */
'use strict';

const CALENDRIER = (() => {
  let current = new Date();
  let view = 'mois';

  async function getData() {
    const missions = await DB.getAll('missions');
    const sorties = await Promise.all(missions.map(async (m) => {
      const eq = m.equipeId ? await EQUIPES.getEquipe(m.equipeId) : null;
      const ents = m.entrepriseIds ? await Promise.all(m.entrepriseIds.map((id) => ENTREPRISES.getEntreprise(id))) : [];
      return Object.assign({}, m, { equipeNom: eq ? eq.nom : '', entrepriseNoms: ents.filter(Boolean).map((e) => e.denomination) });
    }));
    return sorties;
  }

  function statusClass(s) {
    if (s === 'EN_MISSION') return 'c-enm';
    if (s === 'PROGRAMMEE') return 'c-prog';
    if (s === 'TERMINEE') return 'c-term';
    if (s === 'ARCHIVEE') return 'c-arch';
    if (s === 'BROUILLON') return 'c-av';
    return 'c-prog';
  }

  async function render(container) {
    const missions = await getData();
    const year = current.getFullYear(), month = current.getMonth();
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    container.innerHTML = `
      <h2 class="section-title">Calendrier des missions</h2>
      <div class="card">
        <div class="toolbar">
          <button class="btn sec" id="cal-prev">←</button>
          <div class="field" style="min-width:0"><label></label><input type="month" id="cal-mon" value="${year}-${String(month + 1).padStart(2, '0')}" /></div>
          <button class="btn sec" id="cal-next">→</button>
          <div class="spacer"></div>
          <span class="chip online">🟢 Disponible</span>
          <span class="badge bd-rouge">🔴 Conflit</span>
          <span class="badge bd-orange">🟠 Avertissement</span>
        </div>
        <div class="tabs">
          <div class="tab ${view === 'mois' ? 'active' : ''}" data-v="mois">Mois</div>
          <div class="tab ${view === 'semaine' ? 'active' : ''}" data-v="semaine">Semaine</div>
          <div class="tab ${view === 'liste' ? 'active' : ''}" data-v="liste">Liste</div>
        </div>
        <div id="cal-body" class="cal-wrap">${renderView(missions)}</div>
      </div>`;

    container.querySelector('#cal-prev').addEventListener('click', () => { current.setMonth(current.getMonth() - 1); render(container); });
    container.querySelector('#cal-next').addEventListener('click', () => { current.setMonth(current.getMonth() + 1); render(container); });
    container.querySelector('#cal-mon').addEventListener('change', (e) => { const [y, mo] = e.target.value.split('-').map(Number); current = new Date(y, mo - 1, 1); render(container); });
    container.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { view = t.getAttribute('data-v'); render(container); }));

    function renderView(missions) {
      if (view === 'liste') {
        const m = missions.filter((x) => x.dateDebut && String(x.dateDebut).startsWith(year + '-' + String(month + 1).padStart(2, '0')));
        if (!m.length) return UI.emptyMessage(UI.icon('calendrier',26), 'Aucune mission ce mois.');
        return m.map((x) => `<div class="alert-item"><div class="a-ic">${x.statut === 'EN_MISSION' ? '🔴' : x.statut === 'TERMINEE' ? '✅' : '🔵'}</div><div style="flex:1"><div class="a-t">${Utils.esc(x.reference)} — ${Utils.esc(x.equipeNom || '')}</div><div class="a-m">${Utils.fmtDate(x.dateDebut)} → ${Utils.fmtDate(x.dateFin)} — ${(x.entrepriseNoms || []).join(', ')}</div><div class="a-d">${UI.badge(x.statut)}</div></div></div>`).join('');
      }
      // vue mois
      let grid = '<div class="cal-grid">';
      ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((d) => grid += `<div class="cal-cell hd">${d}</div>`);
      const startIndex = (startDow + 6) % 7; // lundi = 0
      for (let i = 0; i < startIndex; i++) grid += '<div class="cal-cell off"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayMissions = missions.filter((m) => m.dateDebut && m.dateFin && Utils.inRange(m.dateDebut, m.dateFin, iso, iso));
        let cell = `<div class="cal-cell"><div class="dnum">${d}</div>`;
        dayMissions.forEach((m) => { cell += `<div class="cal-ev ${statusClass(m.statut)}" data-m="${m.id}" title="${Utils.esc(m.reference)} — ${Utils.esc(m.equipeNom || '')}">${Utils.esc(m.reference)}</div>`; });
        cell += '</div>';
        grid += cell;
      }
      grid += '</div>';
      return grid;
    }
    container.querySelectorAll('.cal-ev').forEach((e) => e.addEventListener('click', () => Router.navigate('missions')));
  }

  return { render };
})();
