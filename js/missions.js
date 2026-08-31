/* ==========================================================================
   IGT MISSIONS RDC — missions.js — Module Missions + Moteur central de validation
   validateMission() : errors[] / warnings[] / status / canValidate / canPrint
   ========================================================================== */
'use strict';

const MISSIONS = (() => {
  const S = 'missions';
  const STATUTS = ['BROUILLON', 'PROGRAMMEE', 'EN_MISSION', 'TERMINEE', 'ARCHIVEE'];

  async function nextNum() {
    const all = await DB.getAll(S);
    let max = 0;
    all.forEach((r) => { const m = /MIS-(\d+)/.exec(r.id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function generateId() { return Utils.genId('MIS', await nextNum()); }

  async function getSetting(key, fallback) {
    try { const s = await DB.get('settings', key); return s ? s.value : fallback; } catch (e) { return fallback; }
  }
  async function recentWindowMonths() { const v = await getSetting('avertissementMois', 4); const n = parseInt(v, 10); return isNaN(n) ? 4 : n; }

  /* ---------- Création (transaction multi-stores) ---------- */
  async function createMission(data) {
    if (!data.equipeId) throw new Error('Une équipe est requise.');
    const id = data.id || await generateId();
    const now = Utils.nowStamp();
    const mission = Object.assign({
      id, reference: data.reference || id, structureId: data.structureId || '', structure: data.structure || '',
      dateCreation: now, equipeId: data.equipeId, chefMission: data.chefMission || '',
      entrepriseIds: data.entrepriseIds || [], agentIds: data.agentIds || [],
      dateDebut: data.dateDebut || '', dateFin: data.dateFin || '', duree: data.duree || '',
      objet: data.objet || '', observations: data.observations || '',
      statut: data.statut || 'BROUILLON', valide: false, dateValidation: '', utilisateurValidation: '',
      imprime: false, dateImpression: '', heureImpression: '', ordreId: data.ordreId || '',
      dateCloture: '', creeLe: now, modifieLe: now
    }, data);

    // Transaction atomique : mission + relations + journal
    await DB.transact([S, 'missionEntreprises', 'missionAgents', 'auditLogs'], 'readwrite', (stores, req) => {
      stores[S].put(mission);
      (mission.entrepriseIds || []).forEach((eid) => stores['missionEntreprises'].put({ id: id + '_' + eid, missionId: id, entrepriseId: eid }));
      (mission.agentIds || []).forEach((aid) => stores['missionAgents'].put({ id: id + '_' + aid, missionId: id, agentId: aid }));
      req(stores['auditLogs'].add({ id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), type: 'CREATE', module: 'missions', objet: 'Mission créée', utilisateur: 'admin', date: now, objetId: id, action: 'CREATE' }));
    });
    await AUDIT.log('CREATE', 'missions', 'Mission créée', 'admin', { id });
    return mission;
  }

  async function updateMission(id, data) {
    const e = await DB.get(S, id);
    if (!e) throw new Error('Mission introuvable.');
    const d = Object.assign({}, e, data, { id, modifieLe: Utils.nowStamp() });
    // synchroniser les relations
    await DB.transact([S, 'missionEntreprises', 'missionAgents'], 'readwrite', (stores, req) => {
      stores[S].put(d);
      if (data.entrepriseIds) {
        const oldReqs = stores['missionEntreprises'].index('missionId').getAll(id);
        oldReqs.onsuccess = () => { oldReqs.result.forEach((r) => stores['missionEntreprises'].delete(r.id)); (d.entrepriseIds || []).forEach((eid) => stores['missionEntreprises'].put({ id: id + '_' + eid, missionId: id, entrepriseId: eid })); };
      }
      if (data.agentIds) {
        const oldReqs = stores['missionAgents'].index('missionId').getAll(id);
        oldReqs.onsuccess = () => { oldReqs.result.forEach((r) => stores['missionAgents'].delete(r.id)); (d.agentIds || []).forEach((aid) => stores['missionAgents'].put({ id: id + '_' + aid, missionId: id, agentId: aid })); };
      }
    });
    await AUDIT.log('UPDATE', 'missions', 'Mission modifiée', 'admin', { id });
    return d;
  }

  async function getMission(id) { return (await DB.get(S, id)) || null; }
  async function getMissions() { return (await DB.getAll(S)).sort((a, b) => String(b.dateCreation).localeCompare(String(a.dateCreation))); }

  /* ---------- Assistance / états ---------- */
  async function getEquipeDetails(mission) { return mission.equipeId ? EQUIPES.getEquipe(mission.equipeId) : null; }
  async function getMissionEntreprises(mission) {
    if (!mission.entrepriseIds) return [];
    const list = await Promise.all(mission.entrepriseIds.map((id) => ENTREPRISES.getEntreprise(id)));
    return list.filter(Boolean);
  }
  async function getMissionAgents(mission) {
    if (!mission.agentIds) return [];
    const list = await Promise.all(mission.agentIds.map((id) => AGENTS.getAgent(id)));
    return list.filter(Boolean);
  }

  /* ==========================================================
     MOTEUR CENTRAL DE VALIDATION
     ========================================================== */
  async function validateMission(mission) {
    const errors = [];
    const warnings = [];
    const moisAvert = await recentWindowMonths();
    const today = Utils.todayISO();

    const info = { conflictedCompanies: [], recentCompanies: [], unavailableEquipe: null, unavailableAgents: [] };

    /* 1. Entreprises existantes */
    const entIds = mission.entrepriseIds || [];
    const entrepriseObjs = [];
    for (const eid of entIds) { const e = await ENTREPRISES.getEntreprise(eid); entrepriseObjs.push(e); }
    if (entIds.length === 0) errors.push({ code: 'ENTREPRISES_VIDES', type: 'error', titre: 'Aucune entreprise', message: 'La mission doit inclure au moins une entreprise.' });
    else {
      entIds.forEach((eid, i) => { if (!entrepriseObjs[i]) errors.push({ code: 'ENTREPRISE_INEXISTANTE', type: 'error', titre: 'Entreprise introuvable', message: 'Une entreprise référencée n\'existe plus.' }); });
    }

    /* 2. Doublons dans la mission */
    const seen = new Set();
    entIds.forEach((eid) => { if (seen.has(eid)) errors.push({ code: 'DOUBLON_MISSION', type: 'error', titre: 'Doublon', message: 'Cette entreprise figure déjà dans la mission.' }); seen.add(eid); });

    /* 3. Entreprises déjà en mission */
    const allMissions = await getMissions();
    for (const eid of entIds) {
      const ent = await ENTREPRISES.getEntreprise(eid);
      const enMission = allMissions.find((m) => {
        if (m.id === mission.id) return false;
        if (m.statut === 'ARCHIVÉE') return false;
        if (m.statut === 'BROUILLON') return false;
        const ref = (m.entrepriseIds || []).includes(eid);
        const overlap = Utils.inRange(m.dateDebut, m.dateFin, mission.dateDebut, mission.dateFin);
        const active = m.statut === 'EN_MISSION' || m.statut === 'PROGRAMMEE';
        return ref && (active || overlap);
      });
      if (enMission) {
        errors.push({ code: 'ENTREPRISE_EN_MISSION', type: 'error', titre: 'Entreprise déjà en mission', message: (ent ? ent.denomination : eid) + ' est déjà affectée à ' + enMission.reference + '.', mission: enMission });
        info.conflictedCompanies.push({ entreprise: ent, mission: enMission });
      }
    }

    /* 4. Entreprises récemment visitées (avertissement) */
    for (const eid of entIds) {
      const ent = await ENTREPRISES.getEntreprise(eid);
      if (!ent) continue;
      const dv = ent.derniereVisite || '';
      if (dv) {
        const limite = Utils.addMonths(today, -moisAvert);
        if (String(limite) <= String(dv)) {
          const equipe = ent.derniereEquipe || '';
          const eq = await EQUIPES.getEquipe(ent.derniereEquipeId || '');
          warnings.push({ code: 'VISITE_RECENTE', type: 'warning', titre: 'Entreprise visitée récemment', message: ent.denomination + ' a été visitée le ' + Utils.fmtDate(dv) + ' (' + (ent.derniereEquipe || '—') + '). Moins de ' + moisAvert + ' mois.', entreprise: ent });
          info.recentCompanies.push(entrepriseObjs.find(e => e && e.id === eid) || ent);
        }
      }
    }

    /* 5. Équipe disponible */
    if (!mission.equipeId) errors.push({ code: 'EQUIPE_VIDE', type: 'error', titre: 'Aucune équipe', message: 'La mission doit avoir une équipe.' });
    else {
      const dispo = await EQUIPES.equipeDisponible(mission.equipeId, mission.dateDebut, mission.dateFin, mission.id);
      const eq = await EQUIPES.getEquipe(mission.equipeId);
      if (!dispo.disponible) {
        errors.push({ code: 'EQUIPE_INDISPONIBLE', type: 'error', titre: 'Équipe indisponible', message: (eq ? eq.nom : mission.equipeId) + ' est déjà affectée sur la période sélectionnée (' + dispo.conflicts.map(c => c.reference).join(', ') + ').', mission: dispo.conflicts[0] });
        info.unavailableEquipe = { equipe: eq, mission: dispo.conflicts[0] };
      }
    }

    /* 6. Agents disponibles */
    const agentIds = mission.agentIds || [];
    for (const aid of agentIds) {
      const dispo = await AGENTS.agentDisponible(aid, mission.dateDebut, mission.dateFin, mission.id);
      const ag = await AGENTS.getAgent(aid);
      if (!dispo.disponible) {
        errors.push({ code: 'AGENT_INDISPONIBLE', type: 'error', titre: 'Agent déjà affecté', message: (ag ? (ag.nom + ' ' + (ag.postnom || '')) : aid) + ' participe déjà à une mission sur la période sélectionnée (' + dispo.conflicts.map(c => c.reference).join(', ') + ').', mission: dispo.conflicts[0] });
        info.unavailableAgents.push({ agent: ag, mission: dispo.conflicts[0] });
      }
    }

    /* 7. Champs obligatoires */
    if (!mission.dateDebut) errors.push({ code: 'DATE_DEBUT_VIDE', type: 'error', titre: 'Date de début manquante', message: 'La date de début est obligatoire.' });
    if (!mission.dateFin) errors.push({ code: 'DATE_FIN_VIDE', type: 'error', titre: 'Date de fin manquante', message: 'La date de fin est obligatoire.' });
    if (!mission.objet) errors.push({ code: 'OBJET_VIDE', type: 'error', titre: 'Objet manquant', message: 'L\'objet de la mission est obligatoire.' });
    if (!mission.structure) errors.push({ code: 'STRUCTURE_VIDE', type: 'warning', titre: 'Structure manquante', message: 'Aucune structure renseignée. (non bloquant)' });

    /* 8. Cohérence des dates */
    if (mission.dateDebut && mission.dateFin && String(mission.dateFin) < String(mission.dateDebut)) {
      errors.push({ code: 'DATES_INCOHERENTES', type: 'error', titre: 'Dates incohérentes', message: 'La date de fin doit être postérieure ou égale à la date de début.' });
    }

    /* 9. Ordre correctement renseigné */
    // Le blocage correspond à canPrint (ordre généré). On avertit si aucun ordre n'existe.
    if (!mission.ordreId) {
      const ordre = await ORDRES.findByMission(mission.id);
      if (!ordre) warnings.push({ code: 'ORDRE_MANQUANT', type: 'warning', titre: 'Ordre non généré', message: 'Aucun ordre de mission n\'a encore été généré. (non bloquant)' });
    }

    // "Entreprise déjà en mission" pour toutes les missions actives -> statut d'entreprise
    // mise à jour automatique de l'état EN MISSION (cohérence), sauf si mission en cours est celle-ci.

    /* ----- Statut de validation ----- */
    let status = 'VALID';
    if (errors.length) status = 'BLOCKED';
    else if (warnings.length) status = 'WARNINGS';

    const canValidate = errors.length === 0;
    const canPrint = errors.length === 0;

    return { errors, warnings, status, canValidate, canPrint, info };
  }

  /* ---------- Validation / impression / clôture ---------- */
  async function validerMission(id) {
    const m = await getMission(id);
    const res = await validateMission(m);
    if (!res.canValidate) return { ok: false, result: res };
    m.valide = true; m.dateValidation = Utils.nowStamp(); m.utilisateurValidation = 'admin';
    if (m.statut === 'BROUILLON') m.statut = 'PROGRAMMEE';
    m.modifieLe = Utils.nowStamp();
    await DB.put(S, m);
    await AUDIT.log('VALIDATE', 'missions', 'Mission validée', 'admin', { id });
    return { ok: true, result: res, mission: m };
  }

  async function marquerImprimee(id, reference) {
    const m = await getMission(id) || {};
    m.imprime = true; m.dateImpression = Utils.todayISO(); m.heureImpression = Utils.nowTime(); m.modifieLe = Utils.nowStamp();
    await DB.put(S, m);
    await AUDIT.log('PRINT', 'ordres', 'Ordre imprimé', 'admin', { id, reference });
    return m;
  }

  async function cloreMission(id, dateReelleFin) {
    const m = await getMission(id);
    if (!m) throw new Error('Mission introuvable.');
    m.statut = 'TERMINEE';
    m.dateCloture = dateReelleFin || Utils.todayISO();
    m.modifieLe = Utils.nowStamp();
    await DB.put(S, m);
    // Mise à jour automatique : dernière visite entreprises, dernières missions agents/équipes, historique
    await updateHistoryOnClose(id);
    await AUDIT.log('ARCHIVE', 'missions', 'Mission clôturée', 'admin', { id });
    return m;
  }

  async function archiverMission(id) {
    const m = await getMission(id);
    if (!m) throw new Error('Mission introuvable.');
    if (m.statut !== 'TERMINEE') { await cloreMission(id); }
    const m2 = await getMission(id);
    m2.statut = 'ARCHIVEE'; m2.modifieLe = Utils.nowStamp();
    await DB.put(S, m2);
    for (const eid of (m2.entrepriseIds || [])) await ENTREPRISES.archiveEntreprise(eid).catch(() => {});
    // ajouter à archives
    await DB.put('archives', Object.assign({}, m2, { archivesLe: Utils.nowStamp() }));
    await AUDIT.log('ARCHIVE', 'missions', 'Mission archivée', 'admin', { id });
    return m2;
  }

  async function updateHistoryOnClose(id) {
    const m = await getMission(id);
    if (!m) return;
    const fin = m.dateCloture || m.dateFin;
    // Entreprises -> dernière visite, libérées
    for (const eid of (m.entrepriseIds || [])) {
      const eq = await EQUIPES.getEquipe(m.equipeId);
      await ENTREPRISES.setDerniereVisite(eid, fin, eq ? eq.nom : '', m.ordreId ? (await ORDRES.get(m.ordreId)).reference : '');
      const e = await ENTREPRISES.getEntreprise(eid);
      if (e && !e.archive) { e.statut = 'DISPONIBLE'; await DB.put('entreprises', e); }
    }
    // Agents -> dernière mission + nb
    for (const aid of (m.agentIds || [])) {
      const a = await AGENTS.getAgent(aid);
      if (a) { a.derniereMission = fin; a.nbMissions = (a.nbMissions || 0) + 1; await DB.put('agents', a); }
    }
    // Équipe -> dernière mission
    const eq = await EQUIPES.getEquipe(m.equipeId);
    if (eq) { eq.derniereMission = fin; eq.statut = 'DISPONIBLE'; await DB.put('equipes', eq); }
    // Historique global
    await DB.put('historique', {
      id: 'hist_' + id, missionId: id, reference: m.reference, type: 'MISSION_TERMINEE',
      date: Utils.nowStamp(), entrepriseIds: m.entrepriseIds, agentIds: m.agentIds,
      equipeId: m.equipeId, objet: m.objet, dateDebut: m.dateDebut, dateFin: fin, statut: 'TERMINEE'
    });
  }

  /* ---------- Recherche & filtres ---------- */
  async function getMissionsFiltrees(query, opts) {
    opts = opts || {};
    let all = await getMissions();
    const q = Utils.norm(query || '');
    if (q) all = all.filter((m) => Utils.norm([m.reference, m.structure, m.objet].join(' ')).includes(q));
    if (opts.dateDebut) all = all.filter((m) => String(m.dateDebut) >= String(opts.dateDebut));
    if (opts.dateFin) all = all.filter((m) => String(m.dateFin) <= String(opts.dateFin));
    if (opts.statut) all = all.filter((m) => String(m.statut) === opts.statut);
    if (opts.equipeId) all = all.filter((m) => String(m.equipeId) === opts.equipeId);
    if (opts.province) all = all.filter((m) => String(m.province) === opts.province);
    return all;
  }

  /* Attacher un ordre à une mission */
  async function setOrdre(missionId, ordreId) {
    const m = await getMission(missionId);
    if (!m) return;
    m.ordreId = ordreId; m.modifieLe = Utils.nowStamp();
    await DB.put(S, m);
    return m;
  }

  return {
    S, STATUTS, createMission, updateMission, getMission, getMissions, getMissionsFiltrees,
    getEquipeDetails, getMissionEntreprises, getMissionAgents,
    validateMission, validerMission, marquerImprimee, cloreMission, archiverMission,
    updateHistoryOnClose, setOrdre, recentWindowMonths
  };
})();

/* ==========================================================================
   UI — Module Missions (liste + assistant de création en étapes)
   ========================================================================== */
MISSIONS.render = async function render(container) {
  const state = { q: '', statut: '', equipeId: '', province: '' };
  let wizard = null;

  /* ---------- Assistant ---------- */
  function newWizard() {
    wizard = {
      step: 0, saved: null,
      data: { structureId: '', structure: '', chefMission: '', equipeId: '', entrepriseIds: [], agentIds: [], dateDebut: '', dateFin: '', duree: '', objet: '', observations: '', province: '', imputation: '' }
    };
    return wizard;
  }

  async function openWizardFor(mission) {
    const isEdit = !!mission;
    if (!wizard) newWizard();
    if (isEdit) { wizard.data = Object.assign({}, wizard.data, mission); wizard.data.entrepriseIds = (mission.entrepriseIds||[]).slice(); wizard.data.agentIds=(mission.agentIds||[]).slice(); }
    const m = UI.modal({ title: isEdit ? 'Mission — ' + mission.reference : 'Nouvelle mission', full: true, body: '', footer: '<button class="btn sec" id="mw-cancel">Annuler</button><button class="btn" id="mw-prev" disabled>← Précédent</button><button class="btn" id="mw-next">Suivant →</button>' });
    wizard.modal = m;
    m.el.querySelector('#mw-cancel').addEventListener('click', () => m.close());
    const prevBtn = m.el.querySelector('#mw-prev'), nextBtn = m.el.querySelector('#mw-next');
    const steps = ['Informations','Équipe','Entreprises','Planification','Contrôle','Ordre','Validation','Impression'];
    async function go(step, saveFirst) {
      if (saveFirst) await persistStep();
      wizard.step = step;
      await renderStep(m.body, step);
      prevBtn.disabled = step <= 0;
      const last = false;
      const maxStep = steps.length - 1;
      if (step === maxStep) { nextBtn.style.display = step===maxStep?'none':''; }
      else { nextBtn.style.display = 'inline-flex'; }
      // barre d'état
      m.body.querySelector('#mw-etat').innerHTML = steps.map((s, i) => `<div class="etat-step ${i<step?'ok':i===step?'warn':''}"><span>${i<=step?'✓':''}</span>${s}</div>`).join('');
      m.body.querySelectorAll('#mw-etat .etat-step').forEach((e) => {});
    }
    async function persistStep() {
      // read current form fields into wizard.data
      const cur = m.body.querySelector('#mw-form');
      if (cur) Object.assign(wizard.data, UI.collect(cur));
    }
    nextBtn.addEventListener('click', async () => {
      await persistStep();
      // gestion étape 3 -> contrôle : valider
      await go(wizard.step + 1);
    });
    prevBtn.addEventListener('click', async () => { await go(wizard.step - 1); });

    await bootstrap();
    async function bootstrap() { await go(0); }

    /* step renderers */
    async function renderStep(body, step) {
      if (step === 0) return renderInfo(body);
      if (step === 1) return renderEquipe(body);
      if (step === 2) return renderEntreprises(body);
      if (step === 3) return renderPlanification(body);
      if (step === 4) return renderControle(body);
      if (step === 5) return renderOrdre(body);
      if (step === 6) return renderValidation(body);
      if (step === 7) return renderImpression(body);
    }

    async function renderInfo(body) {
      const structures = await PARAMETRES.getStructures();
      const provs = await PROVINCES_PROVIDER();
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form">
          <h3 style="margin-top:0">Étape 1 — Informations</h3>
          <div class="form-grid">
            ${UI.field('Structure *', UI.select('structureId', structures.map(s=>({value:s.id,label:s.nom})), wizard.data.structureId), { full:true })}
            ${UI.field('Chef de mission', UI.input('chefMission', wizard.data.chefMission, ''))}
            ${UI.field('Province', UI.select('province', provs, wizard.data.province))}
            ${UI.field('Imputation', UI.input('imputation', wizard.data.imputation, "A Charge de l'Inspection Générale du Travail"))}
          </div>
        </div>`;
      const sel = body.querySelector('[data-name="structureId"]');
      sel.addEventListener('change', () => { const s = structures.find(x=>x.id===sel.value); wizard.data.structure = s ? s.nom : ''; });
    }
    async function renderEquipe(body) {
      const equipes = await EQUIPES.getEquipes();
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form">
          <h3 style="margin-top:0">Étape 2 — Équipe</h3>
          <div class="form-grid">
            ${UI.field('Équipe *', UI.select('equipeId', [''].concat(equipes.map(e=>({value:e.id,label:e.nom + ' (' + (e.statut||'') + ')'}))), wizard.data.equipeId), { full:true })}
          </div>
          <div id="eq-avail"></div>
        </div>`;
      const sel = body.querySelector('[data-name="equipeId"]');
      const check = async () => {
        const box = body.querySelector('#eq-avail');
        if (!sel.value || !wizard.data.dateDebut || !wizard.data.dateFin) { box.innerHTML = '<div class="muted">Renseignez les dates à l\'étape 4 pour vérifier la disponibilité.</div>'; return; }
        const d = await EQUIPES.equipeDisponible(sel.value, wizard.data.dateDebut, wizard.data.dateFin, wizard.data.id);
        box.innerHTML = d.disponible ? `<div class="val-panel green">🟢 Équipe disponible sur la période.</div>` : `<div class="val-panel red">🔴 Équipe indisponible — déjà affectée à ${d.conflicts.map(c=>c.reference).join(', ')}.</div>`;
      };
      sel.addEventListener('change', check);
      check();
    }
    async function renderEntreprises(body) {
      const list = await ENTREPRISES.searchEntreprises('', {});
      const selected = wizard.data.entrepriseIds || [];
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form">
          <h3 style="margin-top:0">Étape 3 — Entreprises</h3>
          <div class="searchbox" style="margin-bottom:10px"><span class="si">${UI.icon('search',18)}</span><input id="mw-ent-search" placeholder="Rechercher une entreprise..." /></div>
          <div id="mw-ent-sel" style="margin-bottom:10px"></div>
          <div class="table-wrap" style="max-height:320px;overflow:auto"><table class="tbl"><thead><tr><th></th><th>Dénomination</th><th>Province</th><th>Statut</th></tr></thead><tbody id="mw-ent-rows"></tbody></table></div>
        </div>`;
      const rows = body.querySelector('#mw-ent-rows');
      const sel = body.querySelector('#mw-ent-sel');
      const req = body.querySelector('#mw-ent-search');
      let filtered = list;
      const drawRows = () => {
        rows.innerHTML = filtered.map((e) => {
          const on = selected.includes(e.id);
          return `<tr><td><input type="checkbox" data-ent="${e.id}" ${on?'checked':''}></td><td><strong>${Utils.esc(e.denomination)}</strong></td><td>${Utils.esc(e.province||'—')}</td><td>${UI.badge(e.statut)}</td></tr>`;
        }).join('') || `<tr><td colspan="4">Aucune entreprise.</td></tr>`;
        rows.querySelectorAll('[data-ent]').forEach((cb) => cb.addEventListener('change', () => toggleEnt(cb.getAttribute('data-ent'), cb.checked)));
      };
      const drawSel = () => {
        sel.innerHTML = '<div class="pill-row">' + selected.map((id) => { const e = list.find(x=>x.id===id); return `<span class="badge bd-bleu">${Utils.esc(e?e.denomination:id)} <button data-remove="${id}" style="background:none;border:none;cursor:pointer;color:inherit">&times;</button></span>`; }).join('') + '</div>';
        sel.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { wizard.data.entrepriseIds = wizard.data.entrepriseIds.filter(x=>x!==b.getAttribute('data-remove')); drawSel(); drawRows(); }));
      };
      const toggleEnt = async (id, on) => {
        const e = list.find(x=>x.id===id);
        if (on) {
          if (selected.includes(id)) { /* toujours retiré */ }
          // doublon dans la mission
          if (selected.includes(id)) return;
          // entreprise déjà en mission (actif)
          const con = await detectEntMissionActive(id, wizard.data);
          if (con) {
            const action = await UI.confirmOk(`🔴 <strong>Entreprise déjà en mission</strong><br/>Entreprise : ${Utils.esc(e.denomination)}<br/>Mission actuelle : <strong>${Utils.esc(con.reference)}</strong><br/>Équipe : ${Utils.esc(con.equipeNom || '—')}<br/>Date : ${Utils.fmtDate(con.dateDebut)}<br/><br/>La nouvelle mission ne peut pas inclure cette entreprise tant qu'elle est en mission.`, 'Entreprise déjà en mission', 'OK');
            cb_uncheck(id); return;
          }
          selected.push(id); wizard.data.entrepriseIds = selected;
        } else { wizard.data.entrepriseIds = wizard.data.entrepriseIds.filter(x=>x!==id); }
        drawSel();
      };
      function cb_uncheck(id){ const c = body.querySelector(`[data-ent="${id}"]`); if (c) c.checked = false; }
      req.addEventListener('input', Utils.debounce(() => { filtered = list.filter((e)=>Utils.normKey(e.denomination).includes(Utils.normKey(req.value))); drawRows(); }, 200));
      drawRows(); drawSel();
    }
    async function renderPlanification(body) {
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form">
          <h3 style="margin-top:0">Étape 4 — Planification</h3>
          <div class="form-grid">
            ${UI.field('Date de début *', UI.input('dateDebut', wizard.data.dateDebut, '', 'date'))}
            ${UI.field('Date de fin *', UI.input('dateFin', wizard.data.dateFin, '', 'date'))}
            ${UI.field('Durée', UI.input('duree', wizard.data.duree, 'ex : 30 jours'))}
            ${UI.field('Objet de la mission *', UI.textarea('objet', wizard.data.objet, "Décrivez l'objet de la mission"), { full: true })}
            ${UI.field('Observations', UI.textarea('observations', wizard.data.observations, ''), { full: true })}
          </div>
        </div>`;
      // cohérence dates
      const d1 = body.querySelector('[data-name="dateDebut"]'), d2 = body.querySelector('[data-name="dateFin"]');
      const chk = () => { if (d1.value && d2.value && d2.value < d1.value) { d2.parentElement.querySelector('.err').textContent = '❌ La date de fin doit être postérieure ou égale à la date de début.'; d2.classList.add('invalid'); } else { d2.parentElement.querySelector('.err').textContent=''; d2.classList.remove('invalid'); } };
      d1.addEventListener('change', chk); d2.addEventListener('change', chk);
    }
    async function renderControle(body) {
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form"><h3 style="margin-top:0">Étape 5 — Contrôle</h3>
        <div id="mw-ctrl"></div>
        <div class="btnrow" style="margin-top:14px"><button class="btn" id="mw-verify">Vérifier la mission</button></div>
        </div>`;
      body.querySelector('#mw-verify').addEventListener('click', async () => {
        buildMissionObj();
        const res = await MISSIONS.validateMission(wizard.data);
        renderValResult(body.querySelector('#mw-ctrl'), res);
      });
    }
    async function renderOrdre(body) {
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form"><h3 style="margin-top:0">Étape 6 — Ordre de mission</h3>
        <div id="mw-ordre"></div>
        <div class="btnrow" style="margin-top:14px"><button class="btn" id="mw-gen">Générer l'ordre</button><button class="btn sec" id="mw-edit">Éditer</button></div>
        </div>`;
      body.querySelector('#mw-gen').addEventListener('click', async () => {
        buildMissionObj();
        // sauvegarder la mission (brouillon) si nouvelle, pour disposer d'un identifiant
        if (!wizard.data.id) {
          wizard.data.statut = 'BROUILLON';
          const saved = await MISSIONS.createMission(wizard.data);
          wizard.data.id = saved.id; wizard.data.reference = saved.reference;
        }
        const missionSaved = await MISSIONS.getMission(wizard.data.id);
        const o = await ORDRES.generateForMission(missionSaved);
        wizard.ordre = o;
        wizard.data.ordreId = o.id;
        body.querySelector('#mw-ordre').innerHTML = `<div class="val-panel green">🟢 Ordre <strong>${Utils.esc(o.reference)}</strong> généré.</div>`;
        body.querySelector('#mw-edit').disabled = false;
        await uploadOrdreIntoWizard();
      });
      body.querySelector('#mw-edit').addEventListener('click', () => { Router.navigate('ordres'); });
      await uploadOrdreIntoWizard();
    }
    async function uploadOrdreIntoWizard() {
      if (!wizard.ordre) return;
      const box = m.body.querySelector('#mw-ordre');
      if (box) box.innerHTML = `<div class="val-panel green">🟢 Ordre <strong>${Utils.esc(wizard.ordre.reference)}</strong> généré — modifiable via le module Ordres.</div>`;
    }
    async function renderValidation(body) {
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form"><h3 style="margin-top:0">Étape 7 — Validation</h3>
        <div id="mw-val"></div><div class="btnrow" style="margin-top:14px"><button class="btn vert" id="mw-validate">Valider la mission</button></div></div>`;
      buildMissionObj();
      const res = await MISSIONS.validateMission(wizard.data);
      renderValResult(body.querySelector('#mw-val'), res);
      body.querySelector('#mw-validate').addEventListener('click', async () => {
        buildMissionObj();
        // sauvegarde préalable si nouvelle
        let mid = wizard.data.id;
        if (!mid) { const m = await MISSIONS.createMission(wizard.data); mid = m.id; wizard.data.id = mid; }
        const va = await MISSIONS.validerMission(mid);
        if (!va.ok) { renderValResult(body.querySelector('#mw-val'), va.result); Utils.toast('Validation impossible : conflits bloquants.', 'err'); return; }
        await generateOrdre(mid);
        Utils.toast('Mission validée.', 'ok'); await go(8-1);
      });
    }
    async function renderImpression(body) {
      body.innerHTML = `
        <div id="mw-etat" class="etat-bar"></div>
        <div id="mw-form"><h3 style="margin-top:0">Étape 8 — Impression</h3>
        <div id="mw-print"></div>
        <div class="btnrow" style="margin-top:14px"><button class="btn" id="mw-print-btn">Imprimer l'ordre</button></div></div>`;
      if (wizard.ordre) body.querySelector('#mw-print').innerHTML = `<div class="val-panel green">L'ordre <strong>${Utils.esc(wizard.ordre.reference)}</strong> est prêt à être imprimé.</div>`;
      else body.querySelector('#mw-print').innerHTML = `<div class="val-panel orange">Aucun ordre généré. Revenez à l'étape 6.</div>`;
      body.querySelector('#mw-print-btn').addEventListener('click', async () => {
        buildMissionObj();
        const res = await MISSIONS.validateMission(wizard.data);
        if (!res.canPrint) { Utils.toast('Impression interdite : erreurs bloquantes.', 'err'); renderValResult(body.querySelector('#mw-val10')||null, res); return; }
        Router.navigate('ordres');
        setTimeout(() => Utils.toast('Impression lancée dans le module Ordres.', 'ok'), 100);
      });
    }
    async function generateOrdre(missionId) {
      const mm = await MISSIONS.getMission(missionId);
      const o = await ORDRES.generateForMission(mm);
      wizard.ordre = o;
    }
    function buildMissionObj() {
      // lire champs courants
      const form = m.body.querySelector('#mw-form');
      if (form) Object.assign(wizard.data, UI.collect(form));
      // résoudre le nom de structure
      const sid = wizard.data.structureId;
      if (sid) { PARAMETRES.getStructures().then((s) => { const f = s.find((x) => x.id === sid); if (f) wizard.data.structure = f.nom; }); }
    }
    function renderValResult(container, res) {
      if (!container) return;
      const icon = res.status === 'VALID' ? '🟢' : (res.status === 'WARNINGS' ? '🟠' : '🔴');
      const title = res.status === 'VALID' ? 'MISSION VALIDE' : (res.status === 'WARNINGS' ? 'AVERTISSEMENTS' : 'BLOQUÉE');
      const cls = res.status === 'VALID' ? 'green' : (res.status === 'WARNINGS' ? 'orange' : 'red');
      let html = `<div class="val-panel ${cls}"><div class="val-title">${icon} ${title}</div><ul class="vlist">`;
      res.errors.forEach((e) => { html += `<li><span class="v-err">🔴</span><div><strong>${Utils.esc(e.titre)}</strong><div class="muted">${Utils.esc(e.message)}</div></div></li>`; });
      res.warnings.forEach((w) => { html += `<li><span class="v-warn">🟠</span><div><strong>${Utils.esc(w.titre)}</strong><div class="muted">${Utils.esc(w.message)}</div></div></li>`; });
      if (!res.errors.length && !res.warnings.length) html += `<li><span class="v-ok">✔</span> Aucun problème détecté.</li>`;
      html += '</ul>';
      html += `<div class="btnrow" style="margin-top:8px">${res.errors.length ? `<button class="btn rouge" data-goto="3">Changer l'entreprise</button>` : ''}${res.warnings.length && !res.errors.length ? `<button class="btn jaune" data-confirm-warnings>Confirmer les avertissements</button>` : ''}</div></div>`;
      container.innerHTML = html;
      const goBtn = container.querySelector('[data-goto]');
      if (goBtn) goBtn.addEventListener('click', () => go(parseInt(goBtn.getAttribute('data-goto'),10)));
    }
    async function detectEntMissionActive(entId, data) {
      const missions = await DB.getAll('missions');
      return missions.find((m) => (m.entrepriseIds||[]).includes(entId) && ['EN_MISSION','PROGRAMMEE'].includes(m.statut) && !['TERMINEE','ARCHIVEE','BROUILLON'].includes(m.statut)) || null;
    }
  }

  /* ---------- Liste des missions ---------- */
  async function draw() {
    const list = await MISSIONS.getMissionsFiltrees(state.q, { statut: state.statut, equipeId: state.equipeId, province: state.province });
    const equipes = await EQUIPES.getEquipes();
    const provs = await PROVINCES_PROVIDER();
    container.innerHTML = `
      <h2 class="section-title">Missions</h2>
      <div class="card">
        <div class="toolbar">
          <button class="btn" id="bt-new">+ Nouvelle mission</button>
          <div class="searchbox" style="flex:1;min-width:170px"><span class="si">${UI.icon('search',18)}</span><input id="ms-q" placeholder="Rechercher..."/></div>
          <select id="ms-statut"><option value="">Statut</option>${MISSIONS.STATUTS.map(s=>`<option ${state.statut===s?'selected':''}>${s}</option>`).join('')}</select>
          <select id="ms-equipe"><option value="">Équipe</option>${equipes.map(e=>`<option value="${e.id}" ${state.equipeId===e.id?'selected':''}>${Utils.esc(e.nom)}</option>`).join('')}</select>
          <select id="ms-prov"><option value="">Province</option>${provs.map(p=>`<option value="${Utils.esc(p)}" ${state.province===p?'selected':''}>${Utils.esc(p)}</option>`).join('')}</select>
          <button class="btn sec" id="ms-reset">Réinitialiser</button>
        </div>
        <div id="ms-list">${renderList(list, equipes)}</div>
      </div>`;
    container.querySelector('#bt-new').addEventListener('click', () => openWizardFor(null));
    const q = container.querySelector('#ms-q'); q.value = state.q;
    q.addEventListener('input', Utils.debounce(()=>{ state.q=q.value; draw(); },250));
    container.querySelector('#ms-statut').addEventListener('change',(e)=>{state.statut=e.target.value;draw();});
    container.querySelector('#ms-equipe').addEventListener('change',(e)=>{state.equipeId=e.target.value;draw();});
    container.querySelector('#ms-prov').addEventListener('change',(e)=>{state.province=e.target.value;draw();});
    container.querySelector('#ms-reset').addEventListener('click',()=>{state.q='';state.statut='';state.equipeId='';state.province='';draw();});
    container.querySelectorAll('[data-ms]').forEach((b)=>b.addEventListener('click',()=>MISSIONS.getMission(b.getAttribute('data-ms')).then((mm)=>{ wizard=newWizard(); openWizardFor(mm); })));
    container.querySelectorAll('[data-open]').forEach((b)=>b.addEventListener('click',()=>MISSIONS.getMission(b.getAttribute('data-open')).then((mm)=>{ wizard=newWizard(); openWizardFor(mm); })));
    container.querySelectorAll('[data-clore]').forEach((b)=>b.addEventListener('click',async()=>{ if(await UI.confirmOk('Clôturer cette mission ? Elle passera en TERMINEE et l\'historique sera mis à jour.','Clôturer','Clôturer',true)){ await MISSIONS.cloreMission(b.getAttribute('data-clore')); Utils.toast('Mission clôturée.','ok'); draw(); } }));
    container.querySelectorAll('[data-arch]').forEach((b)=>b.addEventListener('click',async()=>{ if(await UI.confirmOk('Archiver cette mission ? Elle restera consultable.','Archiver','Archiver',true)){ await MISSIONS.archiverMission(b.getAttribute('data-arch')); Utils.toast('Mission archivée.','ok'); draw(); } }));
    container.querySelectorAll('[data-valide]').forEach((b)=>b.addEventListener('click',async()=>{ const r=await MISSIONS.validerMission(b.getAttribute('data-valide')); if(r.ok) Utils.toast('Mission validée.','ok'); else Utils.toast('Validation bloquée : ' + r.result.errors.length + ' erreur(s).','err'); draw(); }));
  }
  function renderList(list, equipes) {
    if (!list.length) return UI.emptyMessage('🧭','Aucune mission.');
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Référence</th><th>Date</th><th>Équipe</th><th>Entreprises</th><th>Début</th><th>Fin</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      ${list.map((m)=>{ const eq=equipes.find(e=>e.id===m.equipeId); return `<tr><td><strong>${Utils.esc(m.reference)}</strong></td><td>${Utils.fmtDate(m.dateCreation)}</td><td>${Utils.esc(eq?eq.nom:'—')}</td><td>${(m.entrepriseIds||[]).length}</td><td>${Utils.fmtDate(m.dateDebut)}</td><td>${Utils.fmtDate(m.dateFin)}</td><td>${UI.badge(m.statut)}</td>
        <td><div class="pill-row"><button class="btn sm sec" data-open="${m.id}">Ouvrir</button>${m.statut==='BROUILLON'?'<button class="btn sm vert" data-valide="'+m.id+'">Valider</button>':''}${m.statut==='EN_MISSION'?'<button class="btn sm sec" data-clore="'+m.id+'">Clôturer</button>':''}${m.statut==='TERMINEE'?'<button class="btn sm sec" data-arch="'+m.id+'">Archiver</button>':''}</div></td></tr>`;}).join('')}
    </tbody></table></div>`;
  }
  await draw();
};
