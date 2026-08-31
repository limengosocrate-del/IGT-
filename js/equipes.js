/* =====================================================================
   equipes.js — Gestion des équipes / groupes de travail (Groupe 01…).
   Création, affectation d'agents, consultation. Un agent n'appartient
   qu'à un seul groupe à la fois (sa réaffectation déplace l'agent).
   ===================================================================== */

const Equipes = (() => {

  async function lister() {
    const equipes = await DB.tout('equipes');
    equipes.sort((a, b) => Utils.normaliser(a.nom).localeCompare(Utils.normaliser(b.nom)));
    return equipes;
  }

  async function parId(id) {
    return DB.get('equipes', id);
  }

  async function sauvegarder(formData, idExistant = null) {
    const nom = String(formData.nom || '').trim();
    if (!nom) throw new Error("Le nom de l'équipe est obligatoire (ex. Groupe 03).");
    let equipe = idExistant ? await DB.get('equipes', idExistant) : null;
    const ancienne = equipe ? { ...equipe } : null;
    if (!equipe) {
      equipe = { id: Utils.uid('eqp'), nom, agentIds: [], dateCreation: Utils.aujourdhui() };
    }
    equipe.nom = nom.toUpperCase();
    equipe.description = String(formData.description || '').trim();
    if (Array.isArray(formData.agentIds)) equipe.agentIds = formData.agentIds;
    await DB.put('equipes', equipe);

    // Cohérence : un agent ne peut appartenir qu'à une seule équipe.
    // Retirer cet agent des autres équipes.
    if (Array.isArray(formData.agentIds)) {
      const autres = (await lister()).filter((e) => e.id !== equipe.id);
      let modifiees = false;
      for (const aut of autres) {
        const avant = aut.agentIds.length;
        aut.agentIds = (aut.agentIds || []).filter((id) => !equipe.agentIds.includes(id));
        if (aut.agentIds.length !== avant) { await DB.put('equipes', aut); modifiees = true; }
      }
      void modifiees;
    }

    await Audit.enregistrer(
      idExistant ? 'MODIFICATION' : 'CRÉATION',
      'Équipes', equipe.nom,
      ancienne ? JSON.stringify(ancienne) : null,
      JSON.stringify(equipe),
      idExistant ? "Modification d'une équipe" : "Création d'une équipe"
    );
    return equipe;
  }

  /** Retire un agent d'une équipe. */
  async function retirerAgent(equipeId, agentId) {
    const equipe = await DB.get('equipes', equipeId);
    if (!equipe) throw new Error("Équipe introuvable.");
    const avant = (equipe.agentIds || []).length;
    equipe.agentIds = (equipe.agentIds || []).filter((id) => id !== agentId);
    if (equipe.agentIds.length === avant) return equipe;
    await DB.put('equipes', equipe);
    const agent = await Agents.parId(agentId);
    await Audit.enregistrer('MODIFICATION', 'Équipes', equipe.nom,
      `Agent ${agent ? Utils.nomAgent(agent) : agentId} présent`,
      'Agent retiré', "Retrait d'un agent de l'équipe");
    return equipe;
  }

  /** Liste détaillée des agents d'une équipe (objets agents complets). */
  async function agentsDeEquipe(equipeId) {
    const equipe = await DB.get('equipes', equipeId);
    if (!equipe) return [];
    const tous = await DB.tout('agents');
    return (equipe.agentIds || [])
      .map((id) => tous.find((a) => a.id === id))
      .filter(Boolean);
  }

  /** Équipe à laquelle appartient un agent (ou null). */
  async function equipeDeAgent(agentId) {
    const equipes = await lister();
    return equipes.find((e) => (e.agentIds || []).includes(agentId)) || null;
  }

  /** Équipe actuellement en mission active (pour alertes). */
  async function equipesEnMission() {
    const missions = await DB.tout('missions');
    const ids = new Set(missions
      .filter((m) => ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut))
      .map((m) => m.equipeId)
      .filter(Boolean));
    return (await lister()).filter((e) => ids.has(e.id));
  }

  return { lister, parId, sauvegarder, retirerAgent, agentsDeEquipe, equipeDeAgent, equipesEnMission };
})();
