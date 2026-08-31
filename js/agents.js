/* ==========================================================================
   IGT MISSIONS RDC — agents.js — Module Agents
   ========================================================================== */
'use strict';

const AGENTS = (() => {
  const S = 'agents';

  async function nextNum() {
    const all = await DB.getAll(S);
    let max = 0;
    all.forEach((r) => { const m = /AGT-(\d+)/.exec(r.id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function generateId() { return Utils.genId('AGT', await nextNum()); }

  const STATUTS = ['RÉGULIER', 'EN MISSION', 'EN CONGÉ', 'INDISPONIBLE', 'SUSPENDU', 'INACTIF', 'À VÉRIFIER', 'DOSSIER INCOMPLET'];

  async function createAgent(data) {
    const d = normalize(data);
    if (!d.nom) throw new Error('Le nom de l\'agent est obligatoire.');
    if (!d.matricule) throw new Error('Le matricule est obligatoire.');
    const id = d.id || await generateId();
    const now = Utils.nowStamp();
    const record = Object.assign({
      id, nom: d.nom, postnom: d.postnom || '', prenom: d.prenom || '', matricule: d.matricule,
      grade: d.grade || '', fonction: d.fonction || '', service: d.service || '', structure: d.structure || '',
      direction: d.direction || '', lieuAffectation: d.lieuAffectation || '',
      province: d.province || '', telephone: d.telephone || '', email: d.email || '',
      statut: d.statut || 'RÉGULIER', observations: d.observations || '', actif: d.actif !== false,
      creeLe: now, modifieLe: now, dernierOrdre: d.dernierOrdre || '',
      derniereMission: d.derniereMission || '', nbMissions: d.nbMissions || 0
    }, d);
    await DB.put(S, record);
    await AUDIT.log('CREATE', 'agents', 'Agent créé', 'admin', { id, nom: record.nom });
    return record;
  }

  async function updateAgent(id, data) {
    const e = await DB.get(S, id);
    if (!e) throw new Error('Agent introuvable.');
    const d = Object.assign({}, e, normalize(data), { id, modifieLe: Utils.nowStamp() });
    await DB.put(S, d);
    await AUDIT.log('UPDATE', 'agents', 'Agent modifié', 'admin', { id });
    return d;
  }

  /* Vérification doublon de matricule */
  async function matriculeExists(matricule, excludeId) {
    const nk = Utils.normKey(matricule);
    if (!nk) return null;
    const all = await getAgents();
    return all.find((a) => a.id !== excludeId && Utils.normKey(a.matricule) === nk) || null;
  }

  async function getAgent(id) { return (await DB.get(S, id)) || null; }
  async function getAgents() { return (await DB.getAll(S)).sort((a, b) => String(a.nom).localeCompare(String(b.nom))); }

  /* Pas de suppression définitive -> désactiver */
  async function desactiver(id) {
    const e = await getAgent(id); if (!e) return;
    e.actif = false; e.statut = 'INACTIF'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e);
    await AUDIT.log('UPDATE', 'agents', 'Agent désactivé', 'admin', { id });
    return e;
  }
  async function reactiver(id) {
    const e = await getAgent(id); if (!e) return;
    e.actif = true; e.statut = 'ACTIF'; e.modifieLe = Utils.nowStamp();
    await DB.put(S, e);
    await AUDIT.log('UPDATE', 'agents', 'Agent réactivé', 'admin', { id });
    return e;
  }

  function normalize(data) {
    const d = Object.assign({}, data || {});
    if (d.matricule) d.matricule = Utils.normKey(d.matricule);
    return d;
  }

  async function searchAgents(query, opts) {
    opts = opts || {};
    let all = await getAgents();
    if (opts.onlyActive !== false) all = all.filter((a) => a.actif !== false);
    const q = Utils.norm(query || '');
    if (q) {
      const nq = Utils.normKey(q);
      all = all.filter((a) => Utils.normKey([a.nom, a.postnom, a.prenom, a.matricule, a.grade, a.fonction].join('|')).includes(nq));
    }
    if (opts.statut) all = all.filter((a) => String(a.statut) === opts.statut);
    if (opts.province) all = all.filter((a) => String(a.province) === opts.province);
    if (opts.structure) all = all.filter((a) => String(a.structure) === opts.structure);
    return all;
  }

  /* ---------- Contrôle de disponibilité (chevauchement) ---------- */
  async function agentDisponible(agentId, dateDebut, dateFin, excludeMissionId) {
    const missions = await DB.getAll('missions');
    const rels = await DB.getAll('missionAgents');
    const actives = missions.filter((m) => {
      if (excludeMissionId && m.id === excludeMissionId) return false;
      if (m.statut === 'ARCHIVÉE') return false;
      return true;
    });
    const conflicts = [];
    for (const rel of rels) {
      if (rel.agentId !== agentId) continue;
      const m = actives.find((x) => x.id === rel.missionId);
      if (!m) continue;
      if (Utils.inRange(m.dateDebut, m.dateFin, dateDebut, dateFin)) {
        conflicts.push(m);
      }
    }
    return { disponible: conflicts.length === 0, conflicts };
  }

  async function getHistorique(agentId) {
    const missions = await DB.getAll('missions');
    const rels = await DB.getAll('missionAgents');
    const res = [];
    for (const rel of rels) {
      if (rel.agentId !== agentId) continue;
      const m = missions.find((x) => x.id === rel.missionId);
      if (m) res.push(Object.assign({}, m));
    }
    res.sort((a, b) => String(b.dateDebut).localeCompare(String(a.dateDebut)));
    return res;
  }

  /* Ajouter via collage / fichier */
  async function importList(lines) {
    const results = { total: 0, created: 0, doublons: 0, invalides: 0, errors: [] };
    const seen = [];
    for (const raw of lines) {
      const line = String(raw == null ? '' : raw).trim();
      if (!line) continue;
      results.total++;
      let cols = line.split(/[|;,\t]/).map((c) => c.trim());
      const a = { nom: cols[0] || '', postnom: cols[1] || '', prenom: cols[2] || '', matricule: cols[3] || '', grade: cols[4] || '', fonction: cols[5] || '' };
      if (!a.nom) { results.invalides++; continue; }
      if (seen.some((s) => Utils.normKey(s) === Utils.normKey(a.nom + a.prenom))) { results.doublons++; continue; }
      const all = await getAgents();
      const dup = all.find((x) => Utils.normKey(x.nom + x.prenom) === Utils.normKey(a.nom + a.prenom));
      if (dup) { results.doublons++; continue; }
      seen.push(a.nom + a.prenom);
      await createAgent(a);
      results.created++;
    }
    return results;
  }

  /* ---------- Statuts professionnels ---------- */
  const STATUT_META = {
    'RÉGULIER': { badge: 'bd-vert', dot: '🟢' },
    'EN MISSION': { badge: 'bd-bleu', dot: '🔵' },
    'EN CONGÉ': { badge: 'bd-jaune', dot: '🟡' },
    'INDISPONIBLE': { badge: 'bd-orange', dot: '🟠' },
    'SUSPENDU': { badge: 'bd-rouge', dot: '🔴' },
    'INACTIF': { badge: 'bd-noir', dot: '⚫' },
    'À VÉRIFIER': { badge: 'bd-violet', dot: '🟣' },
    'DOSSIER INCOMPLET': { badge: 'bd-gris', dot: '⚪' }
  };
  function statutBadge(st) {
    const meta = STATUT_META[String(st || '')] || { badge: 'bd-gris', dot: '●' };
    return `<span class="badge ${meta.badge}"><span class="bdot"></span>${Utils.esc(String(st || '—'))}</span>`;
  }

  return {
    S, STATUTS, STATUT_META, statutBadge, matriculeExists,
    createAgent, updateAgent, getAgent, getAgents, desactiver, reactiver,
    searchAgents, agentDisponible, getHistorique, importList, normalize
  };
})();

/* ==========================================================================
   UI — Module Agents
   ========================================================================== */
AGENTS.render = async function render(container) {
  const state = { q: '', statut: '', province: '', direction: '' };

  async function staticLists() {
    const provinces = (await PARAMETRES.getProvinceNames()) || ['Kinshasa'];
    const grades = await PARAMETRES.getSetting('gradesList', ['Inspecteur Général du Travail', 'Inspecteur du Travail', 'Contrôleur du Travail', 'Agent administratif']);
    const fonctions = await PARAMETRES.getSetting('fonctionsList', ['Inspecteur Général du Travail', 'Inspecteur du Travail', 'Contrôleur du Travail', 'Agent administratif']);
    const directions = await PARAMETRES.getSetting('directionsList', ['Administration Centrale']);
    return { provinces, grades, fonctions, directions };
  }

  function avatarHtml(a) {
    const init = (a.nom || '?').charAt(0).toUpperCase() + (a.prenom ? a.prenom.charAt(0).toUpperCase() : (a.postnom || '').charAt(0).toUpperCase());
    const tone = a.statut === 'EN MISSION' ? 'linear-gradient(135deg,#2E6BD8,#123F8C)' : (a.statut === 'SUSPENDU' ? 'linear-gradient(135deg,#e0263d,#A60D1E)' : 'linear-gradient(135deg,#174EA6,#0B2E6D)');
    return `<div class="avatar" style="background:${tone}">${Utils.esc(init)}</div>`;
  }

  function fichier(a, lists) {
    const a2 = a || { statut: 'RÉGULIER' };
    const d = a2.direction || '', p = a2.province || '';
    let html = '<div class="form-grid">';
    html += `<div class="full field"><label><span class="req">*</span> Identité de l'agent</label></div>`;
    html += UI.field('Nom <span class="req">*</span>', UI.input('nom', a2.nom, 'Nom'));
    html += UI.field('Post-nom', UI.input('postnom', a2.postnom, 'Post-nom'));
    html += UI.field('Prénom', UI.input('prenom', a2.prenom, 'Prénom'));
    html += UI.field('Matricule <span class="req">*</span>', UI.input('matricule', a2.matricule, 'Matricule unique')) + `<div class="hint" id="mat-hint"></div>`;
    html += UI.field('Grade <span class="req">*</span>', UI.select('grade', [''].concat(lists.grades), a2.grade));
    html += UI.field('Fonction <span class="req">*</span>', `<div class="input-affix">${UI.select('fonction', [''].concat(lists.fonctions), a2.fonction)}</div><input type="text" data-name="fonctionCustom" placeholder="Autre fonction (saisie personnalisée)" value="${Utils.esc(a2.fonctionCustom || '')}" style="margin-top:6px"/>`);
    html += `<div class="full field" style="margin-top:6px"><label>Affectation administrative</label></div>`;
    html += UI.field('Province <span class="req">*</span>', UI.select('province', [''].concat(lists.provinces).concat(['Autre / Saisie manuelle']), p));
    html += UI.field("Lieu d'affectation", UI.input('lieuAffectation', a2.lieuAffectation, 'Ville / lieu d\'affectation'));
    html += UI.field('Direction / Antenne', UI.select('direction', [''].concat(lists.directions).concat(['+ Ajouter / saisir une direction personnalisée']), d)) + `<input type="text" data-name="directionCustom" placeholder="Direction personnalisée" value="${Utils.esc(a2.directionCustom || '')}" style="margin-top:6px"/>`;
    html += UI.field('Service', UI.input('service', a2.service, 'Service'));
    html += UI.field('Structure', UI.input('structure', a2.structure, 'Structure'));
    html += UI.field('Téléphone', UI.input('telephone', a2.telephone, 'Téléphone', 'tel'));
    html += UI.field('Email', UI.input('email', a2.email, 'Email', 'email'));
    html += UI.field('Statut', UI.select('statut', AGENTS.STATUTS, a2.statut));
    html += '</div>';
    html += UI.field('Observations', UI.textarea('observations', a2.observations, ''), { full: true });
    return html;
  }

  async function openForm(a) {
    const lists = await staticLists();
    const m = UI.modal({ title: (a ? 'Modifier l\'agent' : 'Nouvel agent'), wide: true, body: fichier(a || null, lists), footer: '<button class="btn sec" id="ag-cancel">Annuler</button><button class="btn" id="ag-save">Enregistrer l\'agent</button>' });
    m.el.querySelector('#ag-cancel').addEventListener('click', m.close);

    // Vérification matricule en direct
    const mat = m.body.querySelector('[data-name="matricule"]');
    if (mat) mat.addEventListener('blur', async () => {
      const hint = m.body.querySelector('#mat-hint');
      if (!mat.value) { hint.textContent = ''; hint.style.color = ''; return; }
      const dup = await AGENTS.matriculeExists(mat.value, a && a.id);
      if (dup) { hint.textContent = '⚠ Ce matricule est déjà attribué à ' + dup.nom + ' ' + (dup.postnom || ''); hint.style.color = 'var(--rouge)'; }
      else { hint.textContent = '✓ Matricule disponible'; hint.style.color = 'var(--vert)'; }
    });

    m.el.querySelector('#ag-save').addEventListener('click', async () => {
      const d = UI.collect(m.body);
      if (d.fonctionCustom && d.fonctionCustom.trim()) d.fonction = d.fonctionCustom.trim();
      if (d.directionCustom && d.directionCustom.trim()) d.direction = d.directionCustom.trim();
      if (!d.nom) { Utils.toast('Le nom est obligatoire.', 'err'); return; }
      if (!d.matricule) { Utils.toast('Le matricule est obligatoire.', 'err'); return; }
      const dup = await AGENTS.matriculeExists(d.matricule, a && a.id);
      if (dup && !a) { Utils.toast('Matricule déjà utilisé par ' + dup.nom + '. Vérification pour éviter les doublons.', 'err'); return; }
      try {
        const btn = m.el.querySelector('#ag-save'); btn.classList.add('loading'); btn.disabled = true;
        if (a) await AGENTS.updateAgent(a.id, d); else await AGENTS.createAgent(d);
        m.close(); Utils.toast('Agent enregistré.', 'ok'); draw();
      } catch (e) { Utils.toast(e.message, 'err'); const btn = m.el.querySelector('#ag-save'); btn.classList.remove('loading'); btn.disabled = false; }
    });
  }

  async function openFiche(id) {
    const a = await AGENTS.getAgent(id);
    if (!a) return;
    const hist = await AGENTS.getHistorique(id);
    const missions = await DB.getAll('missions');
    const ordres = a.dernierOrdre ? await ORDRES.get(a.dernierOrdre) : null;
    const enCours = hist.filter((h) => h.statut === 'EN_MISSION').length;
    const m = UI.modal({ title: 'Fiche agent', wide: true, body: '', footer: `<button class="btn sec" id="fc-close">Fermer</button><button class="btn sec" id="fc-edit">${UI.icon('edit', 16)} Modifier</button><button class="btn" id="fc-print">${UI.icon('print', 16)} Imprimer la fiche</button><button class="btn sec" id="fc-hist">${UI.icon('historique', 16)} Historique</button>` });
    m.body.innerHTML = `
      <div class="agent-card" style="margin-bottom:16px">
        <div class="agent-head">
          ${avatarHtml(a)}
          <div style="flex:1">
            <div style="font-size:19px;font-weight:750;color:var(--bleu)">${Utils.esc(a.nom)} ${Utils.esc(a.postnom || '')} ${Utils.esc(a.prenom || '')}</div>
            <div class="agent-meta">${Utils.esc(a.matricule)} · ${Utils.esc(a.grade || '')}</div>
          </div>
          <div>${AGENTS.statutBadge(a.statut)}</div>
        </div>
        <div class="kv">
          <dt>Fonction</dt><dd>${Utils.esc(a.fonction || '—')}</dd>
          <dt>Province</dt><dd>${Utils.esc(a.province || '—')}</dd>
          <dt>Lieu d'affectation</dt><dd>${Utils.esc(a.lieuAffectation || '—')}</dd>
          <dt>Direction / Antenne</dt><dd>${Utils.esc(a.direction || '—')}</dd>
          <dt>Téléphone</dt><dd>${Utils.esc(a.telephone || '—')}</dd>
          <dt>Email</dt><dd>${Utils.esc(a.email || '—')}</dd>
          <dt>Date d'enregistrement</dt><dd>${Utils.fmtDate(a.creeLe)}</dd>
          <dt>Dernière modification</dt><dd>${Utils.fmtDate(a.modifieLe)}</dd>
        </div>
      </div>
      <div class="grid-stats">
        ${mini('c-bleu', 'flag', a.nbMissions || hist.length, 'Missions')}
        ${mini('c-cyan', 'ordres', a.dernierOrdre ? 1 : 0, 'Ordres de mission')}
        ${mini('c-or', 'missions', enCours, 'En cours')}
        ${mini('c-vert', 'historique', a.derniereMission ? Utils.fmtDate(a.derniereMission) : '—', 'Dernière mission')}
      </div>
      <div id="fc-histbox" style="display:none">
        <h3>Historique des missions</h3>
        ${hist.length ? hist.map((h) => `<div class="alert-item"><span class="a-ic">${UI.icon('flag', 17)}</span><div style="flex:1"><div class="a-t">${Utils.esc(h.reference)}</div><div class="a-m">${Utils.fmtDate(h.dateDebut)} → ${Utils.fmtDate(h.dateFin)}</div><div class="a-d">${UI.badge(h.statut)}</div></div></div>`).join('') : UI.emptyMessage('🗂', 'Aucune mission.')}
      </div>`;
    m.el.querySelector('#fc-close').addEventListener('click', m.close);
    m.el.querySelector('#fc-edit').addEventListener('click', () => { m.close(); openForm(a); });
    m.el.querySelector('#fc-hist').addEventListener('click', () => { const b = m.body.querySelector('#fc-histbox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; });
    m.el.querySelector('#fc-print').addEventListener('click', () => printFiche(a));
  }
  function mini(cls, ic, val, lab) {
    return `<div class="stat ${cls}" style="animation:none;padding:14px"><div class="b"></div><div class="v" style="font-size:20px">${Utils.esc(String(val))}</div><div class="l" style="font-size:11px">${lab}</div></div>`;
  }
  function printFiche(a) {
    const win = window.open('', '_blank', 'width=780,height=1000');
    if (!win) { Utils.toast('Autorisez les fenêtres pop-up pour imprimer.', 'err'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche agent — ${Utils.esc(a.nom)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:7px 9px;text-align:left}h1{color:#0B2E6D;font-size:16pt;margin:0 0 4px}.sub{color:#444;font-size:11pt;margin-bottom:16px}.kv td:first-child{background:#EAF1FB;font-weight:bold;width:38%}h2{color:#0B2E6D;font-size:13pt;margin:16px 0 6px;border-bottom:2px solid #0B2E6D;padding-bottom:3px}</style></head><body>
      <h1>FICHE AGENT — INSPECTION GÉNÉRALE DU TRAVAIL RDC</h1><div class="sub">République Démocratique du Congo · Ministère de l'Emploi et Travail</div>
      <h2>Identité</h2><table class="kv"><tr><td>Nom complet</td><td>${Utils.esc(a.nom)} ${Utils.esc(a.postnom || '')} ${Utils.esc(a.prenom || '')}</td></tr>
      <tr><td>Matricule</td><td>${Utils.esc(a.matricule)}</td></tr><tr><td>Grade</td><td>${Utils.esc(a.grade || '—')}</td></tr><tr><td>Fonction</td><td>${Utils.esc(a.fonction || '—')}</td></tr></table>
      <h2>Affectation administrative</h2><table class="kv"><tr><td>Province</td><td>${Utils.esc(a.province || '—')}</td></tr><tr><td>Lieu d'affectation</td><td>${Utils.esc(a.lieuAffectation || '—')}</td></tr><tr><td>Direction / Antenne</td><td>${Utils.esc(a.direction || '—')}</td></tr><tr><td>Statut</td><td>${Utils.esc(a.statut || '—')}</td></tr></table>
      <h2>Activité</h2><table class="kv"><tr><td>Nombre de missions</td><td>${a.nbMissions || 0}</td></tr><tr><td>Dernière mission</td><td>${Utils.fmtDate(a.derniereMission)}</td></tr></table>
      <p style="margin-top:34px;text-align:right">Fait à Kinshasa, le ${Utils.fmtDate(Utils.todayISO())}<br/><br/><strong>Le Gestionnaire Administrateur</strong></p>
      </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  }

  function openCollage() {
    const m = UI.modal({ title: "Collage multiple d'agents", body: `<div class="field"><label>Collez votre liste ici...</label><textarea id="ag-paste" rows="9" placeholder="Nom | Post-nom | Prénom | Matricule | Grade | Fonction"></textarea></div><div id="ag-paste-result"></div>`, footer: '<button class="btn sec" id="ap-cancel">Annuler</button><button class="btn" id="ap-analyze">Analyser</button><button class="btn vert" id="ap-import" disabled>Importer</button>' });
    m.el.querySelector('#ap-cancel').addEventListener('click', m.close);
    let pending = [];
    m.el.querySelector('#ap-analyze').addEventListener('click', async () => {
      const lines = m.body.querySelector('#ag-paste').value.split(/\r?\n/).filter(l => l.trim());
      const res = { total: lines.length, created: 0, doublons: 0, sansMat: 0, errors: [] }; pending = []; const seen = [];
      for (const raw of lines) {
        const line = raw.trim(); if (!line) continue;
        const cols = line.split(/[|;,\t]/).map(c => c.trim());
        const aa = { nom: cols[0] || '', postnom: cols[1] || '', prenom: cols[2] || '', matricule: cols[3] || '', grade: cols[4] || '', fonction: cols[5] || '' };
        if (!aa.nom) { res.errors.push('Ligne sans nom : ' + line); continue; }
        if (!aa.matricule) { res.sansMat++; continue; }
        const key = Utils.normKey(aa.nom + aa.prenom);
        if (seen.includes(key)) { res.doublons++; continue; }
        const all = await AGENTS.getAgents();
        if (all.some(x => Utils.normKey(x.nom + x.prenom) === key || Utils.normKey(x.matricule) === Utils.normKey(aa.matricule))) { res.doublons++; continue; }
        seen.push(key); pending.push(aa); res.created++;
      }
      m.body.querySelector('#ag-paste-result').innerHTML = `<div class="val-panel ${res.doublons ? 'orange' : 'green'}"><strong>${res.created}</strong> à importer — <strong>${res.doublons}</strong> doublons — <strong>${res.sansMat}</strong> sans matricule${res.errors.length ? '<br/><span class="hint">' + res.errors.slice(0, 3).map(Utils.esc).join('<br/>') + '</span>' : ''}</div>`;
      const btn = m.el.querySelector('#ap-import'); btn.disabled = res.created === 0; btn.textContent = 'Importer les ' + res.created + ' agents';
    });
    m.el.querySelector('#ap-import').addEventListener('click', async () => { let n = 0; for (const c of pending) { try { await AGENTS.createAgent(c); n++; } catch (e) {} } Utils.toast(n + ' agent(s) importé(s).', 'ok'); m.close(); draw(); });
  }

  async function draw() {
    const provs = await PARAMETRES.getProvinceNames();
    const list = await AGENTS.searchAgents(state.q, { statut: state.statut, province: state.province });
    container.innerHTML = `
      <h2 class="section-title"><span class="st-ic">${UI.icon('user', 19)}</span>Agents</h2>
      <div class="card">
        <div class="toolbar">
          <button class="btn" id="bt-add">${UI.icon('plus', 16)} Nouvel agent</button>
          <button class="btn sec" id="bt-collage">${UI.icon('plus', 15)} Collage multiple</button>
          <div class="searchbox" style="flex:1;min-width:200px"><span class="si">${UI.icon('search', 18)}</span><input id="ag-search" placeholder="Rechercher (nom, matricule, grade, fonction...)" value="${Utils.esc(state.q)}" /></div>
          <select id="ag-statut"><option value="">Statut</option>${AGENTS.STATUTS.map(s => `<option ${state.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <select id="ag-prov"><option value="">Province</option>${provs.map(p => `<option value="${Utils.esc(p)}" ${state.province === p ? 'selected' : ''}>${Utils.esc(p)}</option>`).join('')}</select>
          <button class="btn sec" id="bt-reset">${UI.icon('refresh', 15)} Réinitialiser</button>
        </div>
        <div id="ag-list">${renderTable(list)}</div>
      </div>`;
    container.querySelector('#bt-add').addEventListener('click', () => openForm());
    container.querySelector('#bt-collage').addEventListener('click', openCollage);
    const s = container.querySelector('#ag-search');
    s.addEventListener('input', Utils.debounce(() => { state.q = s.value; draw(); }, 250));
    container.querySelector('#ag-statut').addEventListener('change', (e) => { state.statut = e.target.value; draw(); });
    container.querySelector('#ag-prov').addEventListener('change', (e) => { state.province = e.target.value; draw(); });
    container.querySelector('#bt-reset').addEventListener('click', () => { state.q = ''; state.statut = ''; state.province = ''; draw(); });
    container.querySelectorAll('[data-aview]').forEach((b) => b.addEventListener('click', () => openFiche(b.getAttribute('data-aview'))));
    container.querySelectorAll('[data-aedit]').forEach((b) => b.addEventListener('click', () => AGENTS.getAgent(b.getAttribute('data-aedit')).then(openForm)));
    container.querySelectorAll('[data-ahist]').forEach((b) => b.addEventListener('click', () => openFiche(b.getAttribute('data-ahist'))));
    container.querySelectorAll('[data-ades]').forEach((b) => b.addEventListener('click', async () => { if (await UI.confirmOk('Archiver / désactiver cet agent ? Il restera consultable.', 'Archiver', 'Archiver', true)) { await AGENTS.desactiver(b.getAttribute('data-ades')); Utils.toast('Agent archivé.', 'ok'); draw(); } }));
  }
  function renderTable(list) {
    if (!list.length) return UI.emptyMessage('👤', 'Aucun agent trouvé.');
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Matricule</th><th>Fonction</th><th>Province</th><th>Direction</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      ${list.map((a) => `<tr>
        <td><div class="cell-ic">${avatarHtml(a)}<div><div class="cell-primary">${Utils.esc(a.nom)} ${Utils.esc(a.postnom || '')}</div><div class="cell-sub">${Utils.esc(a.grade || '')}</div></div></div></td>
        <td>${Utils.esc(a.matricule || '—')}</td><td>${Utils.esc(a.fonction || '—')}</td><td>${Utils.esc(a.province || '—')}</td><td>${Utils.esc(a.direction || '—')}</td><td>${AGENTS.statutBadge(a.statut)}</td>
        <td><div class="pill-row"><button class="btn sm sec" data-aview="${a.id}" title="Voir">Voir</button><button class="btn sm sec" data-aedit="${a.id}" title="Modifier">Modifier</button>${a.actif !== false ? '<button class="btn sm sec" data-ades="' + a.id + '" title="Archiver">Archiver</button>' : ''}</div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }
  await draw();
};
