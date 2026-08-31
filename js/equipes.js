/* ==========================================================================
   IGT MISSIONS RDC — equipes.js — Module Équipes
   ========================================================================== */
'use strict';

const EQUIPES = (() => {
  const S = 'equipes';

  async function nextNum() {
    const all = await DB.getAll(S);
    let max = 0;
    all.forEach((r) => { const m = /EQP-(\d+)/.exec(r.id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function generateId() { return Utils.genId('EQP', await nextNum()); }

  async function createEquipe(data) {
    if (!data.nom) throw new Error('Le nom de l\'équipe est obligatoire.');
    const id = data.id || await generateId();
    const now = Utils.nowStamp();
    const record = Object.assign({
      id, nom: String(data.nom).trim(), chefMission: data.chefMission || '',
      membres: Array.isArray(data.membres) ? data.membres : [], structure: data.structure || '',
      province: data.province || '', statut: data.statut || 'DISPONIBLE',
      observations: data.observations || '', archive: false, creeLe: now, modifieLe: now
    }, data);
    await DB.put(S, record);
    await AUDIT.log('CREATE', 'equipes', 'Équipe créée', 'admin', { id, nom: record.nom });
    return record;
  }

  async function updateEquipe(id, data) {
    const e = await DB.get(S, id);
    if (!e) throw new Error('Équipe introuvable.');
    const d = Object.assign({}, e, data, { id, modifieLe: Utils.nowStamp() });
    await DB.put(S, d);
    await AUDIT.log('UPDATE', 'equipes', 'Équipe modifiée', 'admin', { id });
    return d;
  }

  async function getEquipe(id) { return (await DB.get(S, id)) || null; }
  async function getEquipes() { return (await DB.getAll(S)).sort((a, b) => String(a.nom).localeCompare(String(b.nom))); }

  async function desactiver(id) {
    const e = await getEquipe(id); if (!e) return;
    e.statut = 'INDISPONIBLE'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e); return e;
  }
  async function reactiver(id) {
    const e = await getEquipe(id); if (!e) return;
    e.statut = 'DISPONIBLE'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e); return e;
  }

  async function searchEquipes(query, opts) { return (await getEquipes()); }

  /* ---------- Contrôle de disponibilité (chevauchement) ---------- */
  async function equipeDisponible(equipeId, dateDebut, dateFin, excludeMissionId) {
    const missions = await DB.getAll('missions');
    const actives = missions.filter((m) => {
      if (excludeMissionId && m.id === excludeMissionId) return false;
      if (m.statut === 'ARCHIVÉE') return false;
      return true;
    });
    const conflicts = actives.filter((m) => m.equipeId === equipeId && Utils.inRange(m.dateDebut, m.dateFin, dateDebut, dateFin));
    return { disponible: conflicts.length === 0, conflicts };
  }

  /* Membres femmes/hommes */
  function getMembres(equipe) {
    return (equipe && equipe.membres) || [];
  }

  return { S, createEquipe, updateEquipe, getEquipe, getEquipes, desactiver, reactiver, searchEquipes, equipeDisponible, getMembres };
})();

/* ==========================================================================
   UI — Module Équipes
   ========================================================================== */
EQUIPES.render = async function render(container) {
  async function getAgentsOptions() {
    const ags = await AGENTS.searchAgents('', {});
    return ags.map((a) => ({ value: a.id, label: a.nom + ' ' + (a.postnom || '') + (a.prenom ? ' ' + a.prenom : '') }));
  }

  function fichier(e) {
    const e2 = e || { statut: 'DISPONIBLE', membres: [] };
    let html = '<div class="form-grid">';
    html += UI.field('Nom de l\'équipe *', UI.input('nom', e2.nom, 'Groupe 01'), { full: true });
    html += UI.field('Chef de mission', UI.select('chefMission', [''].concat((e2.chefMission ? [e2.chefMission] : []).concat(defaultChefs())), e2.chefMission));
    html += UI.field('Structure', UI.input('structure', e2.structure, ''));
    html += UI.field('Province', UI.input('province', e2.province, ''));
    html += UI.field('Statut', UI.select('statut', ['DISPONIBLE','INDISPONIBLE'], e2.statut || 'DISPONIBLE'));
    html += '</div>';
    html += UI.field('Membres (agents)', `<div id="eq-membres"></div>`, { full: true });
    html += UI.field('Observations', UI.textarea('observations', e2.observations, ''), { full: true });
    return html;
  }

  function defaultChefs() { return ['Chef d\'équipe','Inspecteur Principal'] ; }
  async function renderMembres(box, agOp, membres) {
    box.innerHTML = `<div id="eq-membres-list">${membres.map((m, i) => `<div class="pill-row" style="margin-bottom:6px"><select data-role="agent" data-i="${i}"><option value="">— Choisir un agent —</option>${agOp.map(o => `<option value="${o.value}" ${m===o.value?'selected':''}>${Utils.esc(o.label)}</option>`).join('')}</select> <button class="btn sm rouge" data-rm="${i}">✕</button></div>`).join('') || '<div class="muted">Aucun membre.</div>'}</div><button class="btn sm sec" id="eq-add-mb">+ Ajouter membre</button>`;
    box.querySelector('#eq-add-mb').addEventListener('click', () => { const cur = collectMembres(box); cur.push(''); renderMembres(box, agOp, cur); });
    box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { const cur = collectMembres(box); cur.splice(parseInt(b.getAttribute('data-rm'),10),1); renderMembres(box, agOp, cur); }));
  }
  function collectMembres(box) {
    return Array.from(box.querySelectorAll('[data-role="agent"]')).map((s) => s.value).filter(Boolean);
  }

  async function openForm(e) {
    const m = UI.modal({ title: e ? "Modifier l'équipe" : 'Créer une équipe', body: fichier(e), footer: '<button class="btn sec" id="eq-cancel">Annuler</button><button class="btn" id="eq-save">Enregistrer</button>' });
    const agOp = await getAgentsOptions();
    renderMembres(m.body.querySelector('#eq-membres'), agOp, (e && e.membres) || []);
    m.el.querySelector('#eq-cancel').addEventListener('click', m.close);
    m.el.querySelector('#eq-save').addEventListener('click', async () => {
      const d = UI.collect(m.body); d.membres = collectMembres(m.body);
      if (!d.nom) { Utils.toast('Le nom de l\'équipe est obligatoire.', 'err'); return; }
      try { if (e) await EQUIPES.updateEquipe(e.id, d); else await EQUIPES.createEquipe(d); m.close(); Utils.toast('Équipe enregistrée.', 'ok'); draw(); }
      catch (err) { Utils.toast(err.message, 'err'); }
    });
  }

  async function draw() {
    const list = await EQUIPES.getEquipes();
    container.innerHTML = `<h2 class="section-title">Équipes</h2>
      <div class="card"><div class="toolbar"><button class="btn" id="bt-add">+ Créer une équipe</button><div class="spacer"></div><span class="muted">Une équipe peut être réutilisée sur plusieurs missions.</span></div>
      <div id="eq-list">${renderList(list)}</div></div>`;
    container.querySelector('#bt-add').addEventListener('click', () => openForm());
    container.querySelectorAll('[data-eqedit]').forEach((b) => b.addEventListener('click', () => EQUIPES.getEquipe(b.getAttribute('data-eqedit')).then(openForm)));
    container.querySelectorAll('[data-eqdes]').forEach((b) => b.addEventListener('click', async () => { await EQUIPES.desactiver(b.getAttribute('data-eqdes')); Utils.toast('Équipe rendue indisponible.', 'ok'); draw(); }));
    container.querySelectorAll('[data-eqact]').forEach((b) => b.addEventListener('click', async () => { await EQUIPES.reactiver(b.getAttribute('data-eqact')); Utils.toast('Équipe réactivée.', 'ok'); draw(); }));
  }
  function renderList(list) {
    if (!list.length) return UI.emptyMessage('👥', 'Aucune équipe.');
    return `<div class="card-grid">${list.map((e) => `<div class="card" style="margin:0">
      <h3>${Utils.esc(e.nom)}</h3>
      <div class="kv"><dt>Chef de mission</dt><dd>${Utils.esc(e.chefMission || '—')}</dd>
      <dt>Structure</dt><dd>${Utils.esc(e.structure || '—')}</dd>
      <dt>Province</dt><dd>${Utils.esc(e.province || '—')}</dd>
      <dt>Statut</dt><dd>${UI.badge(e.statut)}</dd>
      <dt>Membres</dt><dd>${(e.membres || []).length}</dd></div>
      <div class="btnrow" style="margin-top:10px"><button class="btn sm sec" data-eqedit="${e.id}">Modifier</button>${e.statut==='DISPONIBLE'?'<button class="btn sm rouge" data-eqdes="'+e.id+'">Indisponible</button>':'<button class="btn sm vert" data-eqact="'+e.id+'">Disponible</button>'}</div>
    </div>`).join('')}</div>`;
  }
  await draw();
};
