/* =====================================================================
   database.js — Couche d'accès IndexedDB
   Object stores : settings, provinces, agents, entreprises, equipes,
   missions, missionAgents, missionEntreprises, ordres, historique,
   auditLogs, notifications.
   Aucune fonction de réinitialisation / vidage de la base n'est exposée.
   ===================================================================== */

const DB = (() => {
  const NOM_BASE = 'igt-missions-rdc';
  const VERSION = 1;

  const STORES = [
    'settings',        // clé/valeur (keyPath: cle)
    'provinces',       // provinces & structures administratives
    'agents',          // agents de l'Inspection
    'entreprises',     // registre des entreprises
    'equipes',         // groupes de travail
    'missions',        // missions
    'missionAgents',   // affectation agents ↔ missions
    'missionEntreprises', // affectation entreprises ↔ missions
    'ordres',          // ordres de mission
    'historique',      // historique des visites par entreprise
    'auditLogs',       // journal de traçabilité
    'notifications'    // centre d'alertes
  ];

  let dbPromise = null;

  function ouvrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOM_BASE, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach((nom) => {
          if (!db.objectStoreNames.contains(nom)) {
            const opts = nom === 'settings' ? { keyPath: 'cle' } : { keyPath: 'id' };
            const store = db.createObjectStore(nom, opts);
            if (nom === 'agents') {
              store.createIndex('statut', 'statut', { unique: false });
              store.createIndex('matricule', 'matricule', { unique: false });
            }
            if (nom === 'entreprises') {
              store.createIndex('statut', 'statut', { unique: false });
              store.createIndex('province', 'province', { unique: false });
            }
            if (nom === 'missions') {
              store.createIndex('statut', 'statut', { unique: false });
              store.createIndex('equipeId', 'equipeId', { unique: false });
            }
            if (nom === 'ordres') {
              store.createIndex('missionId', 'missionId', { unique: false });
              store.createIndex('statut', 'statut', { unique: false });
            }
            if (nom === 'historique') {
              store.createIndex('entrepriseId', 'entrepriseId', { unique: false });
              store.createIndex('missionId', 'missionId', { unique: false });
            }
            if (nom === 'auditLogs') store.createIndex('date', 'date', { unique: false });
            if (nom === 'notifications') {
              store.createIndex('lu', 'lu', { unique: false });
              store.createIndex('date', 'date', { unique: false });
            }
            if (nom === 'missionAgents') {
              store.createIndex('missionId', 'missionId', { unique: false });
              store.createIndex('agentId', 'agentId', { unique: false });
            }
            if (nom === 'missionEntreprises') {
              store.createIndex('missionId', 'missionId', { unique: false });
              store.createIndex('entrepriseId', 'entrepriseId', { unique: false });
            }
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("Impossible d'ouvrir la base de données locale."));
    });
    return dbPromise;
  }

  /** Requête générique en lecture/écriture. */
  function tx(storeName, mode, fn) {
    return ouvrir().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      let resultat;
      try {
        resultat = fn(store);
      } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(resultat && resultat.result !== undefined ? resultat.result : resultat);
      t.onerror = () => reject(t.error || new Error('Erreur de base de données.'));
      t.onabort = () => reject(t.error || new Error('Opération annulée.'));
    }));
  }

  function reqPromesse(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  // ---- API publique ----
  function tout(storeName) {
    return tx(storeName, 'readonly', (s) => reqPromesse(s.getAll()));
  }

  function get(storeName, cle) {
    return tx(storeName, 'readonly', (s) => reqPromesse(s.get(cle)));
  }

  function put(storeName, objet) {
    return tx(storeName, 'readwrite', (s) => reqPromesse(s.put(objet)));
  }

  function putPlusieurs(storeName, objets) {
    return ouvrir().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const s = t.objectStore(storeName);
      objets.forEach((o) => s.put(o));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  /** Insertion qui génère un id si absent. Retourne l'objet stocké. */
  async function ajouter(storeName, objet) {
    if (!objet.id) objet.id = Utils.uid(storeName.slice(0, 3));
    await put(storeName, objet);
    return objet;
  }

  function supprimer(storeName, cle) {
    return tx(storeName, 'readwrite', (s) => reqPromesse(s.delete(cle)));
  }

  function compter(storeName) {
    return tx(storeName, 'readonly', (s) => reqPromesse(s.count()));
  }

  /** Recherche par index (retourne tableau). */
  function parIndex(storeName, indexName, valeur) {
    return ouvrir().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readonly');
      const idx = t.objectStore(storeName).index(indexName);
      const r = idx.getAll(IDBKeyRange.only(valeur));
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }

  // ---- Réglages (clé/valeur) ----
  async function getReglage(cle, defaut = null) {
    const r = await get('settings', cle);
    return r ? r.valeur : defaut;
  }
  async function setReglage(cle, valeur) {
    await put('settings', { cle, valeur });
    return valeur;
  }

  /* ------------------------------------------------------------------
     Données initiales (provinces RDC, modèle d'ordre, compteur, auth)
     ------------------------------------------------------------------ */
  const PROVINCES_RDC = [
    'Kinshasa', 'Kongo Central', 'Kwango', 'Kwilu', 'Mai-Ndombe',
    'Kasaï', 'Kasaï Central', 'Kasaï Oriental', 'Lomami', 'Sankuru',
    'Maniema', 'Nord-Kivu', 'Sud-Kivu', 'Ituri', 'Haut-Uélé',
    'Tshopo', 'Bas-Uélé', 'Nord-Ubangi', 'Mongala', 'Sud-Ubangi',
    'Équateur', 'Tshuapa', 'Tanganyika', 'Haut-Lomami', 'Lualaba', 'Haut-Katanga'
  ];

  const OBJET_DEFAUT = [
    "Vérifier le respect des dispositions légales et réglementaires relatives aux contrats de travail, à la durée du travail, aux salaires (SMIG) et à la santé et sécurité au travail ;",
    "Détecter et sanctionner les cas de travail dissimulé et l'emploi illégal ;",
    "S'assurer de la bonne application des dispositions légales et réglementaires relatives à la protection de la main-d'œuvre, du comité SHE ainsi que de la délégation syndicale ;",
    "S'assurer de la régularité des Services Privés des Placements œuvrant dans les entreprises et établissements de toutes natures ;",
    "Constater les infractions liées à la non-conformité en matière du travail par les procès-verbaux et infliger les amendes transactionnelles y afférentes ;",
    "Faire rapport."
  ];

  function modeleDefaut() {
    return {
      structure: "INSPECTION GÉNÉRALE DU TRAVAIL",
      adresse: "Rez-de-chaussée, Immeuble Kimpoko, Boulevard du 30 Juin, Kinshasa/Gombe",
      titre: "ORDRE DE MISSION COLLECTIF",
      intro: "Les personnes ci-dessous dont les fonctions reprises sont désignées pour effectuer une mission spéciale en vue de faire respecter la législation en vigueur en matière du travail dans les organismes, les entreprises et établissements suivants :",
      introSuite: "dans la ville/Province de",
      objetTitre: "OBJET DE LA MISSION",
      formule: "Les Autorités Civiles, Militaires et Policières sont priées d'apporter, le cas échéant, leur assistance aux intéressés pour le meilleur accomplissement de leur mission.",
      imputationDefaut: "À charge de l'Inspection Générale du Travail",
      lieu: "Kinshasa",
      signataireNom: "Marie MUGALU MUTEBA",
      signataireFonction: "Chef de corps",
      logoDataUrl: '',
      objetPointsDefaut: OBJET_DEFAUT,
      piedPage: "Créé par Inspecteur Limengo Daniel (Pmiller) 2026"
    };
  }

  /** Hachage adapté au navigateur : PBKDF2-SHA-256 via Web Crypto. */
  async function hacherMotDePasse(motDePasse, selHex) {
    const enc = new TextEncoder();
    const sel = selHex ? Uint8Array.from(selHex.match(/.{2}/g).map((h) => parseInt(h, 16)))
      : crypto.getRandomValues(new Uint8Array(16));
    const cleBase = await crypto.subtle.importKey(
      'raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: sel, iterations: 120000, hash: 'SHA-256' },
      cleBase, 256);
    const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { hash: toHex(bits), sel: toHex(sel) };
  }

  async function verifierMotDePasse(motDePasse, auth) {
    const { hash } = await hacherMotDePasse(motDePasse, auth.sel);
    // Comparaison à longueur constante
    if (hash.length !== auth.hash.length) return false;
    let egal = 0;
    for (let i = 0; i < hash.length; i++) egal |= hash.charCodeAt(i) ^ auth.hash.charCodeAt(i);
    return egal === 0;
  }

  /** Initialisation des données de base au tout premier lancement. */
  async function initialiser() {
    await ouvrir();

    // Provinces
    const provincesExistantes = await compter('provinces');
    if (provincesExistantes === 0) {
      await putPlusieurs('provinces', PROVINCES_RDC.map((nom) => ({
        id: Utils.uid('pro'), nom, actif: true
      })));
    }

    // Compteur d'ordres
    if (!(await getReglage('compteur_ordres'))) {
      await setReglage('compteur_ordres', { [new Date().getFullYear()]: 0 });
    }

    // Modèle d'ordre par défaut
    if (!(await getReglage('modele_ordre'))) {
      await setReglage('modele_ordre', modeleDefaut());
    }

    // Préférences
    if (!(await getReglage('preferences'))) {
      await setReglage('preferences', {
        joursVisiteRecente: 180,   // seuil "visitée récemment"
        seuilChargeAgent: 12,      // missions/an considérées comme forte sollicitation
        structureNom: "Inspection Générale du Travail — RDC"
      });
    }

    // Compte administrateur unique (admin / admin2026 la première fois)
    if (!(await getReglage('auth'))) {
      const { hash, sel } = await hacherMotDePasse('admin2026');
      await setReglage('auth', {
        utilisateur: 'admin',
        hash, sel,
        role: 'Gestionnaire Administrateur',
        dateCreation: new Date().toISOString(),
        dateModificationMdp: null
      });
    }

    // Métadonnées
    if (!(await getReglage('meta'))) {
      await setReglage('meta', { version: '1.0', dateCreation: new Date().toISOString() });
    }
  }

  return {
    NOM_BASE, STORES,
    ouvrir, tout, get, put, putPlusieurs, ajouter, supprimer, compter, parIndex,
    getReglage, setReglage,
    initialiser, hacherMotDePasse, verifierMotDePasse,
    modeleDefaut, PROVINCES_RDC
  };
})();
