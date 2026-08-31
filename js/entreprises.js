/* =====================================================================
   entreprises.js — Registre des entreprises.
   Ajout / modification / consultation / archivage / recherche.
   Aucune suppression définitive (conformité cahier des charges §12).
   Import par copier-coller (détection de lignes + doublons) et CSV.
   ===================================================================== */

const Entreprises = (() => {

  const CHAMPS = [
    ['denomination', 'Dénomination', true],
    ['rccm', 'RCCM', false],
    ['idNational', 'ID National', false],
    ['numeroFiscal', 'Numéro fiscal', false],
    ['secteur', 'Secteur', false],
    ['province', 'Province', false],
    ['ville', 'Ville', false],
    ['commune', 'Commune', false],
    ['adresse', 'Adresse', false],
    ['telephone', 'Téléphone', false],
    ['responsable', 'Responsable', false],
    ['observations', 'Observations', false]
  ];

  async function lister({ inclureArchivees = false } = {}) {
    const toutes = await DB.tout('entreprises');
    toutes.sort((a, b) => Utils.normaliser(a.denomination).localeCompare(Utils.normaliser(b.denomination)));
    return inclureArchivees ? toutes : toutes.filter((e) => e.statut !== 'ARCHIVEE');
  }

  async function parId(id) {
    return DB.get('entreprises', id);
  }

  /** Calcul du statut dynamique d'une entreprise (les statuts de mission prévalent). */
  async function statutCalcule(entreprise, now = new Date()) {
    if (entreprise.statut === 'ARCHIVEE') return { code: 'ARCHIVEE', libelle: 'Archivée', badge: 'badge--noir', ico: '⚫' };

    // 1) Entreprise actuellement affectée à une mission active (VALIDÉE, IMPRIMÉE, EN_MISSION)
    const affectations = await DB.parIndex('missionEntreprises', 'entrepriseId', entreprise.id);
    const missions = await DB.tout('missions');
    const prefs = await DB.getReglage('preferences', {});
    const seuil = (prefs.joursVisiteRecente || 180);

    for (const aff of affectations) {
      const mission = missions.find((m) => m.id === aff.missionId);
      if (mission && ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(mission.statut)) {
        return { code: 'EN_MISSION', libelle: 'En mission', badge: 'badge--rouge', ico: '🔴', missionId: mission.id };
      }
    }

    // 2) Marquage manuel « sous suivi »
    if (entreprise.statut === 'SOUS_SUIVI') {
      return { code: 'SOUS_SUIVI', libelle: 'Sous suivi', badge: 'badge--violet', ico: '🟣' };
    }

    // 3) Visite récente (mission TERMINÉE / archivée clôturée dans le seuil)
    const historique = await DB.parIndex('historique', 'entrepriseId', entreprise.id);
    const visites = historique
      .filter((h) => h.dateVisite)
      .sort((a, b) => (a.dateVisite < b.dateVisite ? 1 : -1));
    if (visites.length) {
      const derniere = new Date(visites[0].dateVisite + 'T00:00:00');
      const jours = Math.round((now - derniere) / 86400000);
      if (jours >= 0 && jours <= seuil && visites[0].statut !== 'EN MISSION') {
        return { code: 'RECEMMENT_VISITEE', libelle: 'Visitée récemment', badge: 'badge--orange', ico: '🟠',
                 derniereVisite: visites[0].dateVisite, jours };
      }
    }
    return { code: 'DISPONIBLE', libelle: 'Disponible', badge: 'badge--vert', ico: '🟢' };
  }

  async function sauvegarder(formData, idExistante = null) {
    const denomination = String(formData.denomination || '').trim();
    if (!denomination) {
      throw new Error("La dénomination de l'entreprise est obligatoire.");
    }
    let ent = idExistante ? await DB.get('entreprises', idExistante) : null;
    const ancienne = ent ? { ...ent } : null;

    if (!ent) {
      // Doublon : dénomination identique (normalisée)
      const toutes = await DB.tout('entreprises');
      const doublon = toutes.find((e) =>
        e.statut !== 'ARCHIVEE' &&
        Utils.normaliser(e.denomination).replace(/\s+/g, ' ') === Utils.normaliser(denomination).replace(/\s+/g, ' '));
      if (doublon) {
        throw new Error(`Une entreprise « ${doublon.denomination} » existe déjà dans le registre.`);
      }
      ent = {
        id: Utils.uid('ent'),
        dateEnregistrement: Utils.aujourdhui(),
        statut: 'DISPONIBLE'
      };
    }
    for (const [champ] of CHAMPS) {
      ent[champ] = String(formData[champ] || '').trim();
    }
    // Le statut n'est écrasé que s'il est fourni (sinon conservé)
    if (formData.statut) ent.statut = formData.statut;

    await DB.put('entreprises', ent);

    await Audit.enregistrer(
      idExistante ? 'MODIFICATION' : 'CRÉATION',
      'Entreprises',
      ent.denomination,
      ancienne ? JSON.stringify(ancienne) : null,
      JSON.stringify(ent),
      idExistante ? "Modification de l'entreprise" : "Ajout d'une entreprise"
    );
    return ent;
  }

  async function archiver(id) {
    const ent = await DB.get('entreprises', id);
    if (!ent) throw new Error("Entreprise introuvable.");
    if (ent.statut === 'ARCHIVEE') return ent;
    // Contrôle : ne pas archiver une entreprise en mission active
    const st = await statutCalcule(ent);
    if (st.code === 'EN_MISSION') {
      throw new Error("Impossible d'archiver : cette entreprise est actuellement affectée à une mission active.");
    }
    const avant = { ...ent };
    ent.statut = 'ARCHIVEE';
    ent.dateArchivage = Utils.aujourdhui();
    await DB.put('entreprises', ent);
    await Audit.enregistrer('ARCHIVAGE', 'Entreprises', ent.denomination,
      JSON.stringify(avant.statut), 'ARCHIVEE', "Entreprise archivée (conservée dans les archives)");
    return ent;
  }

  async function reactiver(id) {
    const ent = await DB.get('entreprises', id);
    if (!ent) throw new Error("Entreprise introuvable.");
    ent.statut = 'DISPONIBLE';
    delete ent.dateArchivage;
    await DB.put('entreprises', ent);
    await Audit.enregistrer('RÉACTIVATION', 'Entreprises', ent.denomination, 'ARCHIVEE', 'DISPONIBLE', 'Entreprise réactivée');
    return ent;
  }

  async function marquerSuivi(id, actif) {
    const ent = await DB.get('entreprises', id);
    if (!ent) throw new Error("Entreprise introuvable.");
    const avant = ent.statut;
    ent.statut = actif ? 'SOUS_SUIVI' : 'DISPONIBLE';
    await DB.put('entreprises', ent);
    await Audit.enregistrer('MODIFICATION', 'Entreprises', ent.denomination, avant, ent.statut,
      actif ? 'Marquage « sous suivi »' : 'Retrait du suivi');
    return ent;
  }

  /** Détecte des lignes d'entreprises à partir d'un texte collé (une par ligne). */
  function analyserTexte(texte) {
    return String(texte || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 1)
      .map((l) => l.replace(/^[\d\.\)\-\s]+/, '').trim()); // retire une numérotation éventuelle
  }

  /** Retourne les noms candidats non encore présents + doublons détectés. */
  async function controlerNomsAVolonte(noms) {
    const toutes = await DB.tout('entreprises');
    const existants = new Set(toutes.filter((e) => e.statut !== 'ARCHIVEE')
      .map((e) => Utils.normaliser(e.denomination).replace(/\s+/g, ' ')));
    const creer = [], doublons = [], vus = new Set();
    for (const nom of noms) {
      const cle = Utils.normaliser(nom).replace(/\s+/g, ' ');
      if (!cle) continue;
      if (existants.has(cle) || vus.has(cle)) doublons.push(nom);
      else { creer.push(nom); vus.add(cle); }
    }
    return { creer, doublons };
  }

  /** Création en masse à partir d'une liste de noms. */
  async function creerEnMasse(noms, provinceDefaut = '') {
    const { creer, doublons } = await controlerNomsAVolonte(noms);
    const ajoutees = [];
    for (const nom of creer) {
      const ent = {
        id: Utils.uid('ent'),
        denomination: nom.toUpperCase(),
        rccm: '', idNational: '', numeroFiscal: '', secteur: '',
        province: provinceDefaut, ville: '', commune: '', adresse: '',
        telephone: '', responsable: '', observations: '',
        statut: 'DISPONIBLE',
        dateEnregistrement: Utils.aujourdhui()
      };
      await DB.put('entreprises', ent);
      ajoutees.push(ent);
    }
    if (ajoutees.length) {
      await Audit.enregistrer('IMPORT', 'Entreprises',
        `${ajoutees.length} entreprise(s)`, null,
        ajoutees.map((e) => e.denomination).join(' ; '),
        `Import de ${ajoutees.length} entreprise(s) par saisie de liste`);
    }
    return { ajoutees, doublons };
  }

  /** Recherche instantanée insensible à la casse (et aux accents). */
  async function rechercher(terme, { inclureArchivees = false } = {}) {
    const toutes = await lister({ inclureArchivees });
    const t = Utils.normaliser(terme);
    if (!t) return toutes;
    return toutes.filter((e) =>
      CHAMPS.some(([champ]) => Utils.normaliser(e[champ]).includes(t))
    );
  }

  return {
    CHAMPS, lister, parId, statutCalcule, sauvegarder, archiver, reactiver,
    marquerSuivi, analyserTexte, controlerNomsAVolonte, creerEnMasse, rechercher
  };
})();
