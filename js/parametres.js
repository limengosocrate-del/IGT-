/* ==========================================================================
   IGT MISSIONS RDC — parametres.js — Paramètres généraux, structures, provinces
   ========================================================================== */
'use strict';

const PARAMETRES = (() => {
  async function getSetting(key, fallback) {
    try { const s = await DB.get('settings', key); return s ? s.value : fallback; } catch (e) { return fallback; }
  }
  async function setSetting(key, value) {
    await DB.put('settings', { id: key, key, value, modifieLe: Utils.nowStamp() });
    return value;
  }
  async function getAllSettings() {
    const all = await DB.getAll('settings');
    const map = {};
    all.forEach((s) => { map[s.key] = s.value; });
    return map;
  }

  /* ---------- Structures ---------- */
  async function nextStructNum() {
    const all = await DB.getAll('structures');
    let max = 0;
    all.forEach((s) => { const m = /STR-(\d+)/.exec(s.id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function createStructure(data) {
    if (!data.nom) throw new Error('Le nom de la structure est obligatoire.');
    const id = data.id || 'STR-' + String(await nextStructNum()).padStart(6, '0');
    const rec = Object.assign({ id, nom: data.nom, type: data.type || 'provincial', province: data.province || '', statut: data.statut || 'actif', creeLe: Utils.nowStamp() }, data);
    await DB.put('structures', rec);
    return rec;
  }
  async function updateStructure(id, data) {
    const e = await DB.get('structures', id); if (!e) throw new Error('Structure introuvable.');
    const d = Object.assign({}, e, data, { id });
    await DB.put('structures', d); return d;
  }
  async function getStructures() {
    return (await DB.getAll('structures')).sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
  }
  async function desactiverStructure(id) {
    const e = await DB.get('structures', id); if (!e) return;
    e.statut = 'inactif'; await DB.put('structures', e); return e;
  }
  async function activerStructure(id) {
    const e = await DB.get('structures', id); if (!e) return;
    e.statut = 'actif'; await DB.put('structures', e); return e;
  }

  /* ---------- Provinces (chargées depuis data/provinces.json) ---------- */
  async function loadStaticData() {
    // Lecture du fichier data/provinces.json (nouvelle structure objet)
    try {
      const resp = await fetch('./data/provinces.json');
      const data = await resp.json();
      const provs = data.provinces || [];
      const structures = data.structures || [];
      // Alimenter le store 'provinces' avec les 26 provinces RDC
      for (const name of provs) {
        const id = 'PROV_' + Utils.normKey(name);
        const existing = await DB.get('provinces', id).catch(() => null);
        if (!existing) await DB.put('provinces', { id, name, type: 'province', province: name, statut: 'actif' });
      }
      // Alimenter les structures (si le store est vide ou < 27)
      let stored = await DB.getAll('structures');
      for (const s of structures) {
        const id = 'STR_' + Utils.normKey(s.name);
        if (!stored.some((x) => x.nom === s.name)) await DB.put('structures', Object.assign({ id }, s));
      }
      // Alimenter settings auxiliaires (grades / fonctions)
      if (data.grades && data.grades.length) await setSetting('gradesList', data.grades);
      if (data.fonctions && data.fonctions.length) await setSetting('fonctionsList', data.fonctions);
      if (data.directions && data.directions.length) await setSetting('directionsList', data.directions);
      return provs;
    } catch (e) {
      const list = await DB.getAll('provinces');
      return list.length ? list.map((p) => p.name) : ['Kinshasa'];
    }
  }
  async function loadProvinces() {
    try {
      const provs = await loadStaticData();
      const list = await DB.getAll('provinces');
      if (!list.length) { return (provs || []).map((name) => ({ id: 'PROV_' + Utils.normKey(name), name })); }
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return list;
    } catch (e) {
      const list = await DB.getAll('provinces');
      return list.length ? list : [{ name: 'Administration centrale', type: 'central' }];
    }
  }
  async function getProvinces() {
    const list = await DB.getAll('provinces');
    if (!list.length) { return loadProvinces(); }
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }
  async function getProvinceNames() {
    const list = await getProvinces();
    return Array.from(new Set(list.map((p) => p.name || p.province).filter(Boolean))).sort();
  }

  /* ---------- Amorcage ---------- */
  async function seedStructures() {
    // La structure est désormais alimentée via loadStaticData() depuis le fichier.
    try { await loadStaticData(); } catch (e) {}
    const existing = await DB.getAll('structures');
    if (!existing.length) {
      for (const s of ['Administration centrale', 'Inspection provinciale du travail de Kinshasa', 'Inspection provinciale du travail du Kongo-Central']) {
        await createStructure({ nom: s, type: s.includes('provis') ? 'provincial' : 'central', province: '', statut: 'actif' });
      }
    }
  }
  async function seedSettings() {
    const defaults = {
      nomAffiche: 'Système de Gestion et de Planification des Missions de l\'Inspection Générale du Travail RDC',
      fautrier: 'Instance centrale',
      avertissementMois: 4,
      imputation: "A Charge de l'Inspection Générale du Travail",
      signataireNom: 'Marie MUGALU MUTEBA',
      signataireFonction: 'Chef de corps',
      signataireLieu: 'Kinshasa',
      signataireAdresse: 'Rez-de-chaussée, Immeuble Kimpoko, Boulevard du 30 Juin, Kinshasa/Gombe',
      formatImpression: 'A4'
    };
    for (const k of Object.keys(defaults)) {
      const has = await DB.get('settings', k).catch(() => null);
      if (!has) await setSetting(k, defaults[k]);
    }
  }

  return {
    getSetting, setSetting, getAllSettings,
    createStructure, updateStructure, getStructures, desactiverStructure, activerStructure,
    loadProvinces, getProvinces, getProvinceNames, loadStaticData, seedStructures, seedSettings
  };
})();

/* ==========================================================================
   UI — Module Paramètres (général + structures + données + sauvegarde)
   ========================================================================== */
PARAMETRES.render = async function render(container) {
  const settings = await PARAMETRES.getAllSettings();
  const structures = await PARAMETRES.getStructures();
  const provinces = await PARAMETRES.getProvinces();
  const startTests = await APP.testStartup();
  const storage = await DB.storageEstimate();
  const persisted = await DB.persist();

  container.innerHTML = `
    <h2 class="section-title">Paramètres</h2>
    <div class="tabs">
      <div class="tab active" data-p="general">Général</div>
      <div class="tab" data-p="structures">Structures</div>
      <div class="tab" data-p="stk">Stockage & données</div>
      <div class="tab" data-p="sauv">Sauvegarde</div>
    </div>
    <div id="param-content">${renderGeneral()}</div>`;
  container.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    container.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active');
    const p = t.getAttribute('data-p');
    container.querySelector('#param-content').innerHTML = p === 'general' ? renderGeneral() : p === 'structures' ? renderStructures() : p === 'stk' ? renderStockage() : renderSauvegarde();
    bindTab(p);
  }));
  bindTab('general');

  function renderGeneral() {
    return `<div class="card">
      <h3>Informations institutionnelles</h3>
      <div class="form-grid">
        ${UI.field('Nom affiché', UI.input('nomAffiche', settings.nomAffiche, ''), { full: true })}
        ${UI.field("Durée d'avertissement (mois)", UI.input('avertissementMois', settings.avertissementMois, '4', 'number'))}
        ${UI.field('Imputation par défaut', UI.input('imputation', settings.imputation, ''))}
        ${UI.field('Format d\'impression', UI.select('formatImpression', ['A4', 'Registre'], settings.formatImpression))}
      </div>
      <h3 style="margin-top:14px">Ordonnateur / signature</h3>
      <div class="form-grid">
        ${UI.field('Signataire', UI.input('signataireNom', settings.signataireNom, ''))}
        ${UI.field('Fonction', UI.input('signataireFonction', settings.signataireFonction, ''))}
        ${UI.field('Lieu (Fait à)', UI.input('signataireLieu', settings.signataireLieu, ''))}
        ${UI.field('Adresse', UI.input('signataireAdresse', settings.signataireAdresse, ''))}
      </div>
      <h3 style="margin-top:14px">Logo</h3>
      <div class="field"><label>Aperçu</label><div id="logo-preview"><img src="./assets/logo/logo.png" style="max-height:70px" alt="logo"/></div></div>
      <div class="field"><label>Remplacer le logo (PNG, JPG, WEBP)</label><input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="btnrow" style="margin-top:10px"><button class="btn" id="pg-save">Enregistrer</button></div>
    </div>`;
  }
  function renderStructures() {
    return `<div class="card">
      <div class="toolbar"><button class="btn" id="st-add">+ Ajouter structure</button></div>
      ${structures.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Type</th><th>Province</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${structures.map((s) => `<tr><td><strong>${Utils.esc(s.nom)}</strong></td><td>${Utils.esc(s.type)}</td><td>${Utils.esc(s.province || '—')}</td><td>${UI.badge(s.statut)}</td><td><div class="pill-row"><button class="btn sm sec" data-sedit="${s.id}">Modifier</button>${s.statut === 'actif' ? '<button class="btn sm rouge" data-sdes="' + s.id + '">Désactiver</button>' : '<button class="btn sm vert" data-sact="' + s.id + '">Activer</button>'}</div></td></tr>`).join('')}</tbody></table></div>` : UI.emptyMessage('🏛', 'Aucune structure.')}
    </div>`;
  }
  function renderStockage() {
    const usage = storage && storage.usage ? (storage.usage / 1024 / 1024).toFixed(2) + ' Mo' : '—';
    const quota = storage && storage.quota ? (storage.quota / 1024 / 1024).toFixed(0) + ' Mo' : '—';
    return `<div class="card">
      <h3>Informations</h3>
      <div class="kv">
        <dt>Type de stockage</dt><dd>Local sur cet appareil</dd>
        <dt>Base de données</dt><dd>${Utils.esc(DB.NAME)} — version ${DB.VERSION}</dd>
        <dt>Espace utilisé</dt><dd>${usage} / ${quota}</dd>
        <dt>Persistance demandée</dt><dd>${persisted ? '🟢 Accordée' : '🟠 Non confirmée'}</dd>
      </div>
      <div class="val-panel orange" style="margin-top:12px">
        <strong>STOCKAGE</strong><br/>
        Les données opérationnelles sont stockées localement sur cet appareil.
        Chaque installation (téléphone, ordinateur) possède sa propre base locale et les données ne sont pas synchronisées entre appareils.
      </div>
      <h3 style="margin-top:14px">Tests automatiques</h3>
      ${startTests.map((t) => `<div class="alert-item c-${t.ok ? 'information' : 'conflit'}"><div class="a-ic">${t.ok ? '🟢' : '🔴'}</div><div><div class="a-t">${Utils.esc(t.label)}</div><div class="a-d">${t.ok ? 'Disponible' : 'Indisponible'}</div></div></div>`).join('')}
    </div>`;
  }
  function renderSauvegarde() {
    return `<div class="card">
      <h3>Export de la base</h3>
      <p class="muted">Produit un fichier <strong>igt-backup-YYYY-MM-DD.json</strong> contenant la version, la date d'export, les paramètres, entreprises, agents, équipes, missions, ordres, historique et archives.</p>
      <div class="btnrow"><button class="btn" id="sbx-export">Exporter la base</button></div>
      <h3 style="margin-top:18px">Import de la base</h3>
      <p class="muted">Le fichier est analysé, vérifié puis fusionné. La base actuelle n'est jamais effacée automatiquement.</p>
      <div class="field"><input type="file" id="sbx-file" accept=".json" /></div>
      <div id="sbx-preview"></div>
      <div class="btnrow"><button class="btn sec" id="sbx-import" disabled>Analyser & importer</button></div>
    </div>`;
  }

  function bindTab(p) {
    const root = container.querySelector('#param-content');
    if (p === 'general') {
      const save = root.querySelector('#pg-save');
      if (save) save.addEventListener('click', async () => {
        const d = UI.collect(root);
        for (const k of Object.keys(d)) await PARAMETRES.setSetting(k, d[k]);
        Utils.toast('Paramètres enregistrés.', 'ok');
      });
      const lf = root.querySelector('#logo-file');
      if (lf) lf.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const dataurl = await Utils.fileToDataURL(f);
        await PARAMETRES.setSetting('logoData', dataurl);
        root.querySelector('#logo-preview').innerHTML = '<img src="' + dataurl + '" style="max-height:70px" alt="logo"/>';
        Utils.toast('Logo remplacé localement.', 'ok');
      });
    }
    if (p === 'structures') {
      const add = root.querySelector('#st-add');
      if (add) add.addEventListener('click', () => openStructForm());
      root.querySelectorAll('[data-sedit]').forEach((b) => b.addEventListener('click', () => openStructForm(structures.find((s) => s.id === b.getAttribute('data-sedit')))));
      root.querySelectorAll('[data-sdes]').forEach((b) => b.addEventListener('click', async () => { await PARAMETRES.desactiverStructure(b.getAttribute('data-sdes')); PARAMETRES.render(container); }));
      root.querySelectorAll('[data-sact]').forEach((b) => b.addEventListener('click', async () => { await PARAMETRES.activerStructure(b.getAttribute('data-sact')); PARAMETRES.render(container); }));
    }
    if (p === 'sauv') {
      const exp = root.querySelector('#sbx-export');
      if (exp) exp.addEventListener('click', async () => { await SAUVEGARDE.exportBase(); Utils.toast('Export généré.', 'ok'); });
      const file = root.querySelector('#sbx-file');
      const imp = root.querySelector('#sbx-import');
      if (file) file.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const { payload, counts } = await SAUVEGARDE.importBase(f);
          root.querySelector('#sbx-preview').innerHTML = `<div class="val-panel green">Fichier valide — version ${payload.version || '?'} — <strong>${counts.entreprises}</strong> entreprises, <strong>${counts.missions}</strong> missions, <strong>${counts.ordres}</strong> ordres.</div>`;
          imp.disabled = false;
          imp.onclick = async () => {
            if (await UI.confirmOk('Fusionner ces données dans la base actuelle ? Aucune donnée ne sera supprimée.', 'Fusionner', 'Fusionner', true)) {
              const added = await SAUVEGARDE.merge(payload);
              Utils.toast('Fusion terminée.', 'ok'); PARAMETRES.render(container);
            }
          };
        } catch (err) { root.querySelector('#sbx-preview').innerHTML = `<div class="val-panel red">${Utils.esc(err.message)}</div>`; imp.disabled = true; }
      });
    }
  }

  function openStructForm(s) {
    const m = UI.modal({ title: s ? 'Modifier structure' : 'Ajouter structure', body: `<div class="form-grid">
      ${UI.field('Nom *', UI.input('nom', s ? s.nom : '', ''), { full: true })}
      ${UI.field('Type', UI.select('type', [{label:'Administration centrale',value:'central'},{label:'Provincial',value:'provincial'}], s ? s.type : 'provincial'))}
      ${UI.field('Province', UI.input('province', s ? s.province : '', ''))}
    </div>`, footer: '<button class="btn sec" id="st-cancel">Annuler</button><button class="btn" id="st-save">Enregistrer</button>' });
    m.el.querySelector('#st-cancel').addEventListener('click', m.close);
    m.el.querySelector('#st-save').addEventListener('click', async () => {
      const d = UI.collect(m.body);
      if (!d.nom) { Utils.toast('Le nom est obligatoire.', 'err'); return; }
      if (s) await PARAMETRES.updateStructure(s.id, d); else await PARAMETRES.createStructure(d);
      Utils.toast('Structure enregistrée.', 'ok'); m.close(); PARAMETRES.render(container);
    });
  }
};
