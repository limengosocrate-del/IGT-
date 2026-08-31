/* =====================================================================
   missions.js — Cœur du système : création, planification et contrôle
   des missions. Moteur de vérification des conflits :
   - entreprise déjà en mission active      => CONFLIT bloquant (rouge)
   - entreprise visitée récemment           => AVERTISSEMENT (orange)
   - agent sur mission chevauchante         => CONFLIT bloquant
   - équipe déjà engagée sur le créneau     => CONFLIT bloquant
   - champs obligatoires manquants          => bloquant
   Un conflit non résolu INTERDIT la validation et l'impression.
   ===================================================================== */

const Missions = (() => {

  const STATUTS = ['BROUILLON', 'EN_VERIFICATION', 'VALIDEE', 'IMPRIMEE', 'EN_MISSION', 'TERMINEE', 'ARCHIVEE'];

  const STATUT_LIBELLES = {
    BROUILLON: 'Brouillon',
    EN_VERIFICATION: 'En vérification',
    VALIDEE: 'Validée',
    IMPRIMEE: 'Imprimée',
    EN_MISSION: 'En mission',
    TERMINEE: 'Terminée',
    ARCHIVEE: 'Archivée'
  };

  const STATUT_BADGES = {
    BROUILLON: 'badge--gris',
    EN_VERIFICATION: 'badge--jaune',
    VALIDEE: 'badge--bleu',
    IMPRIMEE: 'badge--vert',
    EN_MISSION: 'badge--rouge',
    TERMINEE: 'badge--vert',
    ARCHIVEE: 'badge--noir'
  };

  async function lister({ inclureArchivees = false } = {}) {
    const toutes = await DB.tout('missions');
    const filtrees = inclureArchivees ? toutes : toutes.filter((m) => m.statut !== 'ARCHIVEE');
    filtrees.sort((a, b) => (a.dateDebut || '') < (b.dateDebut || '') ? 1 : -1);
    return filtrees;
  }

  async function parId(id) {
    return DB.get('missions', id);
  }

  /** Entreprises liées à une mission (objets complets). */
  async function entreprisesDeMission(missionId) {
    const liens = await DB.parIndex('missionEntreprises', 'missionId', missionId);
    const toutes = await DB.tout('entreprises');
    return liens
      .map((l) => toutes.find((e) => e.id === l.entrepriseId))
      .filter(Boolean);
  }

  /** Agents liés à une mission (objets complets, avec rôle). */
  async function agentsDeMission(missionId) {
    const liens = await DB.parIndex('missionAgents', 'missionId', missionId);
    const tous = await DB.tout('agents');
    return liens
      .map((l) => {
        const agent = tous.find((a) => a.id === l.agentId);
        return agent ? { ...agent, roleDansMission: l.role, chef: !!l.chef } : null;
      })
      .filter(Boolean);
  }

  async function equipesDeMission(missionId) {
    const m = await parId(missionId);
    if (!m || !m.equipeId) return [];
    const eq = await Equipes.parId(m.equipeId);
    return eq ? [eq] : [];
  }

  /** Enregistre les liens mission↔entreprises et mission↔agents (remplace l'existant). */
  async function synchroniserLiens(missionId, entrepriseIds, agentLiens) {
    // Entreprises
    const anciensE = await DB.parIndex('missionEntreprises', 'missionId', missionId);
    for (const l of anciensE) await DB.supprimer('missionEntreprises', l.id);
    for (const entrepriseId of entrepriseIds) {
      await DB.ajouter('missionEntreprises', {
        id: Utils.uid('me'), missionId, entrepriseId, date: Utils.aujourdhui()
      });
    }
    // Agents
    const anciensA = await DB.parIndex('missionAgents', 'missionId', missionId);
    for (const l of anciensA) await DB.supprimer('missionAgents', l.id);
    for (const l of agentLiens) {
      await DB.ajouter('missionAgents', {
        id: Utils.uid('ma'), missionId, agentId: l.agentId,
        role: l.role || 'Membre', chef: !!l.chef
      });
    }
  }

  /**
   * Vérifie une entreprise dans le contexte d'une mission.
   * Retourne { niveau: 'ok'|'avertissement'|'conflit', ... }.
   */
  async function verifierEntreprise(entrepriseId, missionIdIgnore = null, dateDebut = null, dateFin = null) {
    const entreprise = await DB.get('entreprises', entrepriseId);
    if (!entreprise) return { niveau: 'conflit', motif: 'Entreprise introuvable dans le registre.' };

    // 1) Existe / archivée
    if (entreprise.statut === 'ARCHIVEE') {
      return { niveau: 'conflit', motif: "Cette entreprise est archivée et ne peut pas être affectée.", entreprise };
    }

    // 2) Déjà dans cette mission ? (doublon dans la sélection)
    const liensMission = await DB.parIndex('missionEntreprises', 'entrepriseId', entrepriseId);
    const dejaDansMission = liensMission.some((l) => l.missionId === missionIdIgnore);
    // (le doublon de sélection est géré à l'UI ; ici on continue)

    // 3) Affectée à une mission ACTIVE (VALIDEE / IMPRIMEE / EN_MISSION)
    const missions = await DB.tout('missions');
    for (const lien of liensMission) {
      if (lien.missionId === missionIdIgnore) continue;
      const mission = missions.find((m) => m.id === lien.missionId);
      if (!mission) continue;
      if (['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(mission.statut)) {
        const ordre = await Ordres.ordreDeMission(mission.id);
        const equipe = mission.equipeId ? await Equipes.parId(mission.equipeId) : null;
        return {
          niveau: 'conflit',
          motif: "Cette entreprise fait actuellement l'objet d'une mission.",
          entreprise,
          details: {
            mission: mission.reference || mission.objet || 'Mission',
            equipe: equipe ? equipe.nom : '—',
            ordre: ordre ? ordre.numero : '—',
            debut: mission.dateDebut,
            statut: STATUT_LIBELLES[mission.statut] || mission.statut
          }
        };
      }
    }

    // 4) Visite récente (historique)
    const prefs = await DB.getReglage('preferences', {});
    const seuil = prefs.joursVisiteRecente || 180;
    const historique = await DB.parIndex('historique', 'entrepriseId', entrepriseId);
    const visites = historique
      .filter((h) => h.dateVisite && h.missionId !== missionIdIgnore)
      .sort((a, b) => (a.dateVisite < b.dateVisite ? 1 : -1));
    if (visites.length) {
      const derniere = visites[0];
      const dateRef = dateDebut ? new Date(dateDebut + 'T00:00:00') : new Date();
      const dateVisite = new Date(derniere.dateVisite + 'T00:00:00');
      const jours = Math.round((dateRef - dateVisite) / 86400000);
      if (jours >= 0 && jours <= seuil) {
        const mission = missions.find((m) => m.id === derniere.missionId);
        const ordre = derniere.ordreNumero ||
          (mission ? await Ordres.ordreDeMission(mission.id).then((o) => o ? o.numero : '—') : '—');
        const equipe = mission && mission.equipeId ? await Equipes.parId(mission.equipeId) : null;
        return {
          niveau: 'avertissement',
          motif: 'Cette entreprise a déjà été visitée récemment.',
          entreprise,
          details: {
            derniereVisite: derniere.dateVisite,
            jours,
            equipe: equipe ? equipe.nom : '—',
            ordre: ordre || '—'
          }
        };
      }
    }

    return { niveau: 'ok', motif: 'Disponible', entreprise };
  }

  /** Contrôle complet d'une mission (toutes les entreprises + agents + équipe + champs). */
  async function verifierMission(mission) {
    const resultats = {
      entreprises: [],   // { entreprise, niveau, motif, details }
      agents: [],       // { agent, niveau, motif }
      equipe: null,     // { niveau, motif }
      champs: [],       // { champ, libelle, niveau }
      conflits: 0,
      avertissements: 0
    };

    const entrepriseIds = mission.entrepriseIds || [];
    const agentIds = (mission.agentIds || []).map((a) => (typeof a === 'string' ? { agentId: a } : a));

    // --- Champs obligatoires ---
    const requis = [
      ['reference', 'Référence'],
      ['equipeId', 'Équipe'],
      ['chefId', 'Chef de mission'],
      ['objet', 'Objet de la mission'],
      ['dateDebut', 'Date de début'],
      ['dateFin', 'Date de clôture'],
      ['lieu', 'Lieu'],
      ['imputation', 'Imputation']
    ];
    for (const [champ, libelle] of requis) {
      if (!mission[champ] || (Array.isArray(mission[champ]) && !mission[champ].length)) {
        resultats.champs.push({ champ, libelle, niveau: 'conflit' });
      }
    }
    if (!entrepriseIds.length) {
      resultats.champs.push({ champ: 'entreprises', libelle: 'Au moins une entreprise', niveau: 'conflit' });
    }
    if (!agentIds.length) {
      resultats.champs.push({ champ: 'agents', libelle: 'Au moins un agent', niveau: 'conflit' });
    }
    // Date de fin avant début
    if (mission.dateDebut && mission.dateFin && mission.dateFin < mission.dateDebut) {
      resultats.champs.push({ champ: 'dateFin', libelle: 'La date de clôture doit être après le début', niveau: 'conflit' });
    }

    // --- Entreprises ---
    const vues = new Set();
    for (const eid of entrepriseIds) {
      const r = await verifierEntreprise(eid, mission.id, mission.dateDebut, mission.dateFin);
      resultats.entreprises.push(r);
      if (r.niveau === 'conflit') resultats.conflits++;
      else if (r.niveau === 'avertissement') resultats.avertissements++;
      // doublon dans la même sélection
      if (vues.has(eid)) {
        resultats.entreprises.push({ niveau: 'conflit', motif: 'Entreprise sélectionnée plusieurs fois.', entreprise: r.entreprise });
        resultats.conflits++;
      }
      vues.add(eid);
    }

    // --- Agents : chevauchement de missions ---
    for (const lien of agentIds) {
      const agent = await Agents.parId(lien.agentId);
      if (!agent) continue;
      if (agent.actif === false) {
        resultats.agents.push({ agent, niveau: 'avertissement', motif: 'Agent désactivé.' });
        resultats.avertissements++;
        continue;
      }
      if (mission.dateDebut) {
        const chevauchement = await Agents.controleChevauchement(lien.agentId, mission.dateDebut, mission.dateFin, mission.id);
        if (chevauchement.length) {
          resultats.agents.push({
            agent, niveau: 'conflit',
            motif: `Agent déjà affecté à une mission active sur cette période (${chevauchement[0].reference || chevauchement[0].objet}).`
          });
          resultats.conflits++;
          continue;
        }
      }
      resultats.agents.push({ agent, niveau: 'ok' });
    }

    // --- Équipe : déjà engagée sur le créneau ---
    if (mission.equipeId && mission.dateDebut) {
      const autres = (await DB.tout('missions')).filter((m) =>
        m.id !== mission.id && m.equipeId === mission.equipeId &&
        ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut));
      const chevauche = autres.find((m) =>
        Utils.chevauche(mission.dateDebut, mission.dateFin || mission.dateDebut, m.dateDebut, m.dateFin || m.dateDebut));
      if (chevauche) {
        const eq = await Equipes.parId(mission.equipeId);
        resultats.equipe = {
          niveau: 'conflit',
          motif: `L'équipe ${eq ? eq.nom : ''} est déjà engagée sur une mission active sur cette période (${chevauche.reference || ''}).`
        };
        resultats.conflits++;
      } else {
        resultats.equipe = { niveau: 'ok' };
      }
    }

    resultats.peutValider = resultats.conflits === 0;
    resultats.peutImprimer = resultats.peutValider && mission.statut !== 'BROUILLON';
    return resultats;
  }

  /** Création ou mise à jour d'une mission (avec ses liens). */
  async function sauvegarder(formData, idExistant = null) {
    let mission = idExistant ? await DB.get('missions', idExistant) : null;
    const ancienne = mission ? { ...mission } : null;
    if (!mission) {
      mission = {
        id: Utils.uid('mis'),
        statut: 'BROUILLON',
        dateCreation: Utils.aujourdhui()
      };
    }
    const champsTextes = ['reference', 'structure', 'objet', 'objetPointsJson', 'imputation',
      'lieu', 'observations', 'duree'];
    for (const c of champsTextes) if (formData[c] !== undefined) mission[c] = formData[c];
    const champsDates = ['dateDebut', 'dateFin', 'dateReelleDebut', 'dateReelleFin',
      'dateCloture', 'dateRapport'];
    for (const c of champsDates) if (formData[c] !== undefined) mission[c] = formData[c];
    if (formData.rapportRendu !== undefined) mission.rapportRendu = !!formData.rapportRendu;
    if (formData.equipeId !== undefined) mission.equipeId = formData.equipeId;
    if (formData.chefId !== undefined) mission.chefId = formData.chefId;
    if (formData.entrepriseIds) mission.entrepriseIds = formData.entrepriseIds;
    if (formData.agentIds) {
      mission.agentIds = formData.agentIds.map((a) => typeof a === 'string' ? a : a.agentId);
    }
    await DB.put('missions', mission);

    // Liens many-to-many : si le formulaire partiel ne fournit pas de listes, on conserve les liens existants
    let entrepriseIds = formData.entrepriseIds;
    if (!entrepriseIds) {
      const liensE = await DB.parIndex('missionEntreprises', 'missionId', mission.id);
      entrepriseIds = liensE.map((l) => l.entrepriseId);
    }
    let agentLiensBruts = formData.agentIds;
    if (!agentLiensBruts) {
      const liensA = await DB.parIndex('missionAgents', 'missionId', mission.id);
      agentLiensBruts = liensA.map((l) => ({ agentId: l.agentId, chef: l.chef, role: l.role }));
    }
    const chefId = formData.chefId || mission.chefId;
    const agentLiens = agentLiensBruts.map((a) =>
      typeof a === 'string'
        ? { agentId: a, chef: a === chefId, role: a === chefId ? 'Chef de Mission' : 'Membre' }
        : { agentId: a.agentId, chef: a.chef, role: a.role });
    await synchroniserLiens(mission.id, entrepriseIds, agentLiens);

    await Audit.enregistrer(
      idExistant ? 'MODIFICATION' : 'CRÉATION',
      'Missions', mission.reference || mission.objet || 'Nouvelle mission',
      ancienne ? JSON.stringify(ancienne) : null,
      JSON.stringify(mission),
      idExistant ? 'Mission modifiée' : 'Mission créée (brouillon)'
    );
    return mission;
  }

  /** Changement de statut avec contrôles et effets de bord (historique, notifications). */
  async function changerStatut(missionId, nouveauStatut) {
    const mission = await DB.get('missions', missionId);
    if (!mission) throw new Error('Mission introuvable.');
    const avant = mission.statut;

    if (nouveauStatut === 'VALIDEE' || nouveauStatut === 'IMPRIMEE') {
      const controle = await verifierMission(mission);
      if (!controle.peutValider) {
        const msg = controle.entreprises.filter((e) => e.niveau === 'conflit').map((e) => '• ' + e.motif).join('\n');
        const champs = controle.champs.map((c) => '• Champ manquant : ' + c.libelle).join('\n');
        throw new Error("Impossible de valider : veuillez corriger les anomalies détectées.\n" +
          [msg, champs, controle.equipe && controle.equipe.niveau === 'conflit' ? '• ' + controle.equipe.motif : '']
            .filter(Boolean).join('\n'));
      }
    }

    mission.statut = nouveauStatut;
    if (nouveauStatut === 'EN_MISSION') mission.dateReelleDebut = Utils.aujourdhui();
    if (nouveauStatut === 'TERMINEE') mission.dateReelleFin = Utils.aujourdhui();
    await DB.put('missions', mission);

    // Effets de bord
    if (nouveauStatut === 'EN_MISSION' || nouveauStatut === 'VALIDEE') {
      // Créer l'ordre de mission automatiquement si absent
      const ordreExistant = await Ordres.ordreDeMission(mission.id);
      if (!ordreExistant) await Ordres.creerDepuisMission(mission);
    }
    if (nouveauStatut === 'EN_MISSION') {
      await Notifications.ajouter('succes', 'Mission démarrée',
        `La mission ${mission.reference || ''} est maintenant en cours.`, 'missions');
      // Historique : date de visite pour chaque entreprise
      const entreprises = mission.entrepriseIds || [];
      const ordre = await Ordres.ordreDeMission(mission.id);
      for (const eid of entreprises) {
        await DB.ajouter('historique', {
          id: Utils.uid('his'),
          missionId: mission.id,
          entrepriseId: eid,
          equipeId: mission.equipeId,
          ordreNumero: ordre ? ordre.numero : '',
          dateVisite: mission.dateDebut || Utils.aujourdhui(),
          dateDebutMission: mission.dateReelleDebut || Utils.aujourdhui(),
          statut: 'EN MISSION'
        });
      }
    }
    if (nouveauStatut === 'TERMINEE') {
      // Marquer les visites comme terminées ; la date de visite retenue est la date réelle de fin
      const dateCloture = mission.dateCloture || mission.dateReelleFin || Utils.aujourdhui();
      const histos = await DB.parIndex('historique', 'missionId', mission.id);
      for (const h of histos) {
        h.statut = 'TERMINÉE';
        h.dateFinVisite = dateCloture;
        h.dateVisite = dateCloture; // date utilisée pour le calcul « visitée récemment »
        await DB.put('historique', h);
      }
      await Notifications.ajouter('succes', 'Mission terminée',
        `La mission ${mission.reference || ''} a été clôturée. Les entreprises visitées sont archivées dans l'historique.`, 'historique');
    }

    await Audit.enregistrer('CHANGEMENT STATUT', 'Missions',
      mission.reference || mission.id, avant, nouveauStatut,
      `Statut : ${STATUT_LIBELLES[avant] || avant} → ${STATUT_LIBELLES[nouveauStatut] || nouveauStatut}`);
    return mission;
  }

  /** Archivage d'une mission terminée. */
  async function archiver(missionId) {
    const mission = await DB.get('missions', missionId);
    if (!mission) throw new Error('Mission introuvable.');
    if (!['TERMINEE', 'IMPRIMEE', 'VALIDEE'].includes(mission.statut)) {
      throw new Error("Seules les missions terminées ou clôturées peuvent être archivées.");
    }
    const avant = mission.statut;
    mission.statut = 'ARCHIVEE';
    mission.dateArchivage = Utils.aujourdhui();
    await DB.put('missions', mission);
    await Audit.enregistrer('ARCHIVAGE', 'Missions', mission.reference || mission.id,
      avant, 'ARCHIVEE', 'Mission archivée (conservée dans les archives)');
    return mission;
  }

  /** Mission active (VALIDEE/IMPRIMEE/EN_MISSION) contenant une entreprise donnée. */
  async function missionActivePourEntreprise(entrepriseId) {
    const liens = await DB.parIndex('missionEntreprises', 'entrepriseId', entrepriseId);
    const missions = await DB.tout('missions');
    for (const l of liens) {
      const m = missions.find((x) => x.id === l.missionId);
      if (m && ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(m.statut)) return m;
    }
    return null;
  }

  return {
    STATUTS, STATUT_LIBELLES, STATUT_BADGES,
    lister, parId, entreprisesDeMission, agentsDeMission, equipesDeMission,
    verifierEntreprise, verifierMission, sauvegarder, changerStatut, archiver,
    missionActivePourEntreprise
  };
})();
