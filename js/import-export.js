/* =====================================================================
   import-export.js — Sauvegarde et restauration des données locales.
   - Export complet en JSON (sauvegarde) et CSV par registre.
   - Import d'une sauvegarde JSON avec FUSION (jamais d'effacement
     automatique des données existantes) et confirmation explicite.
   Cette fonctionnalité est une sauvegarde, pas une réinitialisation.
   ===================================================================== */

const ImportExport = (() => {

  const REGISTRES = [
    'entreprises', 'agents', 'equipes', 'missions',
    'missionAgents', 'missionEntreprises', 'ordres',
    'historique', 'auditLogs', 'notifications', 'provinces'
  ];

  /** Construit une sauvegarde complète. */
  async function exporterJSON() {
    const donnees = {};
    for (const r of REGISTRES) donnees[r] = await DB.tout(r);
    donnees.settings = {};
    // Réglages clé/valeur
    const reglages = await DB.tout('settings');
    for (const s of reglages) donnees.settings[s.cle] = s.valeur;
    const sauvegarde = {
      application: 'IGT Missions RDC — Système de gestion des missions',
      version: '1.0',
      dateExport: new Date().toISOString(),
      modeStockage: 'Local IndexedDB',
      donnees
    };
    const nom = `sauvegarde-igt-rdc-${Utils.aujourdhui()}.json`;
    Utils.telecharger(nom, JSON.stringify(sauvegarde, null, 2), 'application/json');
    await Audit.enregistrer('EXPORT', 'Sauvegarde', nom, null,
      `${REGISTRES.map((r) => donnees[r].length).join('/')} enregistrements`, 'Export JSON complet des données');
    return sauvegarde;
  }

  /** Export CSV d'un registre tabulaire. */
  async function exporterCSV(registre) {
    const lignes = await DB.tout(registre);
    if (!lignes.length) {
      Utils.toast("Aucune donnée à exporter pour ce registre.", 'avert');
      return;
    }
    const colonnes = Array.from(lignes.reduce((set, l) => {
      Object.keys(l).forEach((k) => set.add(k));
      return set;
    }, new Set()));
    const echapper = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const contenu = [
      colonnes.join(';'),
      ...lignes.map((l) => colonnes.map((c) => echapper(l[c])).join(';'))
    ].join('\n');
    const nom = `${registre}-igt-rdc-${Utils.aujourdhui()}.csv`;
    Utils.telecharger(nom, '﻿' + contenu, 'text/csv;charset=utf-8');
    await Audit.enregistrer('EXPORT', 'Sauvegarde', nom, null,
      `${lignes.length} lignes`, `Export CSV du registre ${registre}`);
  }

  /** Analyse un fichier de sauvegarde JSON avant fusion. */
  function analyserImportJSON(texte) {
    let obj;
    try {
      obj = JSON.parse(texte);
    } catch {
      throw new Error("Le fichier n'est pas une sauvegarde JSON valide.");
    }
    if (!obj || !obj.donnees) {
      throw new Error("Ce fichier ne contient pas de sauvegarde IGT reconnue.");
    }
    const resume = {};
    for (const r of REGISTRES) {
      resume[r] = Array.isArray(obj.donnees[r]) ? obj.donnees[r].length : 0;
    }
    return { obj, resume };
  }

  /** Fusionne une sauvegarde : conserve les données locales existantes,
   *  ajoute uniquement les enregistrements absents (par identifiant).
   *  Les réglages ne sont fusionnés qu'en l'absence de valeur locale. */
  async function importerJSON(texte) {
    const { obj, resume } = analyserImportJSON(texte);
    const rapport = {};
    for (const r of REGISTRES) {
      const nouveaux = Array.isArray(obj.donnees[r]) ? obj.donnees[r] : [];
      let ajoutes = 0, ignores = 0;
      const existants = await DB.tout(r);
      const ids = new Set(existants.map((e) => e.id));
      const aInserer = [];
      for (const n of nouveaux) {
        if (!n.id) { n.id = Utils.uid(r.slice(0, 3)); }
        if (ids.has(n.id)) { ignores++; continue; }
        aInserer.push(n);
        ids.add(n.id);
        ajoutes++;
      }
      if (aInserer.length) await DB.putPlusieurs(r, aInserer);
      rapport[r] = { ajoutes, ignores };
    }
    await Audit.enregistrer('IMPORT', 'Sauvegarde', `Import du ${obj.dateExport || 'fichier'}`,
      null, JSON.stringify(rapport), 'Fusion d\'une sauvegarde JSON (données existantes conservées)');
    return rapport;
  }

  /** Import CSV d'entreprises (avec prévisualisation et détection des doublons). */
  async function importerEntreprisesCSV(texte, provinceDefaut = '') {
    const lignes = Utils.parserCSV(texte);
    if (!lignes.length) throw new Error("Aucune ligne exploitable dans le fichier.");
    // La première ligne est soit un en-tête, soit des données.
    const entete = lignes[0].map((c) => Utils.normaliser(c));
    const champsEntreprise = ['denomination', 'nom', 'rccm', 'idnational', 'id national',
      'numerofiscal', 'secteur', 'province', 'ville', 'commune', 'adresse',
      'telephone', 'responsable', 'observations'];
    const aEntete = entete.some((c) => champsEntreprise.includes(c));
    const corps = aEntete ? lignes.slice(1) : lignes;
    const indexNom = entete.indexOf('denomination') !== -1 ? entete.indexOf('denomination')
      : entete.indexOf('nom') !== -1 ? entete.indexOf('nom') : 0;

    const noms = corps.map((l) => (l[indexNom] || '').trim()).filter((x) => x.length > 1);
    return await Entreprises.creerEnMasse(noms, provinceDefaut);
  }

  return { exporterJSON, exporterCSV, analyserImportJSON, importerJSON, importerEntreprisesCSV };
})();
