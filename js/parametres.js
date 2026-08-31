/* =====================================================================
   parametres.js — Réglages de l'application.
   - Informations du compte administrateur unique et mot de passe.
   - Préférences (seuils de visite récente / charge agent, structure).
   - Modèle d'ordre de mission (éditeur en ligne + aperçu).
   - Mode de stockage : LOCAL sur cet appareil (rappel explicite).
   Aucune fonction de réinitialisation / vidage de base n'est exposée.
   ===================================================================== */

const Parametres = (() => {

  async function preferences() {
    return await DB.getReglage('preferences', {
      joursVisiteRecente: 180,
      seuilChargeAgent: 12,
      structureNom: "Inspection Générale du Travail — RDC"
    });
  }

  async function enregistrerPreferences(prefs) {
    const actuelles = await preferences();
    const fusion = {
      ...actuelles,
      joursVisiteRecente: parseInt(prefs.joursVisiteRecente, 10) || 180,
      seuilChargeAgent: parseInt(prefs.seuilChargeAgent, 10) || 12,
      structureNom: String(prefs.structureNom || actuelles.structureNom).trim()
    };
    await DB.setReglage('preferences', fusion);
    await Audit.enregistrer('MODIFICATION', 'Paramètres', 'Préférences',
      JSON.stringify(actuelles), JSON.stringify(fusion), 'Mise à jour des préférences');
    return fusion;
  }

  async function informationsCompte() {
    const auth = await DB.getReglage('auth', {});
    return {
      utilisateur: auth.utilisateur || 'admin',
      role: auth.role || 'Gestionnaire Administrateur',
      dateCreation: auth.dateCreation,
      dateModificationMdp: auth.dateModificationMdp
    };
  }

  async function changerMotDePasse(actuel, nouveau, confirmation) {
    return await Auth.changerMotDePasse(actuel, nouveau, confirmation);
  }

  async function modele() {
    return await Ordres.modele();
  }

  async function enregistrerModele(champs) {
    return await Ordres.mettreAJourModele(champs);
  }

  /** Métadonnées de la base locale (pour l'écran Paramètres). */
  async function metaDonnees() {
    const [nbEnt, nbAgt, nbEqp, nbMis, nbOrd, nbLog] = await Promise.all([
      DB.compter('entreprises'),
      DB.compter('agents'),
      DB.compter('equipes'),
      DB.compter('missions'),
      DB.compter('ordres'),
      DB.compter('auditLogs')
    ]);
    const meta = await DB.getReglage('meta', {});
    return {
      nbEnt, nbAgt, nbEqp, nbMis, nbOrd, nbLog,
      version: meta.version || '1.0',
      dateCreation: meta.dateCreation,
      modeStockage: 'Local sur cet appareil (IndexedDB)'
    };
  }

  return {
    preferences, enregistrerPreferences,
    informationsCompte, changerMotDePasse,
    modele, enregistrerModele,
    metaDonnees
  };
})();
