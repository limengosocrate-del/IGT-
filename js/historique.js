/* =====================================================================
   historique.js — Historique des visites par entreprise et par mission.
   Alimenté automatiquement au passage « EN MISSION » et « TERMINÉE ».
   ===================================================================== */

const Historique = (() => {

  async function lister() {
    const lignes = await DB.tout('historique');
    lignes.sort((a, b) => (a.dateVisite || '') < (b.dateVisite || '') ? 1 : -1);
    return lignes;
  }

  async function pourEntreprise(entrepriseId) {
    const lignes = await DB.parIndex('historique', 'entrepriseId', entrepriseId);
    lignes.sort((a, b) => (a.dateVisite || '') < (b.dateVisite || '') ? 1 : -1);
    return lignes;
  }

  async function pourMission(missionId) {
    const lignes = await DB.parIndex('historique', 'missionId', missionId);
    return lignes;
  }

  /** Synthèse complète pour la fiche entreprise. */
  async function syntheseEntreprise(entrepriseId) {
    const lignes = await pourEntreprise(entrepriseId);
    const missions = await DB.tout('missions');
    const equipes = await Equipes.lister();
    const ordres = await DB.tout('ordres');

    const visites = [];
    const equipesVues = new Map();
    for (const h of lignes) {
      const mission = missions.find((m) => m.id === h.missionId);
      const equipe = equipes.find((e) => e.id === (h.equipeId || (mission && mission.equipeId)));
      const ordre = ordres.find((o) => o.missionId === h.missionId);
      visites.push({
        ...h,
        missionReference: mission ? mission.reference : '—',
        missionObjet: mission ? mission.objet : '',
        equipeNom: equipe ? equipe.nom : '—',
        ordreNumero: (ordre && ordre.numero) || h.ordreNumero || '—',
        statutLibelle: h.statut || (mission ? Missions.STATUT_LIBELLES[mission.statut] : '—')
      });
      if (equipe) equipesVues.set(equipe.id, equipe.nom);
    }
    const dates = lignes.map((l) => l.dateVisite).filter(Boolean).sort();
    return {
      nombreMissions: visites.length,
      premiereVisite: dates[0] || null,
      derniereVisite: dates[dates.length - 1] || null,
      equipes: Array.from(equipesVues.values()),
      visites
    };
  }

  /** Entreprises jamais visitées (statistiques). */
  async function entreprisesJamaisVisitees() {
    const entreprises = await Entreprises.lister();
    const histo = await DB.tout('historique');
    const visitees = new Set(histo.map((h) => h.entrepriseId));
    return entreprises.filter((e) => !visitees.has(e.id));
  }

  async function entreprisesVisitees() {
    const entreprises = await Entreprises.lister();
    const histo = await DB.tout('historique');
    const visitees = new Set(histo.map((h) => h.entrepriseId));
    return entreprises.filter((e) => visitees.has(e.id));
  }

  return {
    lister, pourEntreprise, pourMission, syntheseEntreprise,
    entreprisesJamaisVisitees, entreprisesVisitees
  };
})();
