/* ==========================================================================
   IGT MISSIONS RDC — archives.js — Archives consultables (pas de suppression)
   ========================================================================== */
'use strict';

const ARCHIVES = (() => {
  const ARCHIVES_STORE = 'archives';

  async function getAllArchives() {
    let list = await DB.getAll(ARCHIVES_STORE);
    if (!list || !list.length) {
      // repli : missions archivées directement
      const missions = (await DB.getAll('missions')).filter((m) => m.statut === 'ARCHIVEE');
      list = missions.map((m) => Object.assign({}, m, { archivesLe: m.modifieLe }));
    }
    list.sort((a, b) => String(b.archivesLe || b.dateCreation).localeCompare(String(a.archivesLe || a.dateCreation)));
    return list;
  }
  async function getAllArchivedEntreprises() {
    return (await DB.getAll('entreprises')).filter((e) => e.archive);
  }

  const render = async function render(container) {
    const missions = await getAllArchives();
    const ordres = (await ORDRES.getAll()).filter((o) => o.archive);
    const entreprises = await getAllArchivedEntreprises();

    const tab = container.getAttribute('data-tab') || 'missions';
    container.innerHTML = `
      <h2 class="section-title">Archives</h2>
      <div class="tabs">
        <div class="tab ${tab === 'missions' ? 'active' : ''}" data-t="missions">Missions</div>
        <div class="tab ${tab === 'ordres' ? 'active' : ''}" data-t="ordres">Ordres</div>
        <div class="tab ${tab === 'entreprises' ? 'active' : ''}" data-t="entreprises">Entreprises</div>
      </div>
      <div class="card">
        <div class="muted" style="margin-bottom:10px">Les archives restent consultables. Aucune suppression définitive n'est possible.</div>
        <div id="arc-content">${renderTab(tab)}</div>
      </div>`;
    container.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { container.setAttribute('data-tab', t.getAttribute('data-t')); ARCHIVES.render(container); }));

    function renderTab(t) {
      if (t === 'missions') return missions.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Référence</th><th>Archivé le</th><th>Équipe</th><th>Entreprises</th><th>Période</th></tr></thead><tbody>${missions.map((m) => `<tr><td><strong>${Utils.esc(m.reference)}</strong></td><td>${Utils.fmtDate(m.archivesLe || m.dateCreation)}</td><td>${(m.equipeId || '').replace(/^EQP-/, '') ? 'Équipe ' + Utils.esc(m.equipeId.slice(-6)) : '—'}</td><td>${(m.entrepriseIds || []).length}</td><td>${Utils.fmtDate(m.dateDebut)} → ${Utils.fmtDate(m.dateFin)}</td></tr>`).join('')}</tbody></table></div>` : UI.emptyMessage(UI.icon('archives',26), 'Aucune mission archivée.');
      if (t === 'ordres') return ordres.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Numéro</th><th>Date</th><th>Équipe</th><th>Statut</th></tr></thead><tbody>${ordres.map((o) => `<tr><td><strong>${Utils.esc(o.reference)}</strong></td><td>${Utils.fmtDate(o.date)}</td><td>${Utils.esc(o.equipeNom || '—')}</td><td>${UI.badge(o.statut)}</td></tr>`).join('')}</tbody></table></div>` : UI.emptyMessage(UI.icon('archives',26), 'Aucun ordre archivé.');
      if (t === 'entreprises') return entreprises.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Dénomination</th><th>Province</th><th>Dernière visite</th><th>Statut</th></tr></thead><tbody>${entreprises.map((e) => `<tr><td><strong>${Utils.esc(e.denomination)}</strong></td><td>${Utils.esc(e.province || '—')}</td><td>${Utils.fmtDate(e.derniereVisite)}</td><td>${UI.badge(e.statut)}</td></tr>`).join('')}</tbody></table></div>` : UI.emptyMessage(UI.icon('archives',26), 'Aucune entreprise archivée.');
      return '';
    }
  };

  return { getAllArchives, getAllArchivedEntreprises, render };
})();
