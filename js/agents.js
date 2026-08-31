/* =====================================================================
   agents.js — Gestion des agents de l'Inspection.
   Ajout / modification / activation / désactivation / recherche.
   Aucune suppression définitive ; un agent désactivé est conservé pour
   l'historique. Calcul de la charge de missions (répartition équilibrée).
   ===================================================================== */

const Agents = (() => {

  const CHAMPS = [
    ['nom', 'Nom', true],
    ['postnom', 'Post-nom', false],
    ['prenom', 'Prénom', false],
    ['matricule', 'Matricule', false],
    ['grade', 'Grade', false],
    ['fonction', 'Fonction', false],
    ['service', 'Service', false],
    ['affectation', 'Affectation', false],
    ['observations', 'Observations', false]
  ];

  const GRADES = ['Inspecteur du Travail', 'Contrôleur du Travail', 'Inspecteur Principal', 'Autre'];
  const FONCTIONS = ['Chef de Mission', 'Membre', 'Contrôleur', 'Inspecteur'];

  async function lister({ actifsSeulement = false } = {}) {
    const tous = await DB.tout('agents');
    tous.sort((a, b) => Utils.normaliser(Utils.nomAgent(a)).localeCompare(Utils.normaliser(Utils.nomAgent(b))));
    return actifsSeulement ? tous.filter((a) => a.actif !== false) : tous;
  }

  async function parId(id) {
    return DB.get('agents', id);
  }

  async function sauvegarder(formData, idExistant = null) {
    const nom = String(formData.nom || '').trim();
    if (!nom) throw new Error("Le nom de l'agent est obligatoire.");
    let agent = idExistant ? await DB.get('agents', idExistant) : null;
    const ancienne = agent ? { ...agent } : null;
    if (!agent) {
      // Doublon sur matricule s'il est fourni
      if (formData.matricule) {
        const tous = await DB.tout('agents');
        if (tous.some((a) => Utils.normaliser(a.matricule) === Utils.normaliser(formData.matricule))) {
          throw new Error(`Un agent porte déjà le matricule « ${formData.matricule} ».`);
        }
      }
      agent = { id: Utils.uid('agt'), actif: true, dateEnregistrement: Utils.aujourdhui() };
    }
    for (const [champ] of CHAMPS) agent[champ] = String(formData[champ] || '').trim();
    if (formData.actif !== undefined) agent.actif = !!formData.actif;
    await DB.put('agents', agent);
    await Audit.enregistrer(
      idExistant ? 'MODIFICATION' : 'CRÉATION',
      'Agents', Utils.nomAgent(agent),
      ancienne ? JSON.stringify(ancienne) : null,
      JSON.stringify(agent),
      idExistant ? "Modification d'un agent" : "Ajout d'un agent"
    );
    return agent;
  }

  async function definirActif(id, actif) {
    const agent = await DB.get('agents', id);
    if (!agent) throw new Error("Agent introuvable.");
    const avant = agent.actif !== false;
    agent.actif = !!actif;
    await DB.put('agents', agent);
    await Audit.enregistrer(actif ? 'ACTIVATION' : 'DÉSACTIVATION', 'Agents',
      Utils.nomAgent(agent), avant ? 'Actif' : 'Inactif', actif ? 'Actif' : 'Inactif',
      actif ? 'Agent réactivé' : 'Agent désactivé (conservé pour l\'historique)');
    return agent;
  }

  async function rechercher(terme) {
    const tous = await lister();
    const t = Utils.normaliser(terme);
    if (!t) return tous;
    return tous.filter((a) =>
      CHAMPS.some(([c]) => Utils.normaliser(a[c]).includes(t))
    );
  }

  /** Toutes les missions liées à un agent (via missionAgents). */
  async function missionsDeAgent(agentId) {
    const liens = await DB.parIndex('missionAgents', 'agentId', agentId);
    const missions = await DB.tout('missions');
    return liens
      .map((l) => missions.find((m) => m.id === l.missionId))
      .filter(Boolean);
  }

  /** Statistiques de charge d'un agent (totales, année, mois, en cours, dernière). */
  async function charge(agentId, now = new Date()) {
    const missions = await missionsDeAgent(agentId);
    const annee = now.getFullYear();
    const mois = now.getMonth();
    let total = 0, anneeN = 0, moisN = 0, enCours = 0;
    let derniere = null;
    for (const m of missions) {
      total++;
      const d = m.dateDebut ? new Date(m.dateDebut + 'T00:00:00') : null;
      if (d) {
        if (d.getFullYear() === annee) anneeN++;
        if (d.getFullYear() === annee && d.getMonth() === mois) moisN++;
        if (!derniere || d > derniere) derniere = d;
      }
      if (['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut)) enCours++;
    }
    return { total, annee: anneeN, mois: moisN, enCours,
             derniereMission: derniere ? derniere.toISOString().slice(0, 10) : null };
  }

  /** Charge de tous les agents (pour détecter les déséquilibres). */
  async function chargesToutes() {
    const agents = await lister({ actifsSeulement: true });
    const resultats = [];
    for (const a of agents) {
      const ch = await charge(a.id);
      resultats.push({ agent: a, ...ch });
    }
    return resultats;
  }

  /** Vérifie qu'un agent n'est pas déjà pris sur une mission se chevauchant. */
  async function controleChevauchement(agentId, debut, fin, missionIdIgnore = null) {
    const missions = await missionsDeAgent(agentId);
    const conflits = [];
    for (const m of missions) {
      if (m.id === missionIdIgnore) continue;
      if (!['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut)) continue;
      if (!m.dateDebut) continue;
      if (Utils.chevauche(debut, fin || debut, m.dateDebut, m.dateFin || m.dateDebut)) {
        conflits.push(m);
      }
    }
    return conflits;
  }

  return {
    CHAMPS, GRADES, FONCTIONS,
    lister, parId, sauvegarder, definirActif, rechercher,
    missionsDeAgent, charge, chargesToutes, controleChevauchement
  };
})();
