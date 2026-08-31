/* =====================================================================
   ordres.js — Ordres de mission.
   - Numéro unique OM-IGT-AAAA-000001 (compteur en IndexedDB).
   - Génération du document à partir d'une mission et du modèle éditable.
   - QR code de vérification (référence de l'ordre, sans données sensibles).
   - Contrôle avant impression (blocage si conflit non résolu).
   - Modèle entièrement modifiable par l'administrateur (sauf footer).
   ===================================================================== */

const Ordres = (() => {

  const FOOTER_IMMUABLE = 'Créé par Inspecteur Limengo Daniel (Pmiller) 2026';

  async function lister() {
    const ordres = await DB.tout('ordres');
    ordres.sort((a, b) => (a.numero || '') < (b.numero || '') ? 1 : -1);
    return ordres;
  }

  async function parId(id) {
    return DB.get('ordres', id);
  }

  async function ordreDeMission(missionId) {
    const ordres = await DB.parIndex('ordres', 'missionId', missionId);
    return ordres[0] || null;
  }

  /** Recherche publique d'un ordre par son numéro (vérification QR / authentification). */
  async function parNumero(numero) {
    const n = String(numero || '').trim().toUpperCase();
    if (!n) return null;
    const ordres = await DB.tout('ordres');
    return ordres.find((o) => String(o.numero || '').toUpperCase() === n) || null;
  }

  /** Génère le prochain numéro unique pour l'année (compteur persisté). */
  async function prochainNumero(annee = new Date().getFullYear()) {
    const compteur = await DB.getReglage('compteur_ordres', {});
    const anneeStr = String(annee);
    const valeur = (compteur[anneeStr] || 0) + 1;
    return {
      numero: `OM-IGT-${annee}-${String(valeur).padStart(6, '0')}`,
      valeur,
      annee: anneeStr,
      compteur
    };
  }

  async function incrementerCompteur(annee, valeur) {
    const compteur = await DB.getReglage('compteur_ordres', {});
    compteur[String(annee)] = Math.max(compteur[String(annee)] || 0, valeur);
    await DB.setReglage('compteur_ordres', compteur);
  }

  /** Crée un ordre de mission à partir d'une mission validée. */
  async function creerDepuisMission(mission) {
    const existant = await ordreDeMission(mission.id);
    if (existant) return existant;

    const annee = mission.dateDebut ? mission.dateDebut.slice(0, 4) : String(new Date().getFullYear());
    const { numero, valeur, annee: anneeStr } = await prochainNumero(annee);
    await incrementerCompteur(anneeStr, valeur);

    const modele = await DB.getReglage('modele_ordre', DB.modeleDefaut());
    const ordre = {
      id: Utils.uid('ord'),
      missionId: mission.id,
      numero,
      dateCreation: Utils.aujourdhui(),
      statut: 'VALIDE',
      // Champs éditables (copie du modèle + données mission)
      structure: modele.structure,
      adresse: modele.adresse,
      titre: modele.titre,
      intro: modele.intro,
      introSuite: modele.introSuite,
      objetTitre: modele.objetTitre,
      formule: modele.formule,
      imputation: mission.imputation || modele.imputationDefaut,
      lieu: mission.lieu || modele.lieu,
      dateSignature: Utils.aujourdhui(),
      signataireNom: modele.signataireNom,
      signataireFonction: modele.signataireFonction,
      logoDataUrl: modele.logoDataUrl || '',
      objetPointsJson: mission.objetPointsJson || JSON.stringify(modele.objetPointsDefaut),
      qrReference: numero
    };
    await DB.put('ordres', ordre);
    await Audit.enregistrer('CRÉATION', 'Ordres', numero, null,
      JSON.stringify({ mission: mission.reference, numero }), 'Ordre de mission généré');
    return ordre;
  }

  /** Met à jour les champs éditables d'un ordre. */
  async function mettreAJour(id, champs) {
    const ordre = await parId(id);
    if (!ordre) throw new Error('Ordre introuvable.');
    const avant = { ...ordre };
    const editables = ['structure', 'adresse', 'titre', 'intro', 'introSuite', 'objetTitre',
      'formule', 'imputation', 'lieu', 'dateSignature', 'signataireNom', 'signataireFonction',
      'logoDataUrl', 'objetPointsJson'];
    for (const c of editables) if (champs[c] !== undefined) ordre[c] = champs[c];
    // Le footer n'est jamais modifiable : il reste constant.
    ordre.piedPage = FOOTER_IMMUABLE;
    await DB.put('ordres', ordre);
    await Audit.enregistrer('MODIFICATION', 'Ordres', ordre.numero,
      JSON.stringify(avant), JSON.stringify(ordre), "Modification du contenu de l'ordre");
    return ordre;
  }

  /** Archive un ordre (aucune suppression définitive). */
  async function archiver(id) {
    const ordre = await parId(id);
    if (!ordre) throw new Error('Ordre introuvable.');
    ordre.statut = 'ARCHIVE';
    ordre.dateArchivage = Utils.aujourdhui();
    await DB.put('ordres', ordre);
    await Audit.enregistrer('ARCHIVAGE', 'Ordres', ordre.numero, 'VALIDE', 'ARCHIVE', 'Ordre archivé');
    return ordre;
  }

  /** Contrôle d'imprimabilité : l'ordre ne peut être imprimé si conflit. */
  async function controleImpression(ordre) {
    const mission = await Missions.parId(ordre.missionId);
    const verifications = [];
    const verif = await Missions.verifierMission(mission);

    verifications.push({
      libelle: 'Entreprises',
      ok: verif.entreprises.every((e) => e.niveau !== 'conflit'),
      detail: `${verif.entreprises.length} entreprise(s) — ${verif.entreprises.filter((e) => e.niveau === 'conflit').length} conflit(s)`
    });
    verifications.push({
      libelle: 'Agents',
      ok: verif.agents.every((a) => a.niveau !== 'conflit'),
      detail: `${verif.agents.length} agent(s)`
    });
    verifications.push({
      libelle: 'Équipe',
      ok: !verif.equipe || verif.equipe.niveau !== 'conflit',
      detail: verif.equipe ? (verif.equipe.niveau === 'conflit' ? 'Conflit détecté' : 'OK') : '—'
    });
    verifications.push({
      libelle: 'Dates',
      ok: !!mission.dateDebut && (!mission.dateFin || mission.dateFin >= mission.dateDebut),
      detail: `${Utils.fmtDate(mission.dateDebut)} → ${Utils.fmtDate(mission.dateFin)}`
    });
    verifications.push({
      libelle: 'Objet',
      ok: !!(mission.objet && mission.objet.trim()),
      detail: mission.objet ? 'Renseigné' : 'Manquant'
    });
    verifications.push({
      libelle: 'Numéro',
      ok: !!ordre.numero,
      detail: ordre.numero || '—'
    });
    verifications.push({
      libelle: 'Structure',
      ok: !!(ordre.structure && ordre.structure.trim()),
      detail: ordre.structure || 'Manquante'
    });

    const pret = verifications.every((v) => v.ok) && verif.peutValider;
    return { pret, verifications, verif, mission };
  }

  /** Construit le HTML du document ordre de mission pour aperçu/impression. */
  async function rendreDocument(ordre) {
    const mission = await Missions.parId(ordre.missionId);
    const entreprises = await Missions.entreprisesDeMission(mission.id);
    const agents = await Missions.agentsDeMission(mission.id);

    const points = (() => {
      try {
        const p = JSON.parse(ordre.objetPointsJson || '[]');
        return Array.isArray(p) && p.length ? p : [];
      } catch { return []; }
    })();

    const listeEntreprises = entreprises.map((e) => e.denomination).join(', ');

    // Liste des agents numérotée (chef en premier)
    const agentsTries = [...agents].sort((a, b) => (b.chef ? 1 : 0) - (a.chef ? 1 : 0));
    const listeAgents = agentsTries.map((a, i) => {
      const role = a.chef
        ? (a.fonction || 'Chef de Mission') + ' / Chef de Mission'
        : (a.fonction || a.grade || 'Membre');
      return `<tr><td style="width:34px">${String(i + 1).padStart(2, '0')}</td>
        <td>${Utils.esc(Utils.nomAgent(a))}</td>
        <td>${Utils.esc(role)}</td></tr>`;
    }).join('');

    const objetHtml = points.map((p) => `<li>${Utils.esc(p)}</li>`).join('');

    const duree = mission.duree ||
      `${Utils.nbJours(mission.dateDebut, mission.dateFin)} (${Utils.nombreEnLettres(Utils.nbJours(mission.dateDebut, mission.dateFin))}) jours`;

    const logo = ordre.logoDataUrl
      ? `<img src="${ordre.logoDataUrl}" alt="Logo" style="height:16mm; margin-bottom:2mm">`
      : '';

    return `
    <div class="a4 om-doc">
      <div class="page">
        <div class="om-entete">
          ${logo}
          <div style="font-weight:bold; font-size:11pt; text-transform:uppercase">${Utils.esc(ordre.structure)}</div>
          <div style="font-size:9.5pt">${Utils.esc(ordre.adresse)}</div>
        </div>

        <div class="om-titre">${Utils.esc(ordre.titre)}</div>
        <div class="om-numero">N° ${Utils.esc(ordre.numero)}</div>

        <p class="om-intro">
          ${Utils.esc(ordre.intro)}
          <strong>${Utils.esc(listeEntreprises)}</strong>
          ${Utils.esc(ordre.introSuite)} <strong>${Utils.esc(ordre.lieu)}</strong>.
          Il s'agit de :
        </p>

        <table class="om-liste-agents" style="width:100%; border-collapse:collapse; margin:2mm 0 4mm; font-size:10.5pt">
          <tbody>${listeAgents}</tbody>
        </table>

        <div class="om-section-titre">${Utils.esc(ordre.objetTitre)}</div>
        <ol class="objet-items">${objetHtml}</ol>

        <div class="om-infos">
          <p><strong>DURÉE DE LA MISSION&nbsp;:</strong> ${Utils.esc(duree)}</p>
          <p><strong>DATE DE DÉBUT&nbsp;:</strong> ${Utils.fmtDateLongue(mission.dateDebut)}</p>
          <p><strong>DATE DE CLÔTURE&nbsp;:</strong> ${Utils.fmtDateLongue(mission.dateFin)}</p>
          <p><strong>IMPUTATION&nbsp;:</strong> ${Utils.esc(ordre.imputation)}</p>
        </div>

        <p class="om-formule">${Utils.esc(ordre.formule)}</p>

        <p style="margin-top:6mm">Fait à ${Utils.esc(ordre.lieu)}, le ${Utils.fmtDateLongue(ordre.dateSignature).replace(/^le\s+/, '')}</p>

        <div class="om-signature">
          <div class="om-signataire">${Utils.esc(ordre.signataireNom)}</div>
          <div class="om-fonction">${Utils.esc(ordre.signataireFonction)}</div>
        </div>

        <div class="om-qr qr-box">
          <canvas id="qr-ordre"></canvas>
          <span>Vérification&nbsp;: ${Utils.esc(ordre.numero)}</span>
        </div>

        <div class="om-pied">${Utils.esc(FOOTER_IMMUABLE)}</div>
      </div>
    </div>`;
  }

  /** Dessine le QR code après insertion du document dans le DOM. */
  function dessinerQR(ordre, canvas) {
    if (!canvas) return;
    const contenu = `VERIF:${ordre.numero}|IGT-RDC`;
    QRCode.dessiner(contenu, canvas, 200);
  }

  async function mettreAJourModele(champs) {
    const modele = await DB.getReglage('modele_ordre', DB.modeleDefaut());
    const editables = ['structure', 'adresse', 'titre', 'intro', 'introSuite', 'objetTitre',
      'formule', 'imputationDefaut', 'lieu', 'signataireNom', 'signataireFonction',
      'logoDataUrl', 'objetPointsDefaut'];
    for (const c of editables) if (champs[c] !== undefined) modele[c] = champs[c];
    // Le pied de page du modèle reste immuable.
    modele.piedPage = FOOTER_IMMUABLE;
    await DB.setReglage('modele_ordre', modele);
    await Audit.enregistrer('MODIFICATION', 'Paramètres', 'Modèle d\'ordre de mission',
      null, JSON.stringify(champs), 'Mise à jour du modèle des ordres');
    return modele;
  }

  async function modele() {
    return await DB.getReglage('modele_ordre', DB.modeleDefaut());
  }

  return {
    FOOTER_IMMUABLE,
    lister, parId, parNumero, ordreDeMission, prochainNumero, creerDepuisMission,
    mettreAJour, archiver, controleImpression, rendreDocument, dessinerQR,
    mettreAJourModele, modele
  };
})();
