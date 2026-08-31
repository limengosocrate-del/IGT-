/* =====================================================================
   statistiques.js — Agrégats pour le tableau de bord et le module
   Statistiques (entreprises, missions, agents, équipes, alertes).
   ===================================================================== */

const Statistiques = (() => {

  async function generer() {
    const [entreprises, agents, equipes, missions, ordres, histo] = await Promise.all([
      DB.tout('entreprises'),
      DB.tout('agents'),
      DB.tout('equipes'),
      DB.tout('missions'),
      DB.tout('ordres'),
      DB.tout('historique')
    ]);
    const prefs = await DB.getReglage('preferences', {});
    const maintenant = new Date();
    const annee = maintenant.getFullYear();
    const mois = maintenant.getMonth();

    const actives = missions.filter((m) => ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut));
    const termines = missions.filter((m) => m.statut === 'TERMINEE');
    const archivees = missions.filter((m) => m.statut === 'ARCHIVEE');
    const programmees = missions.filter((m) => ['BROUILLON', 'EN_VERIFICATION', 'VALIDEE'].includes(m.statut));

    // Statuts dynamiques des entreprises
    const entreprisesEnMission = new Set();
    for (const m of actives) (m.entrepriseIds || []).forEach((id) => entreprisesEnMission.add(id));

    let recemmentVisitees = 0;
    const seuil = prefs.joursVisiteRecente || 180;
    const dernVisite = new Map();
    for (const h of histo) {
      const ex = dernVisite.get(h.entrepriseId);
      if (!ex || h.dateVisite > ex) dernVisite.set(h.entrepriseId, h.dateVisite);
    }
    for (const [, date] of dernVisite) {
      const j = Math.round((maintenant - new Date(date + 'T00:00:00')) / 86400000);
      if (j >= 0 && j <= seuil) recemmentVisitees++;
    }

    const entreprisesActives = entreprises.filter((e) => e.statut !== 'ARCHIVEE');
    const entreprisesArchivees = entreprises.filter((e) => e.statut === 'ARCHIVEE');

    const agentsActifs = agents.filter((a) => a.actif !== false);
    const agentsEnMission = new Set();
    for (const m of actives) (m.agentIds || []).forEach((id) => agentsEnMission.add(id));

    // Charge par agent
    const charges = await Agents.chargesToutes();
    const seuilCharge = prefs.seuilChargeAgent || 12;
    const agentsForts = charges
      .filter((c) => c.annee >= seuilCharge || c.enCours >= 3)
      .sort((a, b) => b.annee - a.annee || b.total - a.total);

    // Classement des agents par nombre de missions
    const classementAgents = charges
      .slice()
      .sort((a, b) => b.total - a.total || b.annee - a.annee);

    // Missions par mois / année
    const missionsAnnee = missions.filter((m) => m.dateDebut && m.dateDebut.startsWith(String(annee)));
    const missionsMois = missions.filter((m) => {
      if (!m.dateDebut) return false;
      const d = new Date(m.dateDebut + 'T00:00:00');
      return d.getFullYear() === annee && d.getMonth() === mois;
    });

    // Équipes : missions réalisées / actives
    const statsEquipes = [];
    for (const eq of equipes) {
      const liées = missions.filter((m) => m.equipeId === eq.id);
      statsEquipes.push({
        equipe: eq,
        total: liées.length,
        actives: liées.filter((m) => ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut)).length,
        terminees: liées.filter((m) => m.statut === 'TERMINEE').length
      });
    }

    return {
      missions: {
        total: missions.length,
        enCours: actives.filter((m) => m.statut === 'EN_MISSION').length,
        programmees: programmees.length,
        validees: actives.filter((m) => m.statut === 'VALIDEE').length,
        terminees: termines.length,
        archivees: archivees.length,
        annee: missionsAnnee.length,
        mois: missionsMois.length
      },
      entreprises: {
        total: entreprisesActives.length,
        archivees: entreprisesArchivees.length,
        disponibles: entreprisesActives.filter((e) => !entreprisesEnMission.has(e.id)).length,
        enMission: entreprisesEnMission.size,
        recemmentVisitees
      },
      agents: {
        total: agents.length,
        actifs: agentsActifs.length,
        enMission: agentsEnMission.size
      },
      equipes: {
        total: equipes.length,
        enMission: statsEquipes.filter((e) => e.actives > 0).length
      },
      ordres: {
        total: ordres.length,
        archives: ordres.filter((o) => o.statut === 'ARCHIVE').length
      },
      alertes: {
        conflits: 0, // calculé à la volée par le module alertes
        entreprisesRecentes: recemmentVisitees,
        agentsForts: agentsForts.length
      },
      charges,
      classementAgents,
      statsEquipes,
      seuilCharge
    };
  }

  /** Détecte les conflits et alertes actuels (centre d'alertes). */
  async function alertes() {
    const missions = await DB.tout('missions');
    const stats = await generer();
    const liste = [];

    // Conflits : missions actives partageant une même entreprise
    const actives = missions.filter((m) => ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut));
    const occupation = new Map();
    for (const m of actives) {
      for (const eid of (m.entrepriseIds || [])) {
        if (!occupation.has(eid)) occupation.set(eid, []);
        occupation.get(eid).push(m);
      }
    }
    for (const [eid, ms] of occupation) {
      if (ms.length > 1) {
        const ent = await Entreprises.parId(eid);
        liste.push({
          type: 'conflit',
          ico: '🔴',
          titre: 'Conflit de mission',
          message: `${ent ? ent.denomination : 'Entreprise'} est affectée à ${ms.length} missions actives simultanées.`,
          missions: ms.map((x) => x.reference)
        });
      }
    }

    // Entreprises récemment visitées
    for (const c of stats.charges) void c;
    if (stats.entreprises.recemmentVisitees) {
      liste.push({
        type: 'visite',
        ico: '🟠',
        titre: 'Entreprises récemment visitées',
        message: `${stats.entreprises.recemmentVisitees} entreprise(s) visitée(s) récemment (seuil ${180} j).`
      });
    }

    // Agents fortement sollicités
    for (const c of stats.charges.filter((x) => x.annee >= stats.seuilCharge || x.enCours >= 3)) {
      liste.push({
        type: 'charge',
        ico: '⚠️',
        titre: 'Agent fortement sollicité',
        message: `${Utils.nomAgent(c.agent)} : ${c.annee} mission(s) cette année, ${c.enCours} en cours.`
      });
    }

    return liste;
  }

  return { generer, alertes };
})();
