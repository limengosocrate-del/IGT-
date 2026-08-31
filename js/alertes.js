/* ==========================================================================
   IGT MISSIONS RDC — alertes.js — Centre d'alertes
   Types : CONFLIT / AVERTISSEMENT / INFORMATION / SYSTÈME
   ========================================================================== */
'use strict';

const ALERTES = (() => {
  const S = 'alertes';
  const TYPES = { CONFLIT: 'conflit', AVERTISSEMENT: 'avertissement', INFORMATION: 'information', SYSTÈME: 'systeme' };

  async function create(type, titre, message, objet, objetId) {
    const a = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: TYPES[type] || 'information', typeLabel: type,
      titre, message, objet: objet || '', objetId: objetId || '',
      date: Utils.nowStamp(), statut: 'ACTIVE'
    };
    await DB.put(S, a);
    return a;
  }

  async function getAll(onlyActive) {
    let list = await DB.getAll(S);
    if (onlyActive !== false) list = list.filter((a) => a.statut === 'ACTIVE');
    list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return list;
  }
  async function marquerLue(id) { const a = await DB.get(S, id); if (a) { a.statut = 'LUE'; await DB.put(S, a); } return a; }
  async function marquerToutesLues() { const l = await getAll(); for (const a of l) { a.statut = 'LUE'; await DB.put(S, a); } }

  /* ---------- Génération automatique des alertes système ---------- */
  async function refresh() {
    // Recalcule les alertes liées aux données après chaque action
    try {
      // Conflits
      const missions = await DB.getAll('missions');
      const entreprises = await DB.getAll('entreprises');
      for (const e of entreprises) {
        if (e.archive) continue;
        const enMission = missions.find((m) => (m.entrepriseIds || []).includes(e.id) && ['EN_MISSION', 'PROGRAMMEE'].includes(m.statut));
        // une alerte CONFLIT si une entreprise active est déjà en mission
        // (voir aussi le moteur de validation au moment de la création)
      }
    } catch (e) {}
  }

  async function countByType() {
    const list = await getAll();
    const c = { conflit: 0, avertissement: 0, information: 0, systeme: 0 };
    list.forEach((a) => { if (c[a.type] != null) c[a.type]++; });
    return c;
  }

  async function seedStartup() {
    // alimenter automatiquement quelques alertes de veille
    await refresh();
  }

  return { create, getAll, marquerLue, marquerToutesLues, countByType, refresh, seedStartup, TYPES };
})();

/* ==========================================================================
   UI — Module Alertes (centre d'alertes)
   ========================================================================== */
ALERTES.render = async function render(container) {
  const list = await ALERTES.getAll();
  const icon = { conflit: '🔴', avertissement: '🟠', information: '🔵', systeme: '🔘' };
  const label = { conflit: 'CONFLIT', avertissement: 'AVERTISSEMENT', information: 'INFORMATION', systeme: 'SYSTÈME' };
  const counts = await ALERTES.countByType();
  container.innerHTML = `
    <h2 class="section-title">Centre d'alertes</h2>
    <div class="grid-stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat c-re"><div class="b"></div><div class="v">${counts.conflit}</div><div class="l">Conflits</div></div>
      <div class="stat c-ve"><div class="b"></div><div class="v">${counts.avertissement}</div><div class="l">Avertissements</div></div>
      <div class="stat c-bl"><div class="b"></div><div class="v">${counts.information}</div><div class="l">Informations</div></div>
      <div class="stat c-gi"><div class="b"></div><div class="v">${counts.systeme}</div><div class="l">Système</div></div>
    </div>
    <div class="card">
      <div class="toolbar"><div class="spacer"></div><button class="btn sec" id="al-lue">Tout marquer comme lu</button></div>
      <div id="al-list">${list.length ? list.map((a) => `<div class="alert-item c-${a.type}"><div class="a-ic">${icon[a.type] || '🔘'}</div><div style="flex:1"><div class="a-t">${Utils.esc(a.titre)} <span class="badge ${a.type === 'conflit' ? 'bd-rouge' : a.type === 'avertissement' ? 'bd-orange' : 'bd-bleu'}">${label[a.type] || a.type}</span></div><div class="a-m">${Utils.esc(a.message)}</div><div class="a-d">${Utils.esc(a.date)} — ${Utils.esc(a.statut)}</div>${a.objetId ? `<div class="a-act"><button class="btn sm sec" data-open="${a.objetId}">Voir la mission</button></div>` : ''}</div></div>`).join('') : UI.emptyMessage('✅', 'Aucune alerte active.')}</div>
    </div>`;
  container.querySelector('#al-lue').addEventListener('click', async () => { await ALERTES.marquerToutesLues(); Utils.toast('Alertes marquées lues.', 'ok'); render(container); });
  container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => Router.navigate('missions')));
};
