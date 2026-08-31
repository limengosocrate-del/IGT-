/* =====================================================================
   app.js — Cœur de l'interface : routage des modules, rendu des écrans,
   modales, formulaire de mission avec contrôle en direct des conflits,
   génération/aperçu/impression des ordres, calendrier, paramètres.
   ===================================================================== */

/* ---------- Petites aides d'interface partagées ---------- */
const UI = (() => {
  function modale({ titre = '', corps = '', pieds = '', taille = '' }) {
    const conteneur = document.getElementById('conteneur-modales');
    const overlay = Utils.el('div', { class: 'modal-overlay' });
    const boite = Utils.el('div', { class: `modal ${taille}`, role: 'dialog', 'aria-modal': 'true' });
    boite.innerHTML = `
      <div class="modal-head">
        <h3>${Utils.esc(titre)}</h3>
        <button class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body">${corps}</div>
      ${pieds ? `<div class="modal-foot">${pieds}</div>` : ''}`;
    overlay.appendChild(boite);
    conteneur.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    document.body.classList.add('modal-ouverte');

    const fermer = () => {
      overlay.classList.remove('open');
      document.body.classList.remove('modal-ouverte');
      setTimeout(() => overlay.remove(), 220);
    };
    boite.querySelector('.modal-close').addEventListener('click', fermer);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fermer(); });
    document.addEventListener('keydown', function echappe(e) {
      if (e.key === 'Escape' && document.body.contains(overlay)) { fermer(); document.removeEventListener('keydown', echappe); }
    });
    return { overlay, boite, fermer, body: boite.querySelector('.modal-body'), foot: boite.querySelector('.modal-foot') };
  }
  return { modale };
})();

/* =====================================================================
   APPLICATION
   ===================================================================== */
const App = (() => {

  const TITRES = {
    dashboard: 'Tableau de bord',
    missions: 'Missions',
    ordres: 'Ordres de mission',
    calendrier: 'Calendrier des missions',
    entreprises: 'Registre des entreprises',
    agents: 'Agents',
    equipes: 'Équipes / Groupes',
    historique: 'Historique',
    statistiques: 'Statistiques',
    archives: 'Archives',
    alertes: 'Alertes & notifications',
    parametres: 'Paramètres',
    journal: 'Journal de traçabilité'
  };

  let moduleActif = 'dashboard';

  /* ---------------- Initialisation ---------------- */
  async function init() {
    if (!Auth.protegerPage()) return;
    await DB.initialiser();

    // Menu
    document.querySelectorAll('.nav-item[data-module]').forEach((item) => {
      item.addEventListener('click', () => {
        const mod = item.dataset.module;
        if (mod === 'deconnexion') { Auth.deconnexion(); return; }
        naviguer(mod);
        // ferme le tiroir mobile
        document.getElementById('sidebar').classList.remove('ouverte');
        document.getElementById('sidebar-voile').classList.remove('visible');
      });
    });

    document.getElementById('btn-hamburger').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('ouverte');
      document.getElementById('sidebar-voile').classList.toggle('visible');
    });
    document.getElementById('sidebar-voile').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('ouverte');
      document.getElementById('sidebar-voile').classList.remove('visible');
    });

    document.getElementById('btn-cloche').addEventListener('click', () => naviguer('alertes'));

    // Indicateur réseau
    majIndicateurReseau();
    window.addEventListener('online', majIndicateurReseau);
    window.addEventListener('offline', majIndicateurReseau);

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('SW:', e));
    }

    await majBadges();
    await naviguer(moduleActif);
  }

  function majIndicateurReseau() {
    const indicateur = document.getElementById('indicateur-reseau');
    const texte = document.getElementById('texte-reseau');
    if (navigator.onLine) {
      indicateur.classList.remove('offline');
      texte.textContent = 'En ligne';
    } else {
      indicateur.classList.add('offline');
      texte.textContent = 'Hors ligne — données locales';
    }
  }

  async function majBadges() {
    try {
      const nonLues = await Notifications.nombreNonLues();
      const badgeCloche = document.getElementById('badge-cloche');
      const badgeMenu = document.getElementById('badge-alertes');
      if (nonLues > 0) {
        badgeCloche.style.display = 'flex'; badgeCloche.textContent = nonLues > 99 ? '99+' : nonLues;
        badgeMenu.style.display = 'inline-flex'; badgeMenu.textContent = nonLues > 99 ? '99+' : nonLues;
      } else {
        badgeCloche.style.display = 'none'; badgeMenu.style.display = 'none';
      }
    } catch (e) { console.warn(e); }
  }

  async function naviguer(module) {
    moduleActif = module;
    document.querySelectorAll('.nav-item[data-module]').forEach((i) =>
      i.classList.toggle('actif', i.dataset.module === module));
    document.getElementById('titre-page').childNodes[0].textContent = TITRES[module] || 'Tableau de bord';
    const conteneur = document.getElementById('contenu-module');
    conteneur.innerHTML = '<div class="empty-state"><span class="ico">⏳</span> Chargement…</div>';
    try {
      const rendu = await VUES[module]();
      conteneur.innerHTML = rendu;
      if (APRES[module]) await APRES[module]();
    } catch (e) {
      console.error(e);
      conteneur.innerHTML = `<div class="alerte alerte--rouge"><span class="ico">⛔</span>
        <span><strong>Une erreur est survenue</strong>${Utils.esc(e.message || 'Erreur inattendue.')}</span></div>`;
    }
  }

  /* =================================================================
     VUES — chaque fonction retourne le HTML ; APRES fait le câblage
     ================================================================= */
  const VUES = {};
  const APRES = {};

  /* ---------------- TABLEAU DE BORD ---------------- */
  VUES.dashboard = async () => {
    const s = await Statistiques.generer();
    const missions = await Missions.lister();
    const recentes = missions.slice(0, 6);

    const carteMission = recentes.map(async (m) => {
      const eq = m.equipeId ? await Equipes.parId(m.equipeId) : null;
      return `<tr>
        <td data-label="Référence"><strong>${Utils.esc(m.reference || '—')}</strong></td>
        <td data-label="Équipe">${eq ? Utils.esc(eq.nom) : '—'}</td>
        <td data-label="Début">${Utils.fmtDate(m.dateDebut)}</td>
        <td data-label="Statut"><span class="badge ${Missions.STATUT_BADGES[m.statut]}">${Missions.STATUT_LIBELLES[m.statut]}</span></td>
        <td data-label="Actions"><button class="btn btn--outline btn--sm" data-voir-mission="${m.id}">Ouvrir</button></td>
      </tr>`;
    });
    const lignes = (await Promise.all(carteMission)).join('');

    return `
    <div class="stats-grid">
      ${carteStat('🗂️', s.missions.enCours, 'Missions en cours', 'rouge')}
      ${carteStat('📅', s.missions.programmees, 'Missions programmées', 'bleu')}
      ${carteStat('✅', s.missions.terminees, 'Missions terminées', 'vert')}
      ${carteStat('🗃️', s.missions.archivees, 'Missions archivées', 'violet')}
      ${carteStat('🏢', s.entreprises.total, 'Entreprises (total)', 'bleu')}
      ${carteStat('🟢', s.entreprises.disponibles, 'Entreprises disponibles', 'vert')}
      ${carteStat('🟠', s.entreprises.recemmentVisitees, 'Récemment visitées', 'orange')}
      ${carteStat('🔴', s.entreprises.enMission, 'En mission', 'rouge')}
      ${carteStat('👥', s.agents.actifs, 'Agents actifs', 'bleu')}
      ${carteStat('🧑‍🤝‍🧑', s.agents.enMission, 'Agents en mission', 'jaune')}
      ${carteStat('🧾', s.ordres.total, 'Ordres générés', 'vert')}
      ${carteStat('📆', s.missions.annee, `Missions en ${new Date().getFullYear()}`, 'bleu')}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title"><span class="barre"></span> Alertes</div>
        <div id="dashboard-alertes"><div class="empty-state">Analyse…</div></div>
      </div>
      <div class="card">
        <div class="card-title"><span class="barre"></span> Missions récentes</div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Référence</th><th>Équipe</th><th>Début</th><th>Statut</th><th></th></tr></thead>
            <tbody>${lignes || '<tr><td colspan="5" class="empty-state">Aucune mission pour le moment.</td></tr>'}</tbody>
          </table>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn--jaune" data-aller="missions"><span class="ico">＋</span><span class="btn-label">Nouvelle mission</span></button>
        </div>
      </div>
    </div>`;
  };
  APRES.dashboard = async () => {
    const alertes = await Statistiques.alertes();
    const zone = document.getElementById('dashboard-alertes');
    if (!alertes.length) {
      zone.innerHTML = '<div class="alerte alerte--vert"><span class="ico">🟢</span><span><strong>Aucune alerte</strong>Tous les indicateurs sont au vert.</span></div>';
    } else {
      zone.innerHTML = alertes.slice(0, 6).map((a) =>
        `<div class="alerte alerte--${a.type === 'conflit' ? 'rouge' : a.type === 'visite' ? 'orange' : 'bleu'}">
          <span class="ico">${a.ico}</span><span><strong>${Utils.esc(a.titre)}</strong>${Utils.esc(a.message)}</span></div>`).join('');
    }
    document.querySelectorAll('[data-voir-mission]').forEach((b) =>
      b.addEventListener('click', () => { naviguer('missions'); setTimeout(() => ouvrirMission(b.dataset.voirMission), 50); }));
    document.querySelectorAll('[data-aller]').forEach((b) =>
      b.addEventListener('click', () => naviguer(b.dataset.aller)));
  };

  function carteStat(ico, valeur, libelle, couleur) {
    return `<div class="stat-card ${couleur}">
      <div class="s-ico">${ico}</div>
      <div><div class="s-val">${valeur}</div><div class="s-lbl">${Utils.esc(libelle)}</div></div>
    </div>`;
  }

  /* ---------------- ENTREPRISES ---------------- */
  VUES.entreprises = async () => {
    return `
    <div class="card">
      <div class="toolbar">
        <div class="search-box"><span class="ico">🔍</span>
          <input class="input" id="rech-entreprise" type="search" placeholder="Rechercher (nom, RCCM, ID, fiscal, province, ville, secteur)…">
        </div>
        <button class="btn btn--gris btn--sm" id="btn-import-csv">📄 Importer CSV</button>
        <button class="btn btn--outline btn--sm" id="btn-export-csv-ent">⬇️ Export CSV</button>
        <div class="spacer"></div>
        <button class="btn btn--jaune" id="btn-coller"><span class="ico">📋</span><span class="btn-label">Coller une liste</span></button>
        <button class="btn" id="btn-nouvelle-entreprise"><span class="ico">＋</span><span class="btn-label">Ajouter</span></button>
      </div>
      <label style="display:inline-flex;gap:8px;align-items:center;font-size:.85rem;margin-bottom:10px">
        <input type="checkbox" id="inclure-archivees" style="width:18px;height:18px"> Inclure les entreprises archivées
      </label>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Dénomination</th><th>RCCM</th><th>Province</th><th>Ville</th><th>Secteur</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody id="corps-entreprises"></tbody>
        </table>
      </div>
    </div>`;
  };
  APRES.entreprises = async () => {
    const corps = document.getElementById('corps-entreprises');
    const rendu = async () => {
      const inclure = document.getElementById('inclure-archivees').checked;
      const terme = document.getElementById('rech-entreprise').value;
      const listes = await Entreprises.rechercher(terme, { inclureArchivees: inclure });
      if (!listes.length) {
        corps.innerHTML = '<tr><td colspan="7" class="empty-state"><span class="ico">🏢</span>Aucune entreprise trouvée.</td></tr>';
        return;
      }
      corps.innerHTML = (await Promise.all(listes.map(async (e) => {
        const st = await Entreprises.statutCalcule(e);
        return `<tr>
          <td data-label="Dénomination"><strong>${Utils.esc(e.denomination)}</strong></td>
          <td data-label="RCCM">${Utils.esc(e.rccm || '—')}</td>
          <td data-label="Province">${Utils.esc(e.province || '—')}</td>
          <td data-label="Ville">${Utils.esc(e.ville || '—')}</td>
          <td data-label="Secteur">${Utils.esc(e.secteur || '—')}</td>
          <td data-label="Statut"><span class="badge ${st.badge}">${st.ico} ${Utils.esc(st.libelle)}</span></td>
          <td data-label="Actions">
            <div class="row-actions">
              <button class="btn btn--outline btn--sm" data-fiche="${e.id}">Fiche</button>
              <button class="btn btn--gris btn--sm" data-histo="${e.id}">Historique</button>
              <button class="btn btn--sm" style="--btn-bg:#1155a8" data-modif="${e.id}">Modifier</button>
              ${e.statut === 'ARCHIVEE'
                ? `<button class="btn btn--vert btn--sm" data-reactiver="${e.id}">Réactiver</button>`
                : `<button class="btn btn--rouge btn--sm" data-arch="${e.id}">Archiver</button>`}
            </div>
          </td></tr>`;
      }))).join('');
      corps.querySelectorAll('[data-modif]').forEach((b) => b.addEventListener('click', () => formulaireEntreprise(b.dataset.modif)));
      corps.querySelectorAll('[data-fiche]').forEach((b) => b.addEventListener('click', () => ficheEntreprise(b.dataset.fiche)));
      corps.querySelectorAll('[data-histo]').forEach((b) => b.addEventListener('click', () => ficheHistoriqueEntreprise(b.dataset.histo)));
      corps.querySelectorAll('[data-arch]').forEach((b) => b.addEventListener('click', async () => {
        if (await Utils.confirmer('Archiver l\'entreprise', 'L\'entreprise sera conservée dans les archives (aucune suppression définitive). Continuer ?', { okLabel: 'Archiver' })) {
          try { await Entreprises.archiver(b.dataset.arch); Utils.toast('Entreprise archivée.', 'succes'); rendu(); }
          catch (e) { Utils.toast(e.message, 'erreur', 6000); }
        }
      }));
      corps.querySelectorAll('[data-reactiver]').forEach((b) => b.addEventListener('click', async () => {
        await Entreprises.reactiver(b.dataset.reactiver); Utils.toast('Entreprise réactivée.', 'succes'); rendu();
      }));
    };
    document.getElementById('rech-entreprise').addEventListener('input', Utils.debounce(rendu, 200));
    document.getElementById('inclure-archivees').addEventListener('change', rendu);
    document.getElementById('btn-nouvelle-entreprise').addEventListener('click', () => formulaireEntreprise());
    document.getElementById('btn-coller').addEventListener('click', modaleCollerListe);
    document.getElementById('btn-import-csv').addEventListener('click', modaleImportCSV);
    document.getElementById('btn-export-csv-ent').addEventListener('click', () => ImportExport.exporterCSV('entreprises'));
    await rendu();
  };

  async function formulaireEntreprise(id = null) {
    const e = id ? await Entreprises.parId(id) : {};
    const provinces = await DB.tout('provinces');
    const opts = provinces.map((p) =>
      `<option value="${Utils.esc(p.nom)}" ${e.province === p.nom ? 'selected' : ''}>${Utils.esc(p.nom)}</option>`).join('');
    const m = UI.modale({
      titre: id ? "Modifier l'entreprise" : 'Nouvelle entreprise',
      taille: 'modal--lg',
      corps: `
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>Dénomination <span class="req">*</span></label>
          <input class="input" id="f-denomination" value="${Utils.esc(e.denomination || '')}" placeholder="Ex. AFRIPHAR"></div>
        <div class="field"><label>RCCM</label><input class="input" id="f-rccm" value="${Utils.esc(e.rccm || '')}"></div>
        <div class="field"><label>ID National</label><input class="input" id="f-idnat" value="${Utils.esc(e.idNational || '')}"></div>
        <div class="field"><label>Numéro fiscal</label><input class="input" id="f-fiscal" value="${Utils.esc(e.numeroFiscal || '')}"></div>
        <div class="field"><label>Secteur</label><input class="input" id="f-secteur" value="${Utils.esc(e.secteur || '')}" placeholder="Pharmacie, hôtellerie…"></div>
        <div class="field"><label>Province</label><select class="input" id="f-province"><option value="">— Choisir —</option>${opts}</select></div>
        <div class="field"><label>Ville</label><input class="input" id="f-ville" value="${Utils.esc(e.ville || '')}"></div>
        <div class="field"><label>Commune</label><input class="input" id="f-commune" value="${Utils.esc(e.commune || '')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Adresse</label><input class="input" id="f-adresse" value="${Utils.esc(e.adresse || '')}"></div>
        <div class="field"><label>Téléphone</label><input class="input" id="f-tel" type="tel" inputmode="tel" value="${Utils.esc(e.telephone || '')}"></div>
        <div class="field"><label>Responsable</label><input class="input" id="f-resp" value="${Utils.esc(e.responsable || '')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Observations</label><textarea class="input" id="f-obs">${Utils.esc(e.observations || '')}</textarea></div>
      </div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="btn-enr-entreprise"><span class="spinner"></span><span class="ico">💾</span><span class="btn-label">Enregistrer</span></button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#btn-enr-entreprise').addEventListener('click', async (ev) => {
      const donnees = {
        denomination: document.getElementById('f-denomination').value,
        rccm: document.getElementById('f-rccm').value,
        idNational: document.getElementById('f-idnat').value,
        numeroFiscal: document.getElementById('f-fiscal').value,
        secteur: document.getElementById('f-secteur').value,
        province: document.getElementById('f-province').value,
        ville: document.getElementById('f-ville').value,
        commune: document.getElementById('f-commune').value,
        adresse: document.getElementById('f-adresse').value,
        telephone: document.getElementById('f-tel').value,
        responsable: document.getElementById('f-resp').value,
        observations: document.getElementById('f-obs').value
      };
      await Utils.avecChargement(ev.currentTarget, async () => {
        try {
          await Entreprises.sauvegarder(donnees, id);
          Utils.toast(id ? 'Entreprise modifiée.' : 'Entreprise enregistrée.', 'succes');
          m.fermer();
          if (moduleActif === 'entreprises') APRES.entreprises();
          await majBadges();
        } catch (err) { Utils.toast(err.message, 'erreur', 6000); }
      }, '✅ Enregistré');
    });
  }

  async function ficheEntreprise(id) {
    const e = await Entreprises.parId(id);
    const st = await Entreprises.statutCalcule(e);
    const synt = await Historique.syntheseEntreprise(id);
    const champs = [
      ['Dénomination', e.denomination], ['RCCM', e.rccm], ['ID National', e.idNational],
      ['Numéro fiscal', e.numeroFiscal], ['Secteur', e.secteur], ['Province', e.province],
      ['Ville', e.ville], ['Commune', e.commune], ['Adresse', e.adresse],
      ['Téléphone', e.telephone], ['Responsable', e.responsable],
      ['Date d\'enregistrement', Utils.fmtDate(e.dateEnregistrement)], ['Statut', st.libelle],
      ['Observations', e.observations]
    ];
    const m = UI.modale({
      titre: 'Fiche entreprise',
      taille: 'modal--lg',
      corps: `
      <div class="fiche-grid">
        ${champs.map(([k, v]) => `<div class="fiche-item"><div class="k">${Utils.esc(k)}</div><div class="v">${Utils.esc(v || '—')}</div></div>`).join('')}
      </div>
      <hr style="border:none;border-top:2px solid var(--bleu-100);margin:16px 0">
      <h4 style="color:var(--bleu-800)">Synthèse de l'historique</h4>
      <div class="stats-grid" style="margin:8px 0">
        ${carteStat('🗂️', synt.nombreMissions, 'Missions', 'bleu')}
        ${carteStat('➡️', Utils.fmtDate(synt.premiereVisite), 'Première visite', 'vert')}
        ${carteStat('⬅️', Utils.fmtDate(synt.derniereVisite), 'Dernière visite', 'orange')}
        ${carteStat('🧑‍🤝‍🧑', synt.equipes.length, 'Équipes intervenues', 'jaune')}
      </div>
      <div><strong>Équipes :</strong> ${synt.equipes.length ? synt.equipes.map(Utils.esc).join(', ') : '—'}</div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Fermer</button>
              <button class="btn" id="btn-modif-fiche">Modifier</button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#btn-modif-fiche').addEventListener('click', () => { m.fermer(); formulaireEntreprise(id); });
  }

  async function ficheHistoriqueEntreprise(id) {
    const e = await Entreprises.parId(id);
    const synt = await Historique.syntheseEntreprise(id);
    const lignes = synt.visites.map((v) => `
      <div class="tl-item">
        <div class="tl-date">${Utils.fmtDate(v.dateVisite)} — ${Utils.esc(v.statutLibelle)}</div>
        <div class="txt"><strong>${Utils.esc(v.missionReference)}</strong> · Équipe ${Utils.esc(v.equipeNom)} · Ordre ${Utils.esc(v.ordreNumero)}</div>
        ${v.missionObjet ? `<div class="oldnew">${Utils.esc(v.missionObjet)}</div>` : ''}
      </div>`).join('');
    const m = UI.modale({
      titre: `Historique — ${e.denomination}`,
      taille: 'modal--lg',
      corps: `<div class="timeline">${lignes || '<div class="empty-state">Aucune visite enregistrée.</div>'}</div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Fermer</button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
  }

  /* Modale coller une liste (copier-coller multi-entreprises) */
  async function modaleCollerListe() {
    const provinces = await DB.tout('provinces');
    const opts = provinces.map((p) => `<option>${Utils.esc(p.nom)}</option>`).join('');
    const m = UI.modale({
      titre: 'Ajouter plusieurs entreprises (copier-coller)',
      taille: 'modal--lg',
      corps: `
      <p class="hint" style="margin-bottom:10px">Collez une entreprise par ligne. Les doublons sont détectés automatiquement avant importation.</p>
      <div class="field" style="grid-column:1/-1">
        <label>Liste des entreprises (une par ligne)</label>
        <textarea class="input" id="col-liste" rows="8" placeholder="AFRIPHAR&#10;JRK GARDE&#10;PHARMA VIE&#10;…"></textarea>
      </div>
      <div class="field"><label>Province par défaut</label><select class="input" id="col-province"><option value="">—</option>${opts}</select></div>
      <div id="col-apercu"></div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="col-importer" disabled><span class="spinner"></span><span class="ico">📥</span><span class="btn-label">Importer</span></button>`
    });
    const btnImport = m.boite.querySelector('#col-importer');
    const apercu = m.boite.querySelector('#col-apercu');
    let noms = [];
    const analyser = () => {
      noms = Entreprises.analyserTexte(m.boite.querySelector('#col-liste').value);
      if (!noms.length) { apercu.innerHTML = ''; btnImport.disabled = true; return; }
      Entreprises.controlerNomsAVolonte(noms).then(({ creer, doublons }) => {
        apercu.innerHTML = `
          <div class="alerte alerte--bleu"><span class="ico">ℹ️</span><span><strong>${noms.length} entreprise(s) détectée(s)</strong>
            ${creer.length} à importer, ${doublons.length} doublon(s) ignoré(s).</span></div>
          ${doublons.length ? `<div class="alerte alerte--orange"><span class="ico">⚠️</span><span><strong>Doublons</strong>${doublons.map(Utils.esc).join(', ')}</span></div>` : ''}
          <ol class="kbd-list">${creer.slice(0, 30).map((n) => `<li>${Utils.esc(n)}</li>`).join('')}${creer.length > 30 ? `<li>…et ${creer.length - 30} autres</li>` : ''}</ol>`;
        btnImport.disabled = creer.length === 0;
      });
    };
    m.boite.querySelector('#col-liste').addEventListener('input', Utils.debounce(analyser, 250));
    btnImport.addEventListener('click', async () => {
      const province = m.boite.querySelector('#col-province').value;
      await Utils.avecChargement(btnImport, async () => {
        const { ajoutees, doublons } = await Entreprises.creerEnMasse(noms, province);
        Utils.toast(`${ajoutees.length} entreprise(s) importée(s), ${doublons.length} doublon(s) ignoré(s).`, 'succes', 5000);
        m.fermer();
        if (moduleActif === 'entreprises') APRES.entreprises();
      }, '✅ Importé');
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
  }

  /* Modale import CSV */
  function modaleImportCSV() {
    const m = UI.modale({
      titre: 'Importer un fichier CSV / Texte',
      corps: `
      <p class="hint">Le fichier doit contenir une colonne « dénomination » (ou « nom »). Les données sont prévisualisées avant insertion ; les doublons sont ignorés.</p>
      <div class="field"><label>Fichier CSV ou TXT</label><input type="file" class="input" id="csv-file" accept=".csv,.txt,text/csv,text/plain"></div>
      <div class="field"><label>…ou collez le contenu</label><textarea class="input" id="csv-texte" rows="6" placeholder="dénomination;province;ville&#10;AFRIPHAR;Kinshasa;Kinshasa"></textarea></div>
      <div id="csv-apercu"></div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="csv-importer" disabled><span class="spinner"></span><span class="btn-label">Importer</span></button>`
    });
    let contenu = '';
    const apercu = m.boite.querySelector('#csv-apercu');
    const btn = m.boite.querySelector('#csv-importer');
    const previsualiser = (texte) => {
      contenu = texte;
      if (!texte.trim()) { apercu.innerHTML = ''; btn.disabled = true; return; }
      const lignes = Utils.parserCSV(texte).filter((l) => l.some((c) => c.trim()));
      apercu.innerHTML = `<div class="alerte alerte--bleu"><span class="ico">ℹ️</span><span><strong>${lignes.length} ligne(s) détectée(s)</strong>Prévisualisation avant insertion.</span></div>`;
      btn.disabled = lignes.length === 0;
    };
    m.boite.querySelector('#csv-file').addEventListener('change', (e) => {
      const fichier = e.target.files[0];
      if (!fichier) return;
      const lecteur = new FileReader();
      lecteur.onload = () => { m.boite.querySelector('#csv-texte').value = lecteur.result; previsualiser(lecteur.result); };
      lecteur.readAsText(fichier);
    });
    m.boite.querySelector('#csv-texte').addEventListener('input', Utils.debounce((e) => previsualiser(e.target.value), 250));
    btn.addEventListener('click', async () => {
      await Utils.avecChargement(btn, async () => {
        try {
          const { ajoutees, doublons } = await ImportExport.importerEntreprisesCSV(contenu);
          Utils.toast(`${ajoutees.length} entreprise(s) importée(s), ${doublons.length} doublon(s).`, 'succes', 5000);
          m.fermer();
          if (moduleActif === 'entreprises') APRES.entreprises();
        } catch (e) { Utils.toast(e.message, 'erreur', 6000); }
      }, '✅ Importé');
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
  }

  /* ---------------- AGENTS ---------------- */
  VUES.agents = async () => {
    return `
    <div class="card">
      <div class="toolbar">
        <div class="search-box"><span class="ico">🔍</span>
          <input class="input" id="rech-agent" type="search" placeholder="Rechercher un agent (nom, matricule, grade…)…"></div>
        <div class="spacer"></div>
        <button class="btn" id="btn-nouvel-agent"><span class="ico">＋</span><span class="btn-label">Nouvel agent</span></button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Agent</th><th>Matricule</th><th>Grade / Fonction</th><th>Statut</th><th>Missions (année)</th><th>Actions</th></tr></thead>
          <tbody id="corps-agents"></tbody>
        </table>
      </div>
    </div>`;
  };
  APRES.agents = async () => {
    const corps = document.getElementById('corps-agents');
    const rendu = async () => {
      const terme = document.getElementById('rech-agent').value;
      const agents = await Agents.rechercher(terme);
      if (!agents.length) { corps.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="ico">👥</span>Aucun agent.</td></tr>'; return; }
      corps.innerHTML = (await Promise.all(agents.map(async (a) => {
        const ch = await Agents.charge(a.id);
        const actif = a.actif !== false;
        return `<tr>
          <td data-label="Agent"><strong>${Utils.esc(Utils.nomAgent(a))}</strong></td>
          <td data-label="Matricule">${Utils.esc(a.matricule || '—')}</td>
          <td data-label="Grade">${Utils.esc(a.grade || '')} ${a.fonction ? '· ' + Utils.esc(a.fonction) : ''}</td>
          <td data-label="Statut">${actif
            ? '<span class="badge badge--vert">Actif</span>'
            : '<span class="badge badge--noir">Désactivé</span>'}</td>
          <td data-label="Missions">
            ${ch.annee} cette année · ${ch.total} au total
            ${ch.enCours ? `<span class="badge badge--rouge" style="margin-left:6px">${ch.enCours} en cours</span>` : ''}
          </td>
          <td data-label="Actions"><div class="row-actions">
            <button class="btn btn--sm" style="--btn-bg:#1155a8" data-modif="${a.id}">Modifier</button>
            ${actif
              ? `<button class="btn btn--gris btn--sm" data-desact="${a.id}">Désactiver</button>`
              : `<button class="btn btn--vert btn--sm" data-activer="${a.id}">Activer</button>`}
          </div></td></tr>`;
      }))).join('');
      corps.querySelectorAll('[data-modif]').forEach((b) => b.addEventListener('click', () => formulaireAgent(b.dataset.modif)));
      corps.querySelectorAll('[data-desact]').forEach((b) => b.addEventListener('click', async () => {
        if (await Utils.confirmer('Désactiver l\'agent', 'L\'agent sera conservé pour l\'historique mais ne pourra plus être affecté. Continuer ?', { okLabel: 'Désactiver' })) {
          await Agents.definirActif(b.dataset.desact, false); Utils.toast('Agent désactivé.', 'succes'); rendu();
        }
      }));
      corps.querySelectorAll('[data-activer]').forEach((b) => b.addEventListener('click', async () => {
        await Agents.definirActif(b.dataset.activer, true); Utils.toast('Agent activé.', 'succes'); rendu();
      }));
    };
    document.getElementById('rech-agent').addEventListener('input', Utils.debounce(rendu, 200));
    document.getElementById('btn-nouvel-agent').addEventListener('click', () => formulaireAgent());
    await rendu();
  };

  async function formulaireAgent(id = null) {
    const a = id ? await Agents.parId(id) : {};
    const m = UI.modale({
      titre: id ? 'Modifier l\'agent' : 'Nouvel agent',
      taille: 'modal--lg',
      corps: `<div class="form-grid">
        <div class="field"><label>Nom <span class="req">*</span></label><input class="input" id="a-nom" value="${Utils.esc(a.nom || '')}"></div>
        <div class="field"><label>Post-nom</label><input class="input" id="a-postnom" value="${Utils.esc(a.postnom || '')}"></div>
        <div class="field"><label>Prénom</label><input class="input" id="a-prenom" value="${Utils.esc(a.prenom || '')}"></div>
        <div class="field"><label>Matricule</label><input class="input" id="a-matricule" value="${Utils.esc(a.matricule || '')}"></div>
        <div class="field"><label>Grade</label>
          <select class="input" id="a-grade">
            ${Agents.GRADES.map((g) => `<option ${a.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
          </select></div>
        <div class="field"><label>Fonction</label>
          <select class="input" id="a-fonction">
            ${Agents.FONCTIONS.map((f) => `<option ${a.fonction === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select></div>
        <div class="field"><label>Service</label><input class="input" id="a-service" value="${Utils.esc(a.service || '')}"></div>
        <div class="field"><label>Affectation</label><input class="input" id="a-affectation" value="${Utils.esc(a.affectation || '')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Observations</label><textarea class="input" id="a-obs">${Utils.esc(a.observations || '')}</textarea></div>
      </div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="btn-enr-agent"><span class="spinner"></span><span class="btn-label">Enregistrer</span></button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#btn-enr-agent').addEventListener('click', async (ev) => {
      const donnees = {
        nom: m.boite.querySelector('#a-nom').value,
        postnom: m.boite.querySelector('#a-postnom').value,
        prenom: m.boite.querySelector('#a-prenom').value,
        matricule: m.boite.querySelector('#a-matricule').value,
        grade: m.boite.querySelector('#a-grade').value,
        fonction: m.boite.querySelector('#a-fonction').value,
        service: m.boite.querySelector('#a-service').value,
        affectation: m.boite.querySelector('#a-affectation').value,
        observations: m.boite.querySelector('#a-obs').value
      };
      await Utils.avecChargement(ev.currentTarget, async () => {
        try {
          await Agents.sauvegarder(donnees, id);
          Utils.toast(id ? 'Agent modifié.' : 'Agent enregistré.', 'succes');
          m.fermer(); if (moduleActif === 'agents') APRES.agents();
        } catch (e) { Utils.toast(e.message, 'erreur', 6000); }
      }, '✅ Enregistré');
    });
  }

  /* ---------------- ÉQUIPES ---------------- */
  VUES.equipes = async () => {
    const equipes = await Equipes.lister();
    const cartes = (await Promise.all(equipes.map(async (eq) => {
      const agents = await Equipes.agentsDeEquipe(eq.id);
      const enMission = await Equipes.equipesEnMission();
      const active = enMission.some((e) => e.id === eq.id);
      return `<div class="card">
        <div class="card-title"><span class="barre"></span> ${Utils.esc(eq.nom)}
          ${active ? '<span class="badge badge--rouge" style="margin-left:auto">En mission</span>' : ''}
        </div>
        <p class="hint">${Utils.esc(eq.description || 'Aucune description.')}</p>
        <div>${agents.length ? agents.map((a) =>
          `<span class="chip">${Utils.esc(Utils.nomAgent(a))}</span>`).join('') : '<em class="hint">Aucun agent affecté.</em>'}</div>
        <div class="row-actions" style="margin-top:12px">
          <button class="btn btn--sm" style="--btn-bg:#1155a8" data-modif-eq="${eq.id}">Modifier / Affecter</button>
        </div>
      </div>`;
    }))).join('');
    return `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn" id="btn-nouvelle-equipe"><span class="ico">＋</span><span class="btn-label">Nouvelle équipe</span></button>
    </div>
    <div class="grid-2">${cartes || '<div class="card empty-state"><span class="ico">🧑‍🤝‍🧑</span>Aucune équipe. Créez le Groupe 01, Groupe 02…</div>'}</div>`;
  };
  APRES.equipes = async () => {
    document.getElementById('btn-nouvelle-equipe').addEventListener('click', () => formulaireEquipe());
    document.querySelectorAll('[data-modif-eq]').forEach((b) =>
      b.addEventListener('click', () => formulaireEquipe(b.dataset.modifEq)));
  };

  async function formulaireEquipe(id = null) {
    const eq = id ? await Equipes.parId(id) : { agentIds: [] };
    const agents = await Agents.lister({ actifsSeulement: true });
    const m = UI.modale({
      titre: id ? 'Modifier l\'équipe' : 'Nouvelle équipe / groupe',
      taille: 'modal--lg',
      corps: `<div class="field"><label>Nom du groupe <span class="req">*</span></label>
          <input class="input" id="eq-nom" value="${Utils.esc(eq.nom || '')}" placeholder="Ex. Groupe 03"></div>
        <div class="field"><label>Description</label><input class="input" id="eq-desc" value="${Utils.esc(eq.description || '')}"></div>
        <div class="field"><label>Affecter des agents (un agent n'appartient qu'à un seul groupe)</label></div>
        <div class="liste-choix">
          ${agents.map((a) => `<label><input type="checkbox" value="${a.id}" ${(eq.agentIds || []).includes(a.id) ? 'checked' : ''}>
            <span>${Utils.esc(Utils.nomAgent(a))} <small style="color:var(--gris-500)">· ${Utils.esc(a.grade || '')}</small></span></label>`).join('')
          || '<div class="empty-state">Aucun agent actif. Créez d\'abord des agents.</div>'}
        </div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="btn-enr-equipe"><span class="spinner"></span><span class="btn-label">Enregistrer</span></button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#btn-enr-equipe').addEventListener('click', async (ev) => {
      const agentIds = Array.from(m.boite.querySelectorAll('.liste-choix input:checked')).map((i) => i.value);
      await Utils.avecChargement(ev.currentTarget, async () => {
        try {
          await Equipes.sauvegarder({
            nom: m.boite.querySelector('#eq-nom').value,
            description: m.boite.querySelector('#eq-desc').value,
            agentIds
          }, id);
          Utils.toast('Équipe enregistrée.', 'succes');
          m.fermer(); if (moduleActif === 'equipes') APRES.equipes();
        } catch (e) { Utils.toast(e.message, 'erreur', 6000); }
      }, '✅ Enregistré');
    });
  }

  /* ---------------- MISSIONS ---------------- */
  VUES.missions = async () => {
    const onglets = [
      ['toutes', 'Toutes'], ['EN_MISSION', 'En cours'], ['VALIDEE', 'Programmées / validées'],
      ['BROUILLON', 'Brouillons'], ['TERMINEE', 'Terminées'], ['ARCHIVEE', 'Archivées']
    ];
    const missions = await Missions.lister({ inclureArchivees: true });
    return `
    <div class="toolbar">
      <div class="search-box"><span class="ico">🔍</span>
        <input class="input" id="rech-mission" type="search" placeholder="Rechercher une mission (référence, objet, lieu)…"></div>
      <div class="spacer"></div>
      <button class="btn btn--jaune" id="btn-nouvelle-mission"><span class="ico">＋</span><span class="btn-label">Nouvelle mission</span></button>
    </div>
    <div class="tabs" id="onglets-mission">
      ${onglets.map(([id, lib], i) =>
        `<button class="tab ${i === 0 ? 'actif' : ''}" data-onglet="${id}">${lib}</button>`).join('')}
    </div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr><th>Référence</th><th>Équipe</th><th>Entreprises</th><th>Période</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody id="corps-missions"></tbody>
      </table>
    </div></div>`;
  };
  APRES.missions = async () => {
    let onglet = 'toutes';
    const corps = document.getElementById('corps-missions');
    const rendu = async () => {
      const missions = await Missions.lister({ inclureArchivees: onglet === 'ARCHIVEE' || onglet === 'toutes' });
      const filtre = onglet === 'toutes' ? missions : missions.filter((m) => m.statut === onglet);
      const terme = Utils.normaliser(document.getElementById('rech-mission').value);
      const liste = terme
        ? filtre.filter((m) => Utils.normaliser(m.reference + ' ' + m.objet + ' ' + m.lieu).includes(terme))
        : filtre;
      if (!liste.length) { corps.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="ico">🗂️</span>Aucune mission dans cette catégorie.</td></tr>'; return; }
      corps.innerHTML = (await Promise.all(liste.map(async (m) => {
        const eq = m.equipeId ? await Equipes.parId(m.equipeId) : null;
        return `<tr>
          <td data-label="Référence"><strong>${Utils.esc(m.reference || '—')}</strong></td>
          <td data-label="Équipe">${eq ? Utils.esc(eq.nom) : '—'}</td>
          <td data-label="Entreprises">${(m.entrepriseIds || []).length}</td>
          <td data-label="Période">${Utils.fmtDate(m.dateDebut)} → ${Utils.fmtDate(m.dateFin)}</td>
          <td data-label="Statut"><span class="badge ${Missions.STATUT_BADGES[m.statut]}">${Missions.STATUT_LIBELLES[m.statut]}</span></td>
          <td data-label="Actions"><div class="row-actions">
            <button class="btn btn--outline btn--sm" data-ouvrir="${m.id}">Ouvrir</button>
          </div></td></tr>`;
      }))).join('');
      corps.querySelectorAll('[data-ouvrir]').forEach((b) =>
        b.addEventListener('click', () => ouvrirMission(b.dataset.ouvrir)));
    };
    document.querySelectorAll('#onglets-mission .tab').forEach((t) =>
      t.addEventListener('click', () => {
        document.querySelectorAll('#onglets-mission .tab').forEach((x) => x.classList.remove('actif'));
        t.classList.add('actif'); onglet = t.dataset.onglet; rendu();
      }));
    document.getElementById('rech-mission').addEventListener('input', Utils.debounce(rendu, 200));
    document.getElementById('btn-nouvelle-mission').addEventListener('click', () => formulaireMission());
    await rendu();
  };

  /** Ouvre la fiche d'une mission : contrôles, statut, actions, ordre. */
  async function ouvrirMission(id) {
    const m = await Missions.parId(id);
    if (!m) { Utils.toast('Mission introuvable.', 'erreur'); return; }
    const entreprises = await Missions.entreprisesDeMission(id);
    const agents = await Missions.agentsDeMission(id);
    const eq = m.equipeId ? await Equipes.parId(m.equipeId) : null;
    const chef = m.chefId ? await Agents.parId(m.chefId) : null;
    const controle = await Missions.verifierMission(m);
    const ordre = await Ordres.ordreDeMission(id);

    const lignesEnt = (await Promise.all(controle.entreprises.map(async (r) => {
      const badge = r.niveau === 'conflit' ? 'verif-rouge' : r.niveau === 'avertissement' ? 'verif-orange' : 'verif-vert';
      const ico = r.niveau === 'conflit' ? '🔴' : r.niveau === 'avertissement' ? '🟠' : '🟢';
      let detail = '';
      if (r.details) {
        detail = r.details.equipe ? `Équipe ${r.details.equipe} · Ordre ${r.details.ordre} · Début ${Utils.fmtDate(r.details.debut)}`
          : r.details.derniereVisite ? `Visite le ${Utils.fmtDate(r.details.derniereVisite)} (${r.details.jours} j) · ${r.details.equipe} · ${r.details.ordre}` : '';
      }
      return `<div class="ent-ligne ${badge}">
        <span class="ico">${ico}</span>
        <div><strong>${Utils.esc(r.entreprise ? r.entreprise.denomination : '—')}</strong>
          ${detail ? `<div class="hint">${Utils.esc(detail)}</div>` : ''}</div>
        <span class="badge ${r.niveau === 'conflit' ? 'badge--rouge' : r.niveau === 'avertissement' ? 'badge--orange' : 'badge--vert'}">${r.niveau === 'conflit' ? 'Conflit' : r.niveau === 'avertissement' ? 'Attention' : 'OK'}</span>
        <button class="btn btn--sm btn--gris" data-retirer-ent="${r.entreprise.id}">Retirer</button>
      </div>`;
    }))).join('');

    const champsManquants = controle.champs.map((c) =>
      `<div class="alerte alerte--rouge"><span class="ico">⛔</span><span>Champ obligatoire manquant : <strong>${Utils.esc(c.libelle)}</strong></span></div>`).join('');

    const modal = UI.modale({
      titre: `Mission ${m.reference || '(brouillon)'}`,
      taille: 'modal--xl',
      corps: `
      <div style="margin-bottom:14px">
        <span class="badge ${Missions.STATUT_BADGES[m.statut]}">${Missions.STATUT_LIBELLES[m.statut]}</span>
        <span class="badge badge--bleu" style="margin-left:6px">${eq ? Utils.esc(eq.nom) : 'Aucune équipe'}</span>
        ${chef ? `<span class="badge badge--jaune" style="margin-left:6px">Chef : ${Utils.esc(Utils.nomAgent(chef))}</span>` : ''}
      </div>

      ${controle.conflits ? `<div class="alerte alerte--rouge"><span class="ico">🔴</span>
        <span><strong>${controle.conflits} conflit(s) détecté(s)</strong>
        Impression et validation bloquées tant que les anomalies ne sont pas corrigées.</span></div>`
        : `<div class="alerte alerte--vert"><span class="ico">🟢</span><span><strong>Aucun conflit bloquant</strong>${controle.avertissements ? ` — ${controle.avertissements} avertissement(s) à consulter.` : ''}</span></div>`}

      ${champsManquants}

      <div class="grid-2">
        <div>
          <h4 style="color:var(--bleu-800);margin:6px 0">Entreprises (${entreprises.length})</h4>
          ${lignesEnt || '<p class="hint">Aucune entreprise.</p>'}
          <button class="btn btn--outline btn--sm" id="mission-ajouter-ent" style="margin-top:8px">＋ Ajouter des entreprises</button>
        </div>
        <div>
          <h4 style="color:var(--bleu-800);margin:6px 0">Agents (${agents.length})</h4>
          ${agents.map((a) => {
            const c = controle.agents.find((x) => x.agent && x.agent.id === a.id);
            const couleur = c && c.niveau === 'conflit' ? 'verif-rouge' : c && c.niveau === 'avertissement' ? 'verif-orange' : 'verif-vert';
            return `<div class="ent-ligne ${couleur}">
              <span class="ico">${c && c.niveau === 'conflit' ? '🔴' : c && c.niveau === 'avertissement' ? '🟠' : '🟢'}</span>
              <div><strong>${Utils.esc(Utils.nomAgent(a))}</strong>${c && c.motif ? `<div class="hint">${Utils.esc(c.motif)}</div>` : `<div class="hint">${Utils.esc(a.grade || '')} ${a.chef ? '· Chef de mission' : ''}</div>`}</div>
              <span class="badge ${c && c.niveau === 'conflit' ? 'badge--rouge' : c && c.niveau === 'avertissement' ? 'badge--orange' : 'badge--vert'}">${c && c.niveau === 'conflit' ? 'Conflit' : 'OK'}</span>
            </div>`;
          }).join('') || '<p class="hint">Aucun agent.</p>'}
        </div>
      </div>

      <div class="fiche-grid" style="margin-top:14px">
        <div class="fiche-item"><div class="k">Objet</div><div class="v">${Utils.esc(m.objet || '—')}</div></div>
        <div class="fiche-item"><div class="k">Période</div><div class="v">${Utils.fmtDate(m.dateDebut)} → ${Utils.fmtDate(m.dateFin)} (${Utils.nbJours(m.dateDebut, m.dateFin)} j)</div></div>
        <div class="fiche-item"><div class="k">Lieu</div><div class="v">${Utils.esc(m.lieu || '—')}</div></div>
        <div class="fiche-item"><div class="k">Imputation</div><div class="v">${Utils.esc(m.imputation || '—')}</div></div>
      </div>`,
      pieds: `
        <button class="btn btn--gris" data-fermer>Fermer</button>
        <button class="btn btn--outline" id="mission-modifier">Modifier</button>
        ${['BROUILLON', 'EN_VERIFICATION', 'VALIDEE'].includes(m.statut) ?
          `<button class="btn btn--vert" id="mission-valider" ${controle.conflits ? 'disabled' : ''}>✅ Valider</button>` : ''}
        ${['VALIDEE', 'IMPRIMEE'].includes(m.statut) ?
          `<button class="btn btn--jaune" id="mission-demarrer" ${controle.conflits ? 'disabled' : ''}>▶️ Démarrer la mission</button>` : ''}
        ${m.statut === 'EN_MISSION' ?
          `<button class="btn btn--vert" id="mission-terminer">🏁 Clôturer</button>` : ''}
        ${['TERMINEE'].includes(m.statut) ?
          `<button class="btn btn--gris" id="mission-archiver">🗃️ Archiver</button>` : ''}
        ${ordre ? `<button class="btn" id="mission-voir-ordre" ${controle.conflits ? 'disabled' : ''}>📄 Ordre / Imprimer</button>` :
          (['VALIDEE', 'IMPRIMEE', 'EN_MISSION', 'TERMINEE'].includes(m.statut) ? '<button class="btn" id="mission-generer-ordre">📄 Générer l\'ordre</button>' : '')}
      `
    });
    modal.boite.querySelector('[data-fermer]').addEventListener('click', modal.fermer);
    modal.boite.querySelector('#mission-modifier').addEventListener('click', () => { modal.fermer(); formulaireMission(id); });
    modal.boite.querySelector('#mission-ajouter-ent')?.addEventListener('click', () => { modal.fermer(); formulaireMission(id, { focusEnt: true }); });
    modal.boite.querySelectorAll('[data-retirer-ent]').forEach((b) => b.addEventListener('click', async () => {
      const restantes = (m.entrepriseIds || []).filter((x) => x !== b.dataset.retirerEnt);
      await Missions.sauvegarder({ entrepriseIds: restantes }, id);
      Utils.toast('Entreprise retirée de la mission.', 'info'); modal.fermer(); ouvrirMission(id);
    }));
    const valider = modal.boite.querySelector('#mission-valider');
    valider?.addEventListener('click', async () => {
      if (controle.conflits) { Utils.toast('Impression impossible : veuillez corriger les anomalies détectées.', 'erreur', 6000); return; }
      if (await Utils.confirmer('Valider la mission', 'La mission sera validée et un ordre de mission sera généré. Continuer ?', { okLabel: 'Valider', okClass: 'btn--vert' })) {
        await Missions.changerStatut(id, 'VALIDEE');
        Utils.toast('Mission validée. Ordre de mission généré.', 'succes');
        modal.fermer(); await majBadges(); naviguer('missions');
      }
    });
    modal.boite.querySelector('#mission-demarrer')?.addEventListener('click', async () => {
      if (await Utils.confirmer('Démarrer la mission', 'La mission passe au statut « En mission ». Les entreprises seront marquées comme visitées. Continuer ?', { okLabel: 'Démarrer', okClass: 'btn--jaune' })) {
        await Missions.changerStatut(id, 'EN_MISSION');
        Utils.toast('Mission démarrée.', 'succes'); modal.fermer(); await majBadges(); naviguer('missions');
      }
    });
    modal.boite.querySelector('#mission-terminer')?.addEventListener('click', async () => {
      if (await Utils.confirmer('Clôturer la mission', 'Êtes-vous certain de vouloir clôturer cette mission ? Elle passera en « Terminée ».', { okLabel: 'Clôturer', okClass: 'btn--vert' })) {
        await Missions.changerStatut(id, 'TERMINEE');
        Utils.toast('Mission clôturée. Historique mis à jour.', 'succes'); modal.fermer(); await majBadges(); naviguer('missions');
      }
    });
    modal.boite.querySelector('#mission-archiver')?.addEventListener('click', async () => {
      if (await Utils.confirmer('Archiver la mission', 'La mission sera conservée dans les archives. Continuer ?', { okLabel: 'Archiver' })) {
        await Missions.archiver(id); Utils.toast('Mission archivée.', 'succes'); modal.fermer(); naviguer('missions');
      }
    });
    modal.boite.querySelector('#mission-generer-ordre')?.addEventListener('click', async () => {
      const o = await Ordres.creerDepuisMission(m); modal.fermer(); await apercuOrdre(o.id);
    });
    modal.boite.querySelector('#mission-voir-ordre')?.addEventListener('click', () => { modal.fermer(); apercuOrdre(ordre.id); });
  }

  /** Formulaire de création / modification d'une mission. */
  async function formulaireMission(id = null, opts = {}) {
    const m = id ? await Missions.parId(id) : {};
    const [entreprises, agents, equipes, modele] = await Promise.all([
      Entreprises.lister(), Agents.lister({ actifsSeulement: true }), Equipes.lister(), Ordres.modele()
    ]);
    const objetPoints = m.objetPointsJson ? JSON.parse(m.objetPointsJson) : modele.objetPointsDefaut;

    const modal = UI.modale({
      titre: id ? 'Modifier la mission' : 'Nouvelle mission',
      taille: 'modal--xl',
      corps: `
      <div class="form-grid">
        <div class="field"><label>Structure</label><input class="input" id="ms-structure" value="${Utils.esc(m.structure || modele.structure)}"></div>
        <div class="field"><label>Référence <span class="req">*</span></label><input class="input" id="ms-reference" value="${Utils.esc(m.reference || '')}" placeholder="Ex. MISSION-2026-001"></div>
        <div class="field"><label>Équipe <span class="req">*</span></label>
          <select class="input" id="ms-equipe"><option value="">— Choisir —</option>
            ${equipes.map((e) => `<option value="${e.id}" ${m.equipeId === e.id ? 'selected' : ''}>${Utils.esc(e.nom)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Chef de mission <span class="req">*</span></label>
          <select class="input" id="ms-chef"><option value="">— Choisir —</option>
            ${agents.map((a) => `<option value="${a.id}" ${m.chefId === a.id ? 'selected' : ''}>${Utils.esc(Utils.nomAgent(a))}</option>`).join('')}
          </select></div>
        <div class="field"><label>Date de début <span class="req">*</span></label><input class="input" type="date" id="ms-debut" value="${Utils.esc(m.dateDebut || Utils.aujourdhui())}"></div>
        <div class="field"><label>Date de clôture <span class="req">*</span></label><input class="input" type="date" id="ms-fin" value="${Utils.esc(m.dateFin || '')}"></div>
        <div class="field"><label>Lieu (ville / province) <span class="req">*</span></label><input class="input" id="ms-lieu" value="${Utils.esc(m.lieu || 'Kinshasa')}"></div>
        <div class="field"><label>Imputation <span class="req">*</span></label><input class="input" id="ms-imputation" value="${Utils.esc(m.imputation || modele.imputationDefaut)}"></div>
      </div>

      <div class="field" style="margin-top:8px"><label>Objet de la mission <span class="req">*</span></label>
        <input class="input" id="ms-objet" value="${Utils.esc(m.objet || 'Mission spéciale de contrôle du travail')}" style="margin-bottom:8px">
        <div class="objet-points" id="ms-points">
          ${objetPoints.map((p, i) => `
            <div class="point"><span class="idx">${i + 1}</span>
              <textarea class="input" data-point>${Utils.esc(p)}</textarea>
              <button class="btn btn--gris btn--sm" data-suppr-point title="Supprimer ce point">✕</button></div>`).join('')}
        </div>
        <button class="btn btn--outline btn--sm" id="ms-ajout-point" type="button">＋ Ajouter un point d'objet</button>
      </div>

      <div class="grid-2" style="margin-top:6px">
        <div class="field"><label>Entreprises (sélection multiple) <span class="req">*</span></label>
          <input class="input" id="ms-rech-ent" placeholder="Filtrer…" style="margin-bottom:6px">
          <div class="liste-choix" id="ms-liste-ent" style="max-height:260px">
            ${entreprises.map((e) => `<label><input type="checkbox" value="${e.id}" ${(m.entrepriseIds || []).includes(e.id) ? 'checked' : ''}>
              <span>${Utils.esc(e.denomination)} <small style="color:var(--gris-500)">· ${Utils.esc(e.province || '')}</small></span></label>`).join('')}
          </div>
        </div>
        <div class="field"><label>Membres de la mission (agents) <span class="req">*</span></label>
          <input class="input" id="ms-rech-agt" placeholder="Filtrer…" style="margin-bottom:6px">
          <div class="liste-choix" id="ms-liste-agt" style="max-height:260px">
            ${agents.map((a) => `<label><input type="checkbox" value="${a.id}" ${(m.agentIds || []).includes(a.id) ? 'checked' : ''}>
              <span>${Utils.esc(Utils.nomAgent(a))}</span></label>`).join('')}
          </div>
        </div>
      </div>

      <div class="field"><label>Observations</label><textarea class="input" id="ms-obs">${Utils.esc(m.observations || '')}</textarea></div>

      <div id="ms-verif" style="margin-top:10px"></div>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="ms-enr"><span class="spinner"></span><span class="ico">💾</span><span class="btn-label">Enregistrer la mission</span></button>`
    });

    // Filtres
    modal.boite.querySelector('#ms-rech-ent').addEventListener('input', (e) => {
      const t = Utils.normaliser(e.target.value);
      modal.boite.querySelectorAll('#ms-liste-ent label').forEach((l) => {
        l.style.display = Utils.normaliser(l.textContent).includes(t) ? '' : 'none';
      });
    });
    modal.boite.querySelector('#ms-rech-agt').addEventListener('input', (e) => {
      const t = Utils.normaliser(e.target.value);
      modal.boite.querySelectorAll('#ms-liste-agt label').forEach((l) => {
        l.style.display = Utils.normaliser(l.textContent).includes(t) ? '' : 'none';
      });
    });

    // Points d'objet éditables
    modal.boite.querySelector('#ms-ajout-point').addEventListener('click', () => {
      const cont = modal.boite.querySelector('#ms-points');
      const n = cont.querySelectorAll('.point').length + 1;
      const div = Utils.el('div', { class: 'point' },
        `<span class="idx">${n}</span><textarea class="input" data-point></textarea>
         <button class="btn btn--gris btn--sm" data-suppr-point>✕</button>`);
      div.querySelector('[data-suppr-point]').addEventListener('click', () => { div.remove(); renum(); });
      cont.appendChild(div);
    });
    modal.boite.querySelectorAll('[data-suppr-point]').forEach((b) =>
      b.addEventListener('click', () => { b.closest('.point').remove(); renum(); }));
    function renum() {
      modal.boite.querySelectorAll('#ms-points .point .idx').forEach((x, i) => x.textContent = i + 1);
    }

    // Vérification en direct des entreprises
    const zoneVerif = modal.boite.querySelector('#ms-verif');
    const verifier = async () => {
      const entIds = Array.from(modal.boite.querySelectorAll('#ms-liste-ent input:checked')).map((i) => i.value);
      const debut = modal.boite.querySelector('#ms-debut').value;
      const fin = modal.boite.querySelector('#ms-fin').value;
      const resultats = await Promise.all(entIds.map((eid) => Missions.verifierEntreprise(eid, m.id || null, debut, fin)));
      const conflits = resultats.filter((r) => r.niveau === 'conflit');
      const avert = resultats.filter((r) => r.niveau === 'avertissement');
      zoneVerif.innerHTML =
        conflits.map((r) => `<div class="alerte alerte--rouge"><span class="ico">🔴</span><span>
          <strong>Conflit — ${Utils.esc(r.entreprise.denomination)}</strong>${Utils.esc(r.motif)}
          ${r.details ? `<br><small>${Utils.esc(r.details.equipe || '')} · Ordre ${Utils.esc(r.details.ordre || '')} · Début ${Utils.fmtDate(r.details.debut)}</small>` : ''}
          </span></div>`).join('') +
        avert.map((r) => `<div class="alerte alerte--orange"><span class="ico">🟠</span><span>
          <strong>Attention — ${Utils.esc(r.entreprise.denomination)}</strong>${Utils.esc(r.motif)}
          ${r.details ? `<br><small>Dernière visite ${Utils.fmtDate(r.details.derniereVisite)} (${r.details.jours} j) · ${Utils.esc(r.details.equipe)} · ${Utils.esc(r.details.ordre)}</small>` : ''}
          </span></div>`).join('') +
        (resultats.length && !conflits.length && !avert.length
          ? '<div class="alerte alerte--vert"><span class="ico">🟢</span><span><strong>Toutes les entreprises sont disponibles.</strong></span></div>' : '');
      return conflits.length;
    };
    modal.boite.querySelectorAll('#ms-liste-ent input').forEach((i) => i.addEventListener('change', verifier));
    modal.boite.querySelector('#ms-debut').addEventListener('change', verifier);
    modal.boite.querySelector('#ms-fin').addEventListener('change', verifier);
    if (opts.focusEnt) setTimeout(verifier, 100);

    modal.boite.querySelector('[data-fermer]').addEventListener('click', modal.fermer);
    modal.boite.querySelector('#ms-enr').addEventListener('click', async (ev) => {
      const entrepriseIds = Array.from(modal.boite.querySelectorAll('#ms-liste-ent input:checked')).map((i) => i.value);
      const agentIds = Array.from(modal.boite.querySelectorAll('#ms-liste-agt input:checked')).map((i) => i.value);
      const chefId = modal.boite.querySelector('#ms-chef').value;
      const points = Array.from(modal.boite.querySelectorAll('[data-point]')).map((t) => t.value.trim()).filter(Boolean);
      const donnees = {
        structure: modal.boite.querySelector('#ms-structure').value,
        reference: modal.boite.querySelector('#ms-reference').value,
        equipeId: modal.boite.querySelector('#ms-equipe').value,
        chefId,
        dateDebut: modal.boite.querySelector('#ms-debut').value,
        dateFin: modal.boite.querySelector('#ms-fin').value,
        lieu: modal.boite.querySelector('#ms-lieu').value,
        imputation: modal.boite.querySelector('#ms-imputation').value,
        objet: modal.boite.querySelector('#ms-objet').value,
        objetPointsJson: JSON.stringify(points),
        entrepriseIds,
        agentIds: agentIds.map((agentId) => ({ agentId, chef: agentId === chefId, role: agentId === chefId ? 'Chef de Mission' : 'Membre' })),
        observations: modal.boite.querySelector('#ms-obs').value,
        duree: `${Utils.nbJours(modal.boite.querySelector('#ms-debut').value, modal.boite.querySelector('#ms-fin').value)} jours`
      };
      const nbConflits = await verifier();
      if (nbConflits > 0) {
        Utils.toast('Impossible d\'enregistrer : une entreprise sélectionnée est déjà affectée à une mission active. Corrigez les conflits (rouges).', 'erreur', 7000);
        return;
      }
      // Validation minimale
      if (!donnees.reference || !donnees.equipeId || !chefId || !donnees.dateDebut || !entrepriseIds.length || !agentIds.length) {
        Utils.toast('Veuillez compléter les champs obligatoires (référence, équipe, chef, dates, au moins une entreprise et un agent).', 'erreur', 7000);
        return;
      }
      await Utils.avecChargement(ev.currentTarget, async () => {
        const mission = await Missions.sauvegarder(donnees, id);
        Utils.toast('Mission enregistrée.', 'succes');
        modal.fermer(); naviguer('missions'); await majBadges();
        setTimeout(() => ouvrirMission(mission.id), 150);
      }, '✅ Enregistré');
    });
  }

  /* ---------------- ORDRES DE MISSION ---------------- */
  VUES.ordres = async () => {
    const ordres = await Ordres.lister();
    return `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn--outline" id="btn-editeur-modele">✏️ Éditeur du modèle</button>
    </div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr><th>Numéro</th><th>Mission</th><th>Date</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
        ${ordres.length ? (await Promise.all(ordres.map(async (o) => {
          const mission = await Missions.parId(o.missionId);
          return `<tr>
            <td data-label="Numéro"><strong>${Utils.esc(o.numero)}</strong></td>
            <td data-label="Mission">${Utils.esc(mission ? mission.reference : '—')}</td>
            <td data-label="Date">${Utils.fmtDate(o.dateCreation)}</td>
            <td data-label="Statut"><span class="badge ${o.statut === 'ARCHIVE' ? 'badge--noir' : 'badge--vert'}">${o.statut === 'ARCHIVE' ? 'Archivé' : 'Valide'}</span></td>
            <td data-label="Actions"><div class="row-actions">
              <button class="btn btn--sm" style="--btn-bg:#1155a8" data-apercu="${o.id}">Aperçu / Imprimer</button>
              ${o.statut !== 'ARCHIVE' ? `<button class="btn btn--rouge btn--sm" data-arch-ordre="${o.id}">Archiver</button>` : ''}
            </div></td></tr>`;
        }))).join('') : '<tr><td colspan="5" class="empty-state"><span class="ico">📄</span>Aucun ordre. Validez une mission pour générer son ordre.</td></tr>'}
        </tbody>
      </table>
    </div></div>`;
  };
  APRES.ordres = async () => {
    document.getElementById('btn-editeur-modele').addEventListener('click', editeurModele);
    document.querySelectorAll('[data-apercu]').forEach((b) =>
      b.addEventListener('click', () => apercuOrdre(b.dataset.apercu)));
    document.querySelectorAll('[data-arch-ordre]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (await Utils.confirmer('Archiver l\'ordre', 'L\'ordre sera conservé dans les archives (aucune suppression). Continuer ?', { okLabel: 'Archiver' })) {
          await Ordres.archiver(b.dataset.archOrdre);
          Utils.toast('Ordre archivé.', 'succes'); naviguer('ordres');
        }
      }));
  };

  /** Aperçu avant impression avec contrôles et blocage éventuel. */
  async function apercuOrdre(ordreId) {
    const ordre = await Ordres.parId(ordreId);
    if (!ordre) { Utils.toast('Ordre introuvable.', 'erreur'); return; }
    const { pret, verifications, mission } = await Ordres.controleImpression(ordre);

    const modal = UI.modale({
      titre: `Aperçu — ${ordre.numero}`,
      taille: 'modal--xl',
      corps: `
      <div class="grid-2" style="grid-template-columns:280px 1fr;gap:18px">
        <div>
          <h4 style="color:var(--bleu-800);margin-bottom:8px">Vérifications avant impression</h4>
          ${verifications.map((v) =>
            `<div class="pill-check ${v.ok ? 'ok' : 'ko'}" style="margin-bottom:6px;display:flex">
              ${v.ok ? '✓' : '✗'} <span>${Utils.esc(v.libelle)} — <small>${Utils.esc(v.detail)}</small></span></div>`).join('')}
          <div class="alerte ${pret ? 'alerte--vert' : 'alerte--rouge'}" style="margin-top:10px">
            <span class="ico">${pret ? '🟢' : '🔴'}</span>
            <span><strong>${pret ? 'PRÊT À IMPRIMER' : 'IMPRESSION BLOQUÉE'}</strong>
            ${pret ? 'Tous les contrôles sont positifs.' : 'Impression impossible : veuillez corriger les anomalies détectées.'}</span>
          </div>
          <button class="btn btn--outline btn--sm" id="ordre-modifier-contenu" style="width:100%;margin-top:8px">✏️ Modifier le contenu de l'ordre</button>
        </div>
        <div id="ordre-rendu" style="max-height:70vh;overflow:auto"></div>
      </div>`,
      pieds: `
        <button class="btn btn--gris" data-fermer>Fermer</button>
        <button class="btn btn--outline" id="ordre-pdf">💾 Enregistrer en PDF</button>
        <button class="btn ${pret ? 'btn--vert' : ''}" id="ordre-imprimer" ${pret ? '' : 'disabled'}>
          <span class="spinner"></span><span class="ico">🖨️</span><span class="btn-label">Imprimer l'ordre de mission</span></button>`
    });
    const rendu = await Ordres.rendreDocument(ordre);
    modal.boite.querySelector('#ordre-rendu').innerHTML = rendu;
    const canvas = modal.boite.querySelector('#qr-ordre');
    Ordres.dessinerQR(ordre, canvas);

    modal.boite.querySelector('[data-fermer]').addEventListener('click', modal.fermer);
    modal.boite.querySelector('#ordre-modifier-contenu').addEventListener('click', () => { modal.fermer(); editerContenuOrdre(ordreId); });
    const btnImprimer = modal.boite.querySelector('#ordre-imprimer');
    const imprimer = async () => {
      if (!pret) { Utils.toast('Impression impossible : veuillez corriger les anomalies détectées.', 'erreur', 6000); return; }
      // Rendu dans la zone d'impression puis lancement
      const zone = document.getElementById('zone-impression');
      zone.innerHTML = rendu;
      const c = zone.querySelector('#qr-ordre');
      Ordres.dessinerQR(ordre, c);
      // Marque l'ordre comme imprimé
      if (mission.statut === 'VALIDEE') await Missions.changerStatut(mission.id, 'IMPRIMEE');
      window.print();
      setTimeout(() => { zone.innerHTML = ''; }, 1000);
      Utils.toast('Impression lancée. Choisissez « Enregistrer en PDF » si besoin.', 'info', 5000);
    };
    btnImprimer.addEventListener('click', () => Utils.avecChargement(btnImprimer, imprimer, '✅ Impression lancée'));
    modal.boite.querySelector('#ordre-pdf').addEventListener('click', imprimer);
  }

  /** Édition du contenu spécifique d'un ordre (textes, signataire, dates, objet). */
  async function editerContenuOrdre(ordreId) {
    const ordre = await Ordres.parId(ordreId);
    const points = JSON.parse(ordre.objetPointsJson || '[]');
    const m = UI.modale({
      titre: `Modifier l'ordre ${ordre.numero}`,
      taille: 'modal--lg',
      corps: `<div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>Structure</label><input class="input" id="o-structure" value="${Utils.esc(ordre.structure)}"></div>
        <div class="field" style="grid-column:1/-1"><label>Adresse</label><input class="input" id="o-adresse" value="${Utils.esc(ordre.adresse)}"></div>
        <div class="field"><label>Titre</label><input class="input" id="o-titre" value="${Utils.esc(ordre.titre)}"></div>
        <div class="field"><label>Lieu</label><input class="input" id="o-lieu" value="${Utils.esc(ordre.lieu)}"></div>
        <div class="field"><label>Imputation</label><input class="input" id="o-imputation" value="${Utils.esc(ordre.imputation)}"></div>
        <div class="field"><label>Date de signature</label><input class="input" type="date" id="o-date" value="${Utils.esc(ordre.dateSignature)}"></div>
        <div class="field"><label>Signataire (nom)</label><input class="input" id="o-signnom" value="${Utils.esc(ordre.signataireNom)}"></div>
        <div class="field"><label>Fonction du signataire</label><input class="input" id="o-signfonc" value="${Utils.esc(ordre.signataireFonction)}"></div>
        <div class="field" style="grid-column:1/-1"><label>Texte introductif</label><textarea class="input" id="o-intro">${Utils.esc(ordre.intro)}</textarea></div>
        <div class="field" style="grid-column:1/-1"><label>Formule administrative</label><textarea class="input" id="o-formule">${Utils.esc(ordre.formule)}</textarea></div>
        <div class="field" style="grid-column:1/-1"><label>Points de l'objet (un par ligne, modifiables)</label>
          <textarea class="input" id="o-points" rows="8">${points.map(Utils.esc).join('\n')}</textarea></div>
      </div>
      <p class="hint">Pied de page (non modifiable) : <strong>${Utils.esc(Ordres.FOOTER_IMMUABLE)}</strong></p>`,
      pieds: `<button class="btn btn--gris" data-fermer>Annuler</button>
              <button class="btn" id="o-enr"><span class="spinner"></span><span class="btn-label">Enregistrer</span></button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#o-enr').addEventListener('click', async (ev) => {
      await Utils.avecChargement(ev.currentTarget, async () => {
        await Ordres.mettreAJour(ordreId, {
          structure: m.boite.querySelector('#o-structure').value,
          adresse: m.boite.querySelector('#o-adresse').value,
          titre: m.boite.querySelector('#o-titre').value,
          lieu: m.boite.querySelector('#o-lieu').value,
          imputation: m.boite.querySelector('#o-imputation').value,
          dateSignature: m.boite.querySelector('#o-date').value,
          signataireNom: m.boite.querySelector('#o-signnom').value,
          signataireFonction: m.boite.querySelector('#o-signfonc').value,
          intro: m.boite.querySelector('#o-intro').value,
          formule: m.boite.querySelector('#o-formule').value,
          objetPointsJson: JSON.stringify(m.boite.querySelector('#o-points').value.split('\n').map((s) => s.trim()).filter(Boolean))
        });
        Utils.toast('Ordre mis à jour.', 'succes');
        m.fermer(); apercuOrdre(ordreId);
      }, '✅ Enregistré');
    });
  }

  /** Éditeur du modèle par défaut (s'applique aux nouveaux ordres). */
  async function editeurModele() {
    const modele = await Ordres.modele();
    const points = modele.objetPointsDefaut || [];
    const m = UI.modale({
      titre: 'Éditeur du modèle d\'ordre de mission',
      taille: 'modal--xl',
      corps: `<div class="editeur-grid">
        <div class="editeur-champs">
          <div class="field"><label>Structure</label><input class="input" id="t-structure" value="${Utils.esc(modele.structure)}"></div>
          <div class="field"><label>Adresse</label><input class="input" id="t-adresse" value="${Utils.esc(modele.adresse)}"></div>
          <div class="field"><label>Titre</label><input class="input" id="t-titre" value="${Utils.esc(modele.titre)}"></div>
          <div class="field"><label>Texte introductif</label><textarea class="input" id="t-intro">${Utils.esc(modele.intro)}</textarea></div>
          <div class="field"><label>Lieu par défaut</label><input class="input" id="t-lieu" value="${Utils.esc(modele.lieu)}"></div>
          <div class="field"><label>Imputation par défaut</label><input class="input" id="t-imput" value="${Utils.esc(modele.imputationDefaut)}"></div>
          <div class="field"><label>Signataire (nom)</label><input class="input" id="t-signnom" value="${Utils.esc(modele.signataireNom)}"></div>
          <div class="field"><label>Fonction du signataire</label><input class="input" id="t-signfonc" value="${Utils.esc(modele.signataireFonction)}"></div>
          <div class="field"><label>Formule administrative</label><textarea class="input" id="t-formule">${Utils.esc(modele.formule)}</textarea></div>
          <div class="field"><label>Points d'objet par défaut (un par ligne)</label>
            <textarea class="input" id="t-points" rows="6">${points.map(Utils.esc).join('\n')}</textarea></div>
          <div class="field"><label>Logo (image)</label>
            <input type="file" class="input" id="t-logo" accept="image/*">
            ${modele.logoDataUrl ? '<img src="' + modele.logoDataUrl + '" style="max-height:60px;margin-top:6px">' : '<p class="hint">Aucun logo.</p>'}</div>
        </div>
        <div>
          <h4 style="color:var(--bleu-800)">Prévisualisation</h4>
          <div id="t-apercu"></div>
        </div>
      </div>
      <p class="hint">Le pied de page <strong>${Utils.esc(Ordres.FOOTER_IMMUABLE)}</strong> reste obligatoire et ne peut pas être modifié.</p>`,
      pieds: `<button class="btn btn--gris" data-fermer>Fermer sans enregistrer</button>
              <button class="btn" id="t-enr"><span class="spinner"></span><span class="btn-label">Enregistrer le modèle</span></button>`
    });
    m.boite.querySelector('[data-fermer]').addEventListener('click', m.fermer);
    m.boite.querySelector('#t-logo').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const lecteur = new FileReader();
      lecteur.onload = () => { m.boite.querySelector('#t-logo').dataset.img = lecteur.result; };
      lecteur.readAsDataURL(f);
    });
    m.boite.querySelector('#t-enr').addEventListener('click', async (ev) => {
      await Utils.avecChargement(ev.currentTarget, async () => {
        await Ordres.mettreAJourModele({
          structure: m.boite.querySelector('#t-structure').value,
          adresse: m.boite.querySelector('#t-adresse').value,
          titre: m.boite.querySelector('#t-titre').value,
          intro: m.boite.querySelector('#t-intro').value,
          lieu: m.boite.querySelector('#t-lieu').value,
          imputationDefaut: m.boite.querySelector('#t-imput').value,
          signataireNom: m.boite.querySelector('#t-signnom').value,
          signataireFonction: m.boite.querySelector('#t-signfonc').value,
          formule: m.boite.querySelector('#t-formule').value,
          objetPointsDefaut: m.boite.querySelector('#t-points').value.split('\n').map((s) => s.trim()).filter(Boolean),
          logoDataUrl: m.boite.querySelector('#t-logo').dataset.img || modele.logoDataUrl || ''
        });
        Utils.toast('Modèle enregistré. Les nouveaux ordres utiliseront ce modèle.', 'succes', 5000);
        m.fermer();
      }, '✅ Enregistré');
    });
  }

  /* ---------------- CALENDRIER ---------------- */
  VUES.calendrier = async () => {
    return `
    <div class="card">
      <div class="cal-nav">
        <button class="btn btn--outline btn--sm" id="cal-prev">‹ Mois précédent</button>
        <div class="cal-titre" id="cal-titre"></div>
        <div>
          <button class="btn btn--outline btn--sm" id="cal-today">Aujourd'hui</button>
          <button class="btn btn--outline btn--sm" id="cal-next">Mois suivant ›</button>
        </div>
      </div>
      <div class="cal-grid" id="cal-grid"></div>
      <div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:.82rem">
        <span><span class="badge badge--bleu">Programmée</span></span>
        <span><span class="badge badge--vert">En cours</span></span>
        <span><span class="badge badge--gris">Terminée</span></span>
        <span><span class="badge badge--rouge">Conflit</span></span>
      </div>
    </div>`;
  };
  APRES.calendrier = async () => {
    const missions = await Missions.lister({ inclureArchivees: false });
    let curseur = new Date();
    const rendu = () => {
      const annee = curseur.getFullYear(), mois = curseur.getMonth();
      document.getElementById('cal-titre').textContent =
        curseur.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const nomsJours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      const grid = document.getElementById('cal-grid');
      grid.innerHTML = nomsJours.map((j) => `<div class="cal-jour-tete">${j}</div>`).join('');
      const premier = new Date(annee, mois, 1);
      let decalage = (premier.getDay() + 6) % 7; // lundi = 0
      const nbJours = new Date(annee, mois + 1, 0).getDate();
      const aujourd = Utils.aujourdhui();
      for (let i = 0; i < decalage; i++) {
        const d = new Date(annee, mois, -decalage + i + 1);
        grid.appendChild(jourVide(d, true));
      }
      for (let j = 1; j <= nbJours; j++) {
        const date = new Date(annee, mois, j);
        const iso = date.toISOString().slice(0, 10);
        const cell = Utils.el('div', { class: 'cal-jour' + (iso === aujourd ? ' aujourdhui' : '') });
        cell.innerHTML = `<span class="num">${j}</span>`;
        // missions ce jour
        for (const mission of missions) {
          if (!mission.dateDebut) continue;
          const debut = mission.dateDebut, fin = mission.dateFin || mission.dateDebut;
          if (iso >= debut && iso <= fin) {
            const conflit = ['VALIDEE', 'IMPRIMEE', 'EN_MISSION'].includes(mission.statut) &&
              (mission.entrepriseIds || []).some((eid, idx, arr) => arr.indexOf(eid) !== idx);
            const cls = mission.statut === 'EN_MISSION' ? 'en-cours'
              : mission.statut === 'TERMINEE' ? 'terminee'
              : conflit ? 'conflit' : 'programmee';
            const ev = Utils.el('div', { class: `cal-evenement ${cls}`, title: mission.reference }, mission.reference || 'Mission');
            ev.addEventListener('click', () => ouvrirMission(mission.id));
            cell.appendChild(ev);
          }
        }
        grid.appendChild(cell);
      }
      for (let i = nbJours + decalage; i < Math.ceil((nbJours + decalage) / 7) * 7; i++) {
        const d = new Date(annee, mois + 1, i - (nbJours + decalage) + 1);
        grid.appendChild(jourVide(d, true));
      }
      function jourVide(d, hors) {
        return Utils.el('div', { class: 'cal-jour' + (hors ? ' hors-mois' : '') },
          `<span class="num">${d.getDate()}</span>`);
      }
    };
    document.getElementById('cal-prev').addEventListener('click', () => { curseur.setMonth(curseur.getMonth() - 1); rendu(); });
    document.getElementById('cal-next').addEventListener('click', () => { curseur.setMonth(curseur.getMonth() + 1); rendu(); });
    document.getElementById('cal-today').addEventListener('click', () => { curseur = new Date(); rendu(); });
    rendu();
  };

  /* ---------------- HISTORIQUE ---------------- */
  VUES.historique = async () => {
    const lignes = await Historique.lister();
    const entreprises = await Entreprises.lister({ inclureArchivees: true });
    const missions = await DB.tout('missions');
    const corps = (await Promise.all(lignes.map(async (h) => {
      const ent = entreprises.find((e) => e.id === h.entrepriseId);
      const mission = missions.find((m) => m.id === h.missionId);
      const eq = h.equipeId ? await Equipes.parId(h.equipeId) : null;
      return `<tr>
        <td data-label="Date">${Utils.fmtDate(h.dateVisite)}</td>
        <td data-label="Entreprise"><strong>${Utils.esc(ent ? ent.denomination : '—')}</strong></td>
        <td data-label="Mission">${Utils.esc(mission ? mission.reference : '—')}</td>
        <td data-label="Équipe">${Utils.esc(eq ? eq.nom : '—')}</td>
        <td data-label="Ordre">${Utils.esc(h.ordreNumero || '—')}</td>
        <td data-label="Statut"><span class="badge ${h.statut === 'TERMINÉE' ? 'badge--vert' : 'badge--rouge'}">${Utils.esc(h.statut || '—')}</span></td>
        <td data-label="Fiche"><button class="btn btn--outline btn--sm" data-fiche-ent="${h.entrepriseId}">Fiche entreprise</button></td>
      </tr>`;
    }))).join('');
    return `<div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr><th>Date visite</th><th>Entreprise</th><th>Mission</th><th>Équipe</th><th>Ordre</th><th>Statut</th><th></th></tr></thead>
        <tbody>${corps || '<tr><td colspan="7" class="empty-state"><span class="ico">🕘</span>Aucun historique. Démarrez une mission pour alimenter l\'historique.</td></tr>'}</tbody>
      </table></div></div>`;
  };
  APRES.historique = async () => {
    document.querySelectorAll('[data-fiche-ent]').forEach((b) =>
      b.addEventListener('click', () => ficheEntreprise(b.dataset.ficheEnt)));
  };

  /* ---------------- STATISTIQUES ---------------- */
  VUES.statistiques = async () => {
    const s = await Statistiques.generer();
    const jamais = await Historique.entreprisesJamaisVisitees();
    const visites = await Historique.entreprisesVisitees();
    const lignesClassement = s.classementAgents.slice(0, 15).map((c, i) => {
      const max = Math.max(1, s.classementAgents[0].total);
      const pct = Math.round((c.total / max) * 100);
      const forte = c.annee >= s.seuilCharge;
      return `<tr>
        <td data-label="#">#${i + 1}</td>
        <td data-label="Agent">${Utils.esc(Utils.nomAgent(c.agent))} ${forte ? '⚠️' : ''}</td>
        <td data-label="Totales">${c.total}</td>
        <td data-label="Année">${c.annee}</td>
        <td data-label="Mois">${c.mois}</td>
        <td data-label="En cours">${c.enCours}</td>
        <td data-label="Dernière">${Utils.fmtDate(c.derniereMission)}</td>
        <td data-label="Charge"><div class="barre-charge"><span class="${forte ? 'forte' : ''}" style="width:${pct}%"></span></div></td>
      </tr>`;
    }).join('');
    return `
    <div class="stats-grid">
      ${carteStat('🏢', s.entreprises.total, 'Entreprises total', 'bleu')}
      ${carteStat('✅', visites.length, 'Entreprises visitées', 'vert')}
      ${carteStat('⚪', jamais.length, 'Jamais visitées', 'jaune')}
      ${carteStat('🔴', s.entreprises.enMission, 'En mission', 'rouge')}
      ${carteStat('🗂️', s.missions.total, 'Missions total', 'bleu')}
      ${carteStat('📆', s.missions.annee, `Missions ${new Date().getFullYear()}`, 'vert')}
      ${carteStat('📅', s.missions.mois, 'Ce mois-ci', 'jaune')}
      ${carteStat('▶️', s.missions.enCours, 'Missions actives', 'rouge')}
      ${carteStat('✅', s.missions.terminees, 'Terminées', 'vert')}
      ${carteStat('👥', s.agents.actifs, 'Agents actifs', 'bleu')}
      ${carteStat('🧑‍🤝‍🧑', s.equipes.total, 'Équipes', 'violet')}
      ${carteStat('🧾', s.ordres.total, 'Ordres générés', 'vert')}
    </div>
    <div class="card">
      <div class="card-title"><span class="barre"></span> Missions par agent (classement & charge)</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>Agent</th><th>Total</th><th>Année</th><th>Mois</th><th>En cours</th><th>Dernière</th><th>Charge</th></tr></thead>
        <tbody>${lignesClassement || '<tr><td colspan="8" class="empty-state">Aucun agent.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title"><span class="barre"></span> Missions par équipe</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Équipe</th><th>Missions totales</th><th>Actives</th><th>Terminées</th></tr></thead>
        <tbody>${s.statsEquipes.map((e) => `<tr>
          <td data-label="Équipe"><strong>${Utils.esc(e.equipe.nom)}</strong></td>
          <td data-label="Total">${e.total}</td>
          <td data-label="Actives"><span class="badge ${e.actives ? 'badge--rouge' : 'badge--gris'}">${e.actives}</span></td>
          <td data-label="Terminées">${e.terminees}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">Aucune équipe.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  };
  APRES.statistiques = async () => {};

  /* ---------------- ARCHIVES ---------------- */
  VUES.archives = async () => {
    const [missions, ordres, entreprises] = await Promise.all([
      Missions.lister({ inclureArchivees: true }),
      Ordres.lister(),
      Entreprises.lister({ inclureArchivees: true })
    ]);
    const misArch = missions.filter((m) => m.statut === 'ARCHIVEE');
    const ordArch = ordres.filter((o) => o.statut === 'ARCHIVE');
    const entArch = entreprises.filter((e) => e.statut === 'ARCHIVEE');
    return `
    <div class="tabs">
      <button class="tab actif" data-arch="missions">Missions (${misArch.length})</button>
      <button class="tab" data-arch="ordres">Ordres (${ordArch.length})</button>
      <button class="tab" data-arch="entreprises">Entreprises (${entArch.length})</button>
    </div>
    <div class="card" id="arch-contenu"></div>`;
  };
  APRES.archives = async () => {
    const conteneur = document.getElementById('arch-contenu');
    const rendu = async (onglet) => {
      const [missions, ordres, entreprises] = await Promise.all([
        Missions.lister({ inclureArchivees: true }), Ordres.lister(), Entreprises.lister({ inclureArchivees: true })
      ]);
      if (onglet === 'missions') {
        const liste = missions.filter((m) => m.statut === 'ARCHIVEE');
        conteneur.innerHTML = `<div class="table-wrap"><table class="data">
          <thead><tr><th>Référence</th><th>Période</th><th>Date archivage</th><th></th></tr></thead>
          <tbody>${liste.map((m) => `<tr><td data-label="Référence"><strong>${Utils.esc(m.reference)}</strong></td>
            <td data-label="Période">${Utils.fmtDate(m.dateDebut)} → ${Utils.fmtDate(m.dateFin)}</td>
            <td data-label="Archivée le">${Utils.fmtDate(m.dateArchivage)}</td>
            <td data-label=""><button class="btn btn--outline btn--sm" data-voir-m="${m.id}">Consulter</button></td></tr>`).join('')
            || '<tr><td colspan="4" class="empty-state">Aucune mission archivée.</td></tr>'}</tbody></table></div>`;
        conteneur.querySelectorAll('[data-voir-m]').forEach((b) =>
          b.addEventListener('click', () => ouvrirMission(b.dataset.voirM)));
      } else if (onglet === 'ordres') {
        const liste = ordres.filter((o) => o.statut === 'ARCHIVE');
        conteneur.innerHTML = `<div class="table-wrap"><table class="data">
          <thead><tr><th>Numéro</th><th>Date</th><th>Archivé le</th><th></th></tr></thead>
          <tbody>${liste.map((o) => `<tr><td data-label="Numéro"><strong>${Utils.esc(o.numero)}</strong></td>
            <td data-label="Date">${Utils.fmtDate(o.dateCreation)}</td>
            <td data-label="Archivé le">${Utils.fmtDate(o.dateArchivage)}</td>
            <td><button class="btn btn--outline btn--sm" data-voir-o="${o.id}">Consulter</button></td></tr>`).join('')
            || '<tr><td colspan="4" class="empty-state">Aucun ordre archivé.</td></tr>'}</tbody></table></div>`;
        conteneur.querySelectorAll('[data-voir-o]').forEach((b) =>
          b.addEventListener('click', () => apercuOrdre(b.dataset.voirO)));
      } else {
        const liste = entreprises.filter((e) => e.statut === 'ARCHIVEE');
        conteneur.innerHTML = `<div class="table-wrap"><table class="data">
          <thead><tr><th>Dénomination</th><th>Province</th><th>Archivée le</th><th></th></tr></thead>
          <tbody>${liste.map((e) => `<tr><td data-label="Dénomination"><strong>${Utils.esc(e.denomination)}</strong></td>
            <td data-label="Province">${Utils.esc(e.province || '—')}</td>
            <td data-label="Archivée le">${Utils.fmtDate(e.dateArchivage)}</td>
            <td><button class="btn btn--vert btn--sm" data-reactiver="${e.id}">Réactiver</button>
                <button class="btn btn--outline btn--sm" data-fiche="${e.id}">Fiche</button></td></tr>`).join('')
            || '<tr><td colspan="4" class="empty-state">Aucune entreprise archivée.</td></tr>'}</tbody></table></div>`;
        conteneur.querySelectorAll('[data-reactiver]').forEach((b) =>
          b.addEventListener('click', async () => { await Entreprises.reactiver(b.dataset.reactiver); Utils.toast('Entreprise réactivée.', 'succes'); rendu('entreprises'); }));
        conteneur.querySelectorAll('[data-fiche]').forEach((b) =>
          b.addEventListener('click', () => ficheEntreprise(b.dataset.fiche)));
      }
    };
    document.querySelectorAll('[data-arch]').forEach((t) =>
      t.addEventListener('click', () => {
        document.querySelectorAll('[data-arch]').forEach((x) => x.classList.remove('actif'));
        t.classList.add('actif'); rendu(t.dataset.arch);
      }));
    await rendu('missions');
  };

  /* ---------------- ALERTES ---------------- */
  VUES.alertes = async () => {
    const alertes = await Statistiques.alertes();
    const notifs = await Notifications.lister(false);
    const renduNotifs = notifs.slice(0, 30).map((n) => {
      const meta = Notifications.META[n.type] || Notifications.META.info;
      return `<div class="notif-item ${meta.cls}">
        <span class="n-ico">${meta.ico}</span>
        <div><strong>${Utils.esc(n.titre)}</strong><div>${Utils.esc(n.message)}</div>
        <div class="n-date">${Utils.fmtDT(new Date(n.date))}</div></div></div>`;
    }).join('');
    return `
    <div class="card">
      <div class="card-title"><span class="barre"></span> Centre d'alertes</div>
      ${alertes.length ? alertes.map((a) =>
        `<div class="alerte alerte--${a.type === 'conflit' ? 'rouge' : a.type === 'visite' ? 'orange' : 'bleu'}">
          <span class="ico">${a.ico}</span><span><strong>${Utils.esc(a.titre)}</strong>${Utils.esc(a.message)}</span></div>`).join('')
        : '<div class="alerte alerte--vert"><span class="ico">🟢</span><span><strong>Aucune alerte</strong>Tout est à jour.</span></div>'}
    </div>
    <div class="card">
      <div class="card-title"><span class="barre"></span> Notifications récentes
        <button class="btn btn--outline btn--sm" id="btn-marquer-lues" style="margin-left:auto">Tout marquer comme lu</button></div>
      ${renduNotifs || '<p class="hint">Aucune notification.</p>'}
    </div>`;
  };
  APRES.alertes = async () => {
    document.getElementById('btn-marquer-lues')?.addEventListener('click', async () => {
      await Notifications.marquerToutesLues(); Utils.toast('Notifications marquées comme lues.', 'succes');
      await majBadges(); naviguer('alertes');
    });
  };

  /* ---------------- PARAMÈTRES ---------------- */
  VUES.parametres = async () => {
    const prefs = await Parametres.preferences();
    const compte = await Parametres.informationsCompte();
    const meta = await Parametres.metaDonnees();
    return `
    <div class="grid-2">
      <div class="card">
        <div class="card-title"><span class="barre"></span> Compte administrateur</div>
        <div class="fiche-grid">
          <div class="fiche-item"><div class="k">Utilisateur</div><div class="v">${Utils.esc(compte.utilisateur)}</div></div>
          <div class="fiche-item"><div class="k">Rôle</div><div class="v">${Utils.esc(compte.role)}</div></div>
          <div class="fiche-item"><div class="k">Compte créé</div><div class="v">${Utils.fmtDate((compte.dateCreation || '').slice(0, 10))}</div></div>
          <div class="fiche-item"><div class="k">Mot de passe modifié</div><div class="v">${compte.dateModificationMdp ? Utils.fmtDate(compte.dateModificationMdp.slice(0, 10)) : 'Jamais (mot de passe initial)'}</div></div>
        </div>
        <hr style="border:none;border-top:2px solid var(--bleu-100);margin:14px 0">
        <h4 style="color:var(--bleu-800)">Changer le mot de passe</h4>
        <div class="field"><label>Mot de passe actuel</label><input class="input" type="password" id="p-actuel" autocomplete="current-password"></div>
        <div class="field"><label>Nouveau mot de passe (6 caractères minimum)</label><input class="input" type="password" id="p-nouveau" autocomplete="new-password"></div>
        <div class="field"><label>Confirmer le nouveau mot de passe</label><input class="input" type="password" id="p-confirme" autocomplete="new-password"></div>
        <button class="btn" id="btn-mdp"><span class="spinner"></span><span class="btn-label">Modifier le mot de passe</span></button>
      </div>

      <div class="card">
        <div class="card-title"><span class="barre"></span> Préférences</div>
        <div class="form-grid">
          <div class="field"><label>Délai « visite récente » (jours)</label><input class="input" type="number" id="pr-seuil" value="${prefs.joursVisiteRecente}" min="30" max="730"></div>
          <div class="field"><label>Seuil « agent fortement sollicité » (missions/an)</label><input class="input" type="number" id="pr-charge" value="${prefs.seuilChargeAgent}" min="3" max="50"></div>
          <div class="field" style="grid-column:1/-1"><label>Nom de la structure</label><input class="input" id="pr-structure" value="${Utils.esc(prefs.structureNom)}"></div>
        </div>
        <button class="btn" id="btn-prefs"><span class="spinner"></span><span class="btn-label">Enregistrer les préférences</span></button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="barre"></span> Stockage & données locales</div>
      <div class="alerte alerte--bleu"><span class="ico">💾</span><span>
        <strong>Mode de stockage : Local sur cet appareil</strong><br>
        Les données sont enregistrées dans la base locale IndexedDB de ce téléphone / ordinateur.
        Chaque appareil dispose de sa propre base ; les données ne sont pas synchronisées entre appareils.
        Exportez régulièrement une sauvegarde.</span></div>
      <div class="fiche-grid" style="margin:12px 0">
        ${[['Entreprises', meta.nbEnt], ['Agents', meta.nbAgt], ['Équipes', meta.nbEqp], ['Missions', meta.nbMis], ['Ordres', meta.nbOrd], ['Écritures journal', meta.nbLog]]
          .map(([k, v]) => `<div class="fiche-item stat-mini"><span class="val">${v}</span><span class="lbl">${k}</span></div>`).join('')}
      </div>
      <div class="row-actions">
        <button class="btn btn--vert" id="btn-export-json"><span class="ico">⬇️</span><span class="btn-label">Exporter les données (JSON)</span></button>
        <button class="btn btn--outline" id="btn-import-json"><span class="ico">⬆️</span><span class="btn-label">Importer une sauvegarde (JSON)</span></button>
        <button class="btn btn--outline" id="btn-export-csv">Exporter CSV (entreprises)</button>
      </div>
      <input type="file" id="fichier-import" accept=".json,application/json" style="display:none">
      <p class="hint" style="margin-top:10px">L'import fusionne les données : il n'efface jamais automatiquement les enregistrements existants.
      Conformément aux règles de conservation, l'application ne propose <strong>aucune réinitialisation</strong> des données.</p>
    </div>`;
  };
  APRES.parametres = async () => {
    document.getElementById('btn-mdp').addEventListener('click', async (e) => {
      await Utils.avecChargement(e.currentTarget, async () => {
        try {
          await Parametres.changerMotDePasse(
            document.getElementById('p-actuel').value,
            document.getElementById('p-nouveau').value,
            document.getElementById('p-confirme').value);
          Utils.toast('Mot de passe modifié avec succès.', 'succes');
          ['p-actuel', 'p-nouveau', 'p-confirme'].forEach((id) => document.getElementById(id).value = '');
        } catch (err) { Utils.toast(err.message, 'erreur', 6000); }
      }, '✅ Modifié');
    });
    document.getElementById('btn-prefs').addEventListener('click', async (e) => {
      await Utils.avecChargement(e.currentTarget, async () => {
        await Parametres.enregistrerPreferences({
          joursVisiteRecente: document.getElementById('pr-seuil').value,
          seuilChargeAgent: document.getElementById('pr-charge').value,
          structureNom: document.getElementById('pr-structure').value
        });
        Utils.toast('Préférences enregistrées.', 'succes');
      }, '✅ Enregistré');
    });
    document.getElementById('btn-export-json').addEventListener('click', async (ev) => {
      await Utils.avecChargement(ev.currentTarget, () => ImportExport.exporterJSON(), '✅ Exporté');
    });
    document.getElementById('btn-export-csv').addEventListener('click', () => ImportExport.exporterCSV('entreprises'));
    const fichierInput = document.getElementById('fichier-import');
    document.getElementById('btn-import-json').addEventListener('click', () => fichierInput.click());
    fichierInput.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const texte = await f.text();
      try {
        const { resume } = ImportExport.analyserImportJSON(texte);
        const detail = Object.entries(resume).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(', ');
        const ok = await Utils.confirmer('Importer la sauvegarde ?',
          `La sauvegarde contient : ${detail}.\n\nLes données existantes seront CONSERVÉES (fusion, aucun effacement automatique). Continuer ?`,
          { okLabel: 'Importer (fusion)', okClass: 'btn--vert' });
        if (ok) {
          const rapport = await ImportExport.importerJSON(texte);
          const ajoutes = Object.values(rapport).reduce((s, r) => s + r.ajoutes, 0);
          Utils.toast(`Import terminé : ${ajoutes} enregistrement(s) ajouté(s) par fusion.`, 'succes', 6000);
          await majBadges();
        }
      } catch (err) { Utils.toast(err.message, 'erreur', 7000); }
      fichierInput.value = '';
    });
  };

  /* ---------------- JOURNAL ---------------- */
  VUES.journal = async () => {
    const logs = await Audit.lister();
    return `<div class="card">
      <div class="card-title"><span class="barre"></span> Journal de traçabilité (${logs.length})</div>
      <div class="timeline">
        ${logs.slice(0, 200).map((l) => `
          <div class="tl-item">
            <div class="tl-date">${Utils.fmtDT(new Date(l.date))} — <strong>${Utils.esc(l.action)}</strong> · ${Utils.esc(l.module)}</div>
            <div class="txt">${Utils.esc(l.objet)}${l.details ? ' — ' + Utils.esc(l.details) : ''}</div>
            ${(l.ancienneDonnee || l.nouvelleDonnee) ? `<div class="oldnew">
              ${l.ancienneDonnee ? `<div><b>Avant :</b> ${Utils.esc(String(l.ancienneDonnee).slice(0, 220))}</div>` : ''}
              ${l.nouvelleDonnee ? `<div><i>Après :</i> ${Utils.esc(String(l.nouvelleDonnee).slice(0, 220))}</div>` : ''}
            </div>` : ''}
          </div>`).join('') || '<p class="hint">Aucune écriture au journal.</p>'}
      </div>
    </div>`;
  };
  APRES.journal = async () => {};

  return { init, naviguer, majBadges, formulaireEntreprise, formulaireAgent, formulaireEquipe,
           formulaireMission, ouvrirMission, apercuOrdre, UI };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
