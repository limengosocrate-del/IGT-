/* ==========================================================================
   IGT MISSIONS RDC — sauvegarde.js — Export / Import de la base
   Fichier : igt-backup-YYYY-MM-DD.json  (version, dateExport, settings, ...)
   ========================================================================== */
'use strict';

const SAUVEGARDE = (() => {
  async function exportBase() {
    const data = {};
    for (const key of DB.STORES) {
      try { data[key] = await DB.getAll(key); } catch (e) { data[key] = []; }
    }
    const payload = {
      version: DB.VERSION,
      dateExport: Utils.nowStamp(),
      app: 'IGT-MISSIONS-RDC',
      settings: data.settings && data.settings.length ? data.settings : [],
      entreprise: data.entreprises || [],
      entreprises: data.entreprises || [],
      agents: data.agents || [],
      equipes: data.equipes || [],
      missions: data.missions || [],
      ordres: data.ordres || [],
      historique: data.historique || [],
      archives: data.archives || [],
      structures: data.structures || []
    };
    const name = 'igt-backup-' + Utils.todayISO() + '.json';
    Utils.downloadJSON({ payload }, name);
    await AUDIT.log('EXPORT', 'sauvegarde', 'Export de la base', 'admin', {});
    return payload;
  }

  async function importBase(file) {
    const text = await Utils.fileToText(file);
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('Fichier JSON invalide.'); }
    const payload = obj.payload || obj;
    // Vérification de la structure
    if (!payload || (payload.version == null && !payload.entreprises)) {
      throw new Error('Structure du fichier non reconnue.');
    }
    // notification
    return { payload, counts: summarize(payload) };
  }

  function summarize(payload) {
    return {
      entreprises: (payload.entreprises || []).length,
      agents: (payload.agents || []).length,
      equipes: (payload.equipes || []).length,
      missions: (payload.missions || []).length,
      ordres: (payload.ordres || []).length,
      historique: (payload.historique || []).length,
      archives: (payload.archives || []).length
    };
  }

  /* Fusionne (ne remplace jamais) : les éléments sont insérés par id sans écraser l'existant */
  async function merge(payload) {
    const added = { entreprises: 0, agents: 0, equipes: 0, missions: 0, ordres: 0 };
    const map = {
      entreprises: 'entreprises', agents: 'agents', equipes: 'equipes',
      missions: 'missions', ordres: 'ordres'
    };
    for (const key of Object.keys(map)) {
      const source = payload[key] || [];
      for (const item of source) {
        if (!item || !item.id) continue;
        const existing = await DB.get(map[key], item.id);
        if (!existing) { await DB.put(map[key], item); added[key]++; }
      }
    }
    if (payload.structures && payload.structures.length) {
      for (const s of payload.structures) { if (s && s.id) { const e = await DB.get('structures', s.id); if (!e) await DB.put('structures', s); } }
    }
    if (payload.settings && payload.settings.length) {
      for (const s of payload.settings) { if (s && s.id) { const e = await DB.get('settings', s.id); if (!e) await DB.put('settings', s); } }
    }
    await AUDIT.log('IMPORT', 'sauvegarde', 'Import de la base', 'admin', added);
    return added;
  }

  return { exportBase, importBase, merge, summarize };
})();
