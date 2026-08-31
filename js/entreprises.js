/* ==========================================================================
   IGT MISSIONS RDC — entreprises.js — Module Entreprises
   createEntreprise() updateEntreprise() getEntreprise() searchEntreprises() ...
   ========================================================================== */
'use strict';

const ENTREPRISES = (() => {
  const S = 'entreprises';

  async function nextNum() {
    const all = await DB.getAll(S);
    let max = 0;
    all.forEach((r) => { const m = /ENT-(\d+)/.exec(r.id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function generateId() {
    const n = await nextNum();
    return Utils.genId('ENT', n);
  }

  function defaultStatus() { return 'DISPONIBLE'; }

  /* ---------- CRUD ---------- */
  async function createEntreprise(data) {
    const d = normalize(data);
    if (!d.denomination) throw new Error('La dénomination est obligatoire.');
    const id = d.id || await generateId();
    const now = Utils.nowStamp();
    const record = Object.assign({
      id, denomination: d.denomination, rccm: d.rccm || '', idNational: d.idNational || '',
      numFiscal: d.numFiscal || '', province: d.province || '', ville: d.ville || '',
      commune: d.commune || '', adresse: d.adresse || '', secteur: d.secteur || '',
      telephone: d.telephone || '', email: d.email || '', responsable: d.responsable || '',
      dateEnregistrement: d.dateEnregistrement || Utils.todayISO(), statut: d.statut || defaultStatus(),
      observations: d.observations || '', derniereVisite: d.derniereVisite || '', derniereEquipe: d.derniereEquipe || '',
      archive: d.archive || false, creeLe: now, modifieLe: now
    }, d);
    await DB.put(S, record);
    await AUDIT.log('CREATE', 'entreprises', 'Entreprise créée', 'admin', { id, denomination: record.denomination });
    return record;
  }

  async function updateEntreprise(id, data) {
    const existing = await DB.get(S, id);
    if (!existing) throw new Error('Entreprise introuvable.');
    const d = Object.assign({}, existing, normalize(data), { id, modifieLe: Utils.nowStamp() });
    await DB.put(S, d);
    await AUDIT.log('UPDATE', 'entreprises', 'Entreprise modifiée', 'admin', { id, denomination: d.denomination });
    return d;
  }

  async function getEntreprise(id) { const r = await DB.get(S, id); return r || null; }
  async function getEntreprises() { return (await DB.getAll(S)).sort((a, b) => String(a.denomination).localeCompare(String(b.denomination))); }

  /* Archives (pas de suppression) */
  async function archiveEntreprise(id) {
    const e = await getEntreprise(id);
    if (!e) throw new Error('Entreprise introuvable.');
    e.archive = true; e.statut = 'ARCHIVÉE'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e);
    await AUDIT.log('ARCHIVE', 'entreprises', 'Entreprise archivée', 'admin', { id });
    return e;
  }
  async function dearchiveEntreprise(id) {
    const e = await getEntreprise(id);
    if (!e) throw new Error('Entreprise introuvable.');
    e.archive = false; e.statut = 'DISPONIBLE'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e);
    await AUDIT.log('UPDATE', 'entreprises', 'Entreprise désarchivée', 'admin', { id });
    return e;
  }

  /* ---------- Normalisation ---------- */
  function normalize(data) {
    const d = Object.assign({}, data || {});
    if (d.denomination) d.denomination = String(d.denomination).replace(/\s+/g, ' ').trim();
    ['rccm', 'idNational', 'numFiscal'].forEach((k) => { if (d[k]) d[k] = Utils.normKey(d[k]); });
    return d;
  }

  /* ---------- Détection de doublons ---------- */
  function similarityScore(a, fields) {
    // compare a (objet propre ou <input>) aux entreprises existantes
    return fields;
  }
  async function findDoublon(candidate) {
    const all = await getEntreprises();
    const c = normalize(candidate);
    const nk = (v) => Utils.normKey(v);
    const list = all.filter((e) => !e.archive);
    let best = null, bestScore = 0;
    for (const e of list) {
      let score = 0;
      if (c.denomination && nk(e.denomination) === nk(c.denomination)) score += 8;
      else if (c.denomination && nk(e.denomination) && nk(c.denomination).includes(nk(e.denomination))) score += 4;
      if (c.rccm && nk(e.rccm) === nk(c.rccm) && nk(c.rccm)) score += 6;
      if (c.idNational && nk(e.idNational) === nk(c.idNational)) score += 5;
      if (c.numFiscal && nk(e.numFiscal) === nk(c.numFiscal)) score += 5;
      if (score >= 4 && score > bestScore) { bestScore = score; best = { entreprise: e, score }; }
    }
    return best;
  }

  /* ---------- Recherche ---------- */
  async function searchEntreprises(query, opts) {
    opts = opts || {};
    let all = await getEntreprises();
    if (opts.onlyActive !== false) all = all.filter((e) => !e.archive);
    const q = Utils.norm(query || '');
    if (q) {
      const nq = Utils.normKey(q);
      all = all.filter((e) => {
        const hay = Utils.normKey([e.denomination, e.rccm, e.idNational, e.numFiscal, e.ville, e.province, e.secteur, e.responsable].join('|'));
        const hy = Utils.norm([e.denomination, e.ville, e.province, e.secteur].join(' '));
        return hay.includes(nq) || hy.includes(q);
      });
    }
    if (opts.statut) all = all.filter((e) => String(e.statut) === opts.statut);
    if (opts.province) all = all.filter((e) => String(e.province) === opts.province);
    if (opts.secteur) all = all.filter((e) => String(e.secteur) === opts.secteur);
    return all;
  }

  /* ---------- Statut calculé ---------- */
  function computeStatus(ent, enMission) {
    if (ent.archive) return 'ARCHIVÉE';
    if (enMission) return 'EN MISSION';
    if (ent.statut === 'VISITÉE RÉCEMMENT') return 'VISITÉE RÉCEMMENT';
    if (ent.statut === 'SOUS SUIVI') return 'SOUS SUIVI';
    return 'DISPONIBLE';
  }

  /* ---------- Dernière visite ---------- */
  async function getDerniereVisite(ent) {
    // retourne { date, equipeNom, ordreReference }
    return { date: ent.derniereVisite || '', equipeNom: ent.derniereEquipe || '' };
  }

  async function setDerniereVisite(id, date, equipeNom, ordreRef) {
    const e = await getEntreprise(id);
    if (!e) return;
    e.derniereVisite = date || Utils.todayISO();
    if (equipeNom) e.derniereEquipe = equipeNom;
    e.modifieLe = Utils.nowStamp();
    await DB.put(S, e);
  }

  /* ---------- Import (collage / CSV / JSON / TXT) ---------- */
  async function importList(lines) {
    const results = { total: 0, created: 0, doublons: 0, invalides: 0, vides: 0, errors: [] };
    const seen = [];
    for (const raw of lines) {
      const line = String(raw == null ? '' : raw).trim();
      if (!line) { results.vides++; continue; }
      results.total++;
      const candidate = parseLine(line);
      if (!candidate.denomination) { results.invalides++; results.errors.push('Ligne sans dénomination : ' + line); continue; }
      if (seen.some((s) => Utils.normKey(s) === Utils.normKey(candidate.denomination))) { results.doublons++; results.errors.push('Doublon interne (liste) : ' + line); continue; }
      const dup = await findDoublon(candidate);
      if (dup) { results.doublons++; results.errors.push('Doublon existant : ' + line + ' → ' + dup.entreprise.denomination); continue; }
      seen.push(candidate.denomination);
      await createEntreprise(candidate);
      results.created++;
    }
    return results;
  }

  function parseLine(line) {
    // Format supporté: Dénomination | RCCM | IDNat | N°Fiscal | Province | Ville | Secteur
    let cols = line.split(/[|;,\t]/).map((c) => c.trim());
    if (cols.length === 1) return { denomination: line };
    return {
      denomination: cols[0] || '',
      rccm: cols[1] || '',
      idNational: cols[2] || '',
      numFiscal: cols[3] || '',
      province: cols[4] || '',
      ville: cols[5] || '',
      secteur: cols[6] || ''
    };
  }

  /* ---------- Parsing fichier ---------- */
  async function parseFileText(text, filename) {
    const isJson = /\.json$/i.test(filename || '');
    const isCsv = /\.(csv|txt)$/i.test(filename || '');
    if (isJson) {
      try { const arr = JSON.parse(text); return Array.isArray(arr) ? arr : [arr]; }
      catch (e) { throw new Error('Fichier JSON invalide.'); }
    }
    if (isCsv) {
      // CSV simple: tête avec en-têtes reconnues
      const rows = String(text).split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
      const first = rows[0] || '';
      const hasHeader = /denomination|nom|rccm|province/i.test(first) && /[;|,]/.test(first);
      const start = hasHeader ? 1 : 0;
      return rows.slice(start).map((r) => {
        const parts = r.split(/[;|,]/).map((c) => c.trim());
        return { denomination: parts[0] || '', rccm: parts[1] || '', idNational: parts[2] || '', numFiscal: parts[3] || '', province: parts[4] || '', ville: parts[5] || '', secteur: parts[6] || '' };
      });
    }
    // txt -> lignes
    return String(text).split(/\r?\n/).filter((l) => l.trim());
  }

  /* ---------- Historique d'une entreprise ---------- */
  async function getHistorique(id) {
    const missions = await DB.getAll('missions');
    const rels = await DB.getAll('missionEntreprises');
    const result = [];
    for (const rel of rels) {
      if (rel.entrepriseId !== id) continue;
      const m = missions.find((x) => x.id === rel.missionId);
      if (m) result.push(Object.assign({}, m));
    }
    result.sort((a, b) => String(b.dateDebut).localeCompare(String(a.dateDebut)));
    return result;
  }

  return {
    S, createEntreprise, updateEntreprise, getEntreprise, getEntreprises,
    archiveEntreprise, dearchiveEntreprise, findDoublon, searchEntreprises,
    normalize, computeStatus, getDerniereVisite, setDerniereVisite,
    importList, parseLine, parseFileText, getHistorique, defaultStatus
  };
})();

/* ==========================================================================
   UI — Module Entreprises
   ========================================================================== */
ENTREPRISES.render = async function render(container) {
  const state = { q: '', statut: '', province: '' };

  const fichier = (e, provs) => {
    const fields = [
      ['denomination', 'Dénomination', e.denomination, 'text', true],
      ['rccm', 'RCCM', e.rccm, 'text', false],
      ['idNational', 'ID National', e.idNational, 'text', false],
      ['numFiscal', 'Numéro fiscal', e.numFiscal, 'text', false],
      ['province', 'Province', e.province, 'select', false],
      ['ville', 'Ville', e.ville, 'text', false],
      ['commune', 'Commune', e.commune, 'text', false],
      ['adresse', 'Adresse', e.adresse, 'text', false],
      ['secteur', "Secteur d'activité", e.secteur, 'text', false],
      ['telephone', 'Téléphone', e.telephone, 'text', false],
      ['email', 'Email', e.email, 'text', false],
      ['responsable', 'Responsable', e.responsable, 'text', false],
      ['dateEnregistrement', "Date d'enregistrement", e.dateEnregistrement, 'date', false],
      ['statut', 'Statut', e.statut, 'select', false],
      ['observations', 'Observations', e.observations, 'textarea', false]
    ];
    let html = '<div class="form-grid">';
    fields.forEach(([name, label, val, type, req]) => {
      let input;
      if (type === 'select') input = UI.select(name, (name === 'statut' ? ['DISPONIBLE', 'EN MISSION', 'VISITÉE RÉCEMMENT', 'SOUS SUIVI', 'ARCHIVÉE'] : provs), val);
      else if (type === 'textarea') input = UI.textarea(name, val, label);
      else input = UI.input(name, val, label, type);
      html += UI.field(label + (req ? ' *' : ''), input, { full: name === 'denomination' || name === 'observations' });
    });
    return html + '</div>';
  };

  async function openForm(e) {
    const e2 = e || { statut: 'DISPONIBLE', dateEnregistrement: Utils.todayISO() };
    const provs = await PROVINCES_PROVIDER();
    const m = UI.modal({ title: e ? 'Modifier l\'entreprise' : 'Ajouter une entreprise', body: fichier(e2, provs), footer: `<button class="btn sec" id="md-cancel">Annuler</button><button class="btn" id="md-save">Enregistrer</button>` });
    m.el.querySelector('#md-cancel').addEventListener('click', m.close);
    const save = () => {
      const data = UI.collect(m.body);
      if (!data.denomination) { Utils.toast('La dénomination est obligatoire.', 'err'); return; }
      ENTREPRISES.findDoublon(data).then(async (dup) => {
        if (dup && !e) {
          const c = await UI.confirmOk(`⚠️ <strong>Entreprise existante</strong><br/>Une entreprise similaire existe déjà : <strong>${Utils.esc(dup.entreprise.denomination)}</strong><br/><br/>Voulez-vous consulter cette entreprise au lieu de la re-créer ?`, 'Entreprise existante', 'Consulter', true);
          if (c) { m.close(); openDetail(dup.entreprise.id); }
          return;
        }
        try {
          if (e) await ENTREPRISES.updateEntreprise(e.id, data);
          else await ENTREPRISES.createEntreprise(data);
          m.close(); Utils.toast('Entreprise enregistrée.', 'ok'); renderAgain();
        } catch (err) { Utils.toast(err.message, 'err'); }
      });
    };
    m.el.querySelector('#md-save').addEventListener('click', save);
  }

  async function openDetail(id) {
    const e = await ENTREPRISES.getEntreprise(id);
    const hist = await ENTREPRISES.getHistorique(id);
    const m = UI.modal({ title: 'Dossier entreprise', wide: true, body: '', footer: `<button class="btn sec" id="dt-close">Fermer</button>` });
    m.body.innerHTML = `
      <div class="tabs">
        <div class="tab active" data-tab="info">Informations</div>
        <div class="tab" data-tab="hist">Historique</div>
        <div class="tab" data-tab="missions">Missions</div>
        <div class="tab" data-tab="ordres">Ordres</div>
      </div>
      <div id="dt-content"><div class="kv">
        <dt>Dénomination</dt><dd>${Utils.esc(e.denomination)}</dd>
        <dt>RCCM</dt><dd>${Utils.esc(e.rccm || '—')}</dd>
        <dt>ID National</dt><dd>${Utils.esc(e.idNational || '—')}</dd>
        <dt>N° fiscal</dt><dd>${Utils.esc(e.numFiscal || '—')}</dd>
        <dt>Province</dt><dd>${Utils.esc(e.province || '—')}</dd>
        <dt>Ville / Commune</dt><dd>${Utils.esc((e.ville || '—') + ' / ' + (e.commune || '—'))}</dd>
        <dt>Secteur</dt><dd>${Utils.esc(e.secteur || '—')}</dd>
        <dt>Responsable</dt><dd>${Utils.esc(e.responsable || '—')}</dd>
        <dt>Statut</dt><dd>${UI.badge(e.statut)}</dd>
        <dt>Dernière visite</dt><dd>${Utils.fmtDate(e.derniereVisite)}</dd>
      </div></div>`;
    const tabs = ['info', 'hist', 'missions', 'ordres'];
    m.body.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', async () => {
      m.body.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active');
      const c = m.body.querySelector('#dt-content');
      const tab = t.getAttribute('data-tab');
      if (tab === 'info') c.innerHTML = `<div class="kv"><dt>Dénomination</dt><dd>${Utils.esc(e.denomination)}</dd><dt>RCCM</dt><dd>${Utils.esc(e.rccm || '—')}</dd><dt>Statut</dt><dd>${UI.badge(e.statut)}</dd><dt>Dernière visite</dt><dd>${Utils.fmtDate(e.derniereVisite)}</dd></div>`;
      else if (tab === 'missions') c.innerHTML = hist.map((h) => `<div class="alert-item"><div><div class="a-t">${Utils.esc(h.reference)}</div><div class="a-m">${Utils.fmtDate(h.dateDebut)} → ${Utils.fmtDate(h.dateFin)} — ${UI.badge(h.statut)}</div></div></div>`).join('') || UI.emptyMessage('🧭', 'Aucune mission.');
      else if (tab === 'hist') c.innerHTML = hist.map((h) => `<div class="alert-item"><div class="a-ic">${h.statut === 'TERMINEE' ? '✅' : '🔄'}</div><div><div class="a-t">${Utils.fmtDate(h.dateDebut)} — ${Utils.esc(h.reference)}</div><div class="a-m">${UI.badge(h.statut)}</div></div></div>`).join('') || UI.emptyMessage(UI.icon('historique',26), 'Aucune donnée.');
      else if (tab === 'ordres') c.innerHTML = UI.emptyMessage(UI.icon('ordres',26), 'Aucun ordre.');;
    }));
    m.el.querySelector('#dt-close').addEventListener('click', m.close);
  }

  async function openCollage() {
    const m = UI.modal({ title: 'Collage multiple d\'entreprises', body: `<div class="field"><label>Collez votre liste ici...</label><textarea id="paste-area" rows="10" placeholder="ABC SARL&#10;DEF SARL&#10;GHI SARL"></textarea></div><div id="paste-result"></div>`, footer: `<button class="btn sec" id="pc-cancel">Annuler</button><button class="btn" id="pc-analyze">Analyser</button><button class="btn vert" id="pc-import" disabled>Importer</button>` });
    m.el.querySelector('#pc-cancel').addEventListener('click', m.close);
    let pending = [];
    m.el.querySelector('#pc-analyze').addEventListener('click', async () => {
      const lines = m.body.querySelector('#paste-area').value.split(/\r?\n/).filter((l) => l.trim());
      // analyse sans importer :
      const results = { total: lines.length, created: 0, doublons: 0, vides: 0, errors: [] };
      const seen = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) { results.vides++; continue; }
        const cand = ENTREPRISES.parseLine(line);
        if (!cand.denomination) { results.errors.push('Ligne sans dénomination : ' + line); continue; }
        if (seen.some((s) => Utils.normKey(s) === Utils.normKey(cand.denomination))) { results.doublons++; continue; }
        const dup = await ENTREPRISES.findDoublon(cand);
        if (dup) { results.doublons++; results.errors.push('Doublon : ' + line); continue; }
        seen.push(cand.denomination); results.created++;
        pending.push(cand);
      }
      m.body.querySelector('#paste-result').innerHTML = `<div class="val-panel ${results.doublons ? 'orange' : 'green'}"><strong>${results.total}</strong> lignes détectées<br/><strong>${results.created}</strong> nouvelles — <strong>${results.doublons}</strong> doublons — <strong>${results.vides}</strong> lignes vides${results.errors.length ? '<br/><span class="muted">' + results.errors.slice(0,4).map(Utils.esc).join('<br/>') + '</span>' : ''}</div>`;
      m.el.querySelector('#pc-import').disabled = results.created === 0;
      m.el.querySelector('#pc-import').dataset.count = results.created;
      m.el.querySelector('#pc-import').textContent = `Importer les ${results.created} entreprises`;
    });
    m.el.querySelector('#pc-import').addEventListener('click', async () => {
      let created = 0;
      for (const c of pending) { await ENTREPRISES.createEntreprise(c); created++; }
      Utils.toast(created + ' entreprise(s) importée(s).', 'ok');
      m.close(); renderAgain();
    });
  }

  async function openImport() {
    const m = UI.modal({ title: 'Importer un fichier', body: `<div class="field"><label>Fichier (CSV, JSON, TXT)</label><input type="file" id="imp-file" accept=".csv,.json,.txt" /></div><div id="imp-preview"></div>`, footer: `<button class="btn sec" id="im-cancel">Annuler</button><button class="btn vert" id="im-import" disabled>Importer</button>` });
    m.el.querySelector('#im-cancel').addEventListener('click', m.close);
    let items = [];
    m.body.querySelector('#imp-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      const text = await Utils.fileToText(file);
      try { items = await ENTREPRISES.parseFileText(text, file.name); }
      catch (e) { Utils.toast(e.message, 'err'); return; }
      m.body.querySelector('#imp-preview').innerHTML = `<div class="val-panel green"><strong>${items.length}</strong> enregistrement(s) détecté(s). Vérifiez ci-dessous avant import.</div><div class="table-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>#</th><th>Dénomination</th><th>Province</th></tr></thead><tbody>${items.slice(0,8).map((it, i) => `<tr><td>${i + 1}</td><td>${Utils.esc(it.denomination || '—')}</td><td>${Utils.esc(it.province || '—')}</td></tr>`).join('')}</tbody></table></div>`;
      const btn = m.el.querySelector('#im-import'); btn.disabled = false; btn.textContent = `Importer ${items.length}`;
    });
    m.el.querySelector('#im-import').addEventListener('click', async () => {
      let created = 0, dup = 0;
      for (const it of items) {
        if (!it || !it.denomination) continue;
        const d = await ENTREPRISES.findDoublon(it);
        if (d) { dup++; continue; }
        await ENTREPRISES.createEntreprise(it); created++;
      }
      Utils.toast(`${created} importée(s) — ${dup} doublon(s) ignoré(s).`, 'ok'); m.close(); renderAgain();
    });
  }

  async function renderAgain() { await render(container); }

  async function draw() {
    const list = await ENTREPRISES.searchEntreprises(state.q, { statut: state.statut, province: state.province });
    const provs = await PROVINCES_PROVIDER();
    container.innerHTML = `
      <h2 class="section-title">Entreprises</h2>
      <div class="card">
        <div class="toolbar">
          <button class="btn" id="bt-add">+ Ajouter</button>
          <button class="btn sec" id="bt-collage">📋 Collage multiple</button>
          <button class="btn sec" id="bt-import">Importer</button>
          <div class="searchbox" style="flex:1;min-width:180px"><span class="si">${UI.icon('search',18)}</span><input id="ent-search" placeholder="Rechercher (nom, RCCM, ville...)" value="${Utils.esc(state.q)}" /></div>
          <select id="ent-statut"><option value="">Statut</option>${['DISPONIBLE','EN MISSION','VISITÉE RÉCEMMENT','SOUS SUIVI','ARCHIVÉE'].map(s => `<option ${state.statut===s?'selected':''}>${s}</option>`).join('')}</select>
          <select id="ent-prov"><option value="">Province</option>${provs.map(p => `<option value="${Utils.esc(p)}" ${state.province===p?'selected':''}>${Utils.esc(p)}</option>`).join('')}</select>
          <button class="btn sec" id="bt-reset">Réinitialiser</button>
        </div>
        <div id="ent-list">${renderTable(list)}</div>
      </div>`;
    container.querySelector('#bt-add').addEventListener('click', () => openForm());
    container.querySelector('#bt-collage').addEventListener('click', openCollage);
    container.querySelector('#bt-import').addEventListener('click', openImport);
    const search = container.querySelector('#ent-search');
    search.addEventListener('input', Utils.debounce(() => { state.q = search.value; draw(); }, 250));
    container.querySelector('#ent-statut').addEventListener('change', (e) => { state.statut = e.target.value; draw(); });
    container.querySelector('#ent-prov').addEventListener('change', (e) => { state.province = e.target.value; draw(); });
    container.querySelector('#bt-reset').addEventListener('click', () => { state.q = ''; state.statut = ''; state.province = ''; draw(); });
    container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => ENTREPRISES.getEntreprise(b.getAttribute('data-edit')).then(openForm)));
    container.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(b.getAttribute('data-detail'))));
    container.querySelectorAll('[data-arch]').forEach((b) => b.addEventListener('click', async () => {
      if (await UI.confirmOk('Archiver cette entreprise ? Elle restera consultable.', 'Archiver', 'Archiver', true)) { await ENTREPRISES.archiveEntreprise(b.getAttribute('data-arch')); Utils.toast('Entreprise archivée.', 'ok'); draw(); }
    }));
  }

  function renderTable(list) {
    if (!list.length) return UI.emptyMessage('🏢', 'Aucune entreprise.');
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Dénomination</th><th>RCCM</th><th>ID National</th><th>Province</th><th>Ville</th><th>Secteur</th><th>Dernière visite</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      ${list.map((e) => `<tr>
        <td class="mini">${Utils.esc(e.id)}</td><td><strong>${Utils.esc(e.denomination)}</strong></td>
        <td>${Utils.esc(e.rccm || '—')}</td><td>${Utils.esc(e.idNational || '—')}</td>
        <td>${Utils.esc(e.province || '—')}</td><td>${Utils.esc(e.ville || '—')}</td><td>${Utils.esc(e.secteur || '—')}</td>
        <td>${Utils.fmtDate(e.derniereVisite)}</td><td>${UI.badge(e.statut)}</td>
        <td><div class="pill-row"><button class="btn sm sec" data-detail="${e.id}">Fiche</button><button class="btn sm sec" data-edit="${e.id}">Modifier</button><button class="btn sm rouge" data-arch="${e.id}">Archiver</button></div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  await draw();
};
