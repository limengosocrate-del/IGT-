/* ==========================================================================
   IGT MISSIONS RDC — ordres.js — Ordres de mission & modèle dynamique A4
   Numérotation automatique OM-IGT-AAAA-XXXXXX + variables {{ }}.
   ========================================================================== */
'use strict';

const ORDRES = (() => {
  const S = 'ordres';
  const YEAR = new Date().getFullYear();

  async function nextNumSeq() {
    const all = await DB.getAll(S);
    let max = 0;
    all.forEach((r) => { const m = /OM-IGT-\d+-(\d+)/.exec(r.reference || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return max + 1;
  }
  async function generateReference() {
    const n = await nextNumSeq();
    return `OM-IGT-${YEAR}-${String(n).padStart(6, '0')}`;
  }

  /* ---------- Defaults ---------- */
  function defaultSignataire() {
    return { nom: 'Marie MUGALU MUTEBA', fonction: 'Chef de corps', lieu: 'Kinshasa', adresse: 'Rez-de-chaussée, Immeuble Kimpoko, Boulevard du 30 Juin, Kinshasa/Gombe' };
  }
  function defaultObjets() {
    return [
      'Vérifier le respect des dispositions légales et réglementaires relatives aux contrats de travail, à la durée du travail, aux salaires (SMIG) et à la santé et sécurité au travail ;',
      'Détecter et sanctionner les cas de travail dissimulé et l\u2019emploi illégal ;',
      'S\u2019assurer de la bonne application des dispositions légales et réglementaires relatives à la protection de la main-d\u2019œuvre, du comité SHE ainsi que de la délégation syndicale ;',
      'S\u2019assurer de la régularité des Services Privés des Placements œuvrant dans les entreprises et établissements de toutes natures ;',
      'Constater les infractions liées à la non-conformité en matière du travail par les procès-verbaux et infliger les amendes transactionnelles y afférentes ;',
      'Faire rapport.'
    ];
  }

  /* ---------- Modèle institutionnel A4 ---------- */
  function institutionalHead() {
    return ''
      + '<div class="doc-head">'
      + '<img class="dh-logo" src="./assets/logo/logo.png" alt="Inspection Générale du Travail RDC" />'
      + '<div class="dh-rep">RÉPUBLIQUE DÉMOCRATIQUE DU CONGO</div>'
      + '<div class="dh-min">Ministère de l\u2019Emploi et Travail</div>'
      + '<div class="dh-igt">Inspection Générale du Travail</div>'
      + '</div>';
  }
  function defaultTemplate() {
    return institutionalHead()
      + '<div class="doc-title">ORDRE DE MISSION COLLECTIF N° {{NUMERO}}</div>'
      + '<p>Les personnes ci-dessous dont les fonctions reprises sont désignées pour effectuer une mission spéciale en vue de faire respecter la législation en vigueur en matière du travail dans les organismes, les entreprises et établissements suivants : <strong>{{ENTREPRISES}}</strong> dans la ville Province de {{PROVINCE}}.</p>'
      + '<p>Il s\u2019agit de :</p>'
      + '{{AGENTS_TABLE}}'
      + '<div class="objet-block"><strong>OBJET DE LA MISSION</strong>{{OBJET_LIST}}</div>'
      + '<p class="meta"><strong>DUREE DE LA MISSION</strong> : {{DUREE}}</p>'
      + '<p class="meta"><strong>DATE DE DEBIT</strong> : {{DATE_DEBUT}}</p>'
      + '<p class="meta"><strong>DATE DE CLOTURE</strong> : {{DATE_FIN}}</p>'
      + '<p class="meta"><strong>IMPUTATION</strong> : {{IMPUTATION}}</p>'
      + '<p>Les Autorités Civiles, Militaires et Policières sont priées d\u2019apporter, le cas échéant, leur assistance aux intéressés pour le meilleur accomplissement de leur mission.</p>'
      + '<p style="text-align:right">Fait à {{LIEU}}, le {{DATE}}</p>'
      + '<div class="sign" style="text-align:center;margin-top:34px"><p class="s-nom">{{SIGNATAIRE}}</p><p>{{FONCTION}}</p></div>'
      + '<div class="rdc-bar"></div>'
      + '<div class="adress">{{ADRESSE}}</div>';
  }

  /* ---------- CRUD ---------- */
  async function createOrdre(data) {
    const id = data.id || 'ordre_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = Utils.nowStamp();
    const order = Object.assign({
      id, reference: data.reference || await generateReference(), date: data.date || Utils.todayISO(),
      missionId: data.missionId || '', missionReference: data.missionReference || '',
      equipeId: data.equipeId || '', equipeNom: data.equipeNom || '',
      entrepriseIds: data.entrepriseIds || [], agentIds: data.agentIds || [],
      contenu: data.contenu || defaultTemplate(), statut: data.statut || 'BROUILLON',
      imprime: false, dateImpression: '', heureImpression: '', archive: false, creeLe: now, modifieLe: now
    }, data);
    await DB.put(S, order);
    await AUDIT.log('CREATE', 'ordres', 'Ordre créé', 'admin', { id, reference: order.reference });
    return order;
  }
  async function updateOrdre(id, data) {
    const e = await DB.get(S, id); if (!e) throw new Error('Ordre introuvable.');
    const d = Object.assign({}, e, data, { id, modifieLe: Utils.nowStamp() });
    await DB.put(S, d);
    await AUDIT.log('UPDATE', 'ordres', 'Ordre modifié', 'admin', { id, reference: d.reference });
    return d;
  }
  async function get(id) { return (await DB.get(S, id)) || null; }
  async function getAll() { return (await DB.getAll(S)).sort((a, b) => String(b.reference).localeCompare(String(a.reference))); }
  async function findByReference(ref) { const all = await getAll(); return all.find(o => String(o.reference) === String(ref)) || null; }
  async function findByMission(missionId) { const all = await getAll(); return all.find(o => o.missionId === missionId) || null; }

  async function getEntreprises(id) { const o = await get(id); if (!o || !o.entrepriseIds) return []; const l = await Promise.all(o.entrepriseIds.map(e => ENTREPRISES.getEntreprise(e))); return l.filter(Boolean); }
  async function getAgents(id) { const o = await get(id); if (!o || !o.agentIds) return []; const l = await Promise.all(o.agentIds.map(a => AGENTS.getAgent(a))); return l.filter(Boolean); }

  /* ---------- Moteur de variables ---------- */
  async function substituteVariables(ordre, mission, extra) {
    extra = extra || {};
    if (!mission && ordre.missionId) { mission = await MISSIONS.getMission(ordre.missionId).catch(() => null); }
    const entreprises = await getEntreprises(ordre.id);
    const agents = await getAgents(ordre.id);
    const equipe = ordre.equipeId ? await EQUIPES.getEquipe(ordre.equipeId) : null;
    const sign = extra.sign || defaultSignataire();
    const signCfg = await PARAMETRES.getSetting('signataireNom', sign.nom).then((n) => Object.assign({}, sign, {
      nom: n, fonction: '', lieu: ''
    })).catch(() => sign);
    const sNom = await PARAMETRES.getSetting('signataireNom', sign.nom).catch(() => sign.nom);
    const sFonction = await PARAMETRES.getSetting('signataireFonction', sign.fonction).catch(() => sign.fonction);
    const sLieu = await PARAMETRES.getSetting('signataireLieu', sign.lieu).catch(() => sign.lieu);
    const sAdresse = await PARAMETRES.getSetting('signataireAdresse', sign.adresse).catch(() => sign.adresse);
    const s = { nom: sNom, fonction: sFonction, lieu: sLieu, adresse: sAdresse };

    const entList = entreprises.map(e => e.denomination).join(', ');
    const chef = mission ? (mission.chefMission || '') : (equipe ? (equipe.chefMission || '') : '');
    const agentRows = agents.map((a, i) => `<tr><td style="width:40px;text-align:center">${String(i + 1).padStart(2, '0')}</td><td>${Utils.esc(a.nom + ' ' + (a.postnom || '') + (a.prenom ? ' ' + a.prenom : ''))}</td><td>${Utils.esc((a.id === mission.chefMissionId || (chef && (a.nom + ' ' + (a.postnom || '')).toUpperCase().includes(String(chef).toUpperCase().split(' ')[0] || '____'))) ? (a.fonction || a.grade || '') + ' / Chef de Mission' : (a.fonction || a.grade || ''))}</td></tr>`).join('');
    const agentTable = '<table><thead><tr><th style="width:40px;text-align:center">N°</th><th>Nom et post-nom / Prénom</th><th>Fonction</th></tr></thead><tbody>' + agentRows + '</tbody></table>';

    // objet -> liste numérotée
    const rawObjet = (mission && mission.objet) || ordre.missionObjet || defaultObjets().join('\n');
    const lignes = String(rawObjet).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const objetList = '<ol>' + lignes.map((l) => `<li>${Utils.esc(l)}</li>`).join('') + '</ol>';

    const vars = {
      '{{NUMERO}}': ordre.reference,
      '{{DATE}}': Utils.fmtDate(ordre.date || Utils.todayISO()),
      '{{STRUCTURE}}': mission ? (mission.structure || '') : (ordre.structure || ''),
      '{{PROVINCE}}': mission ? (mission.province || 'Kinshasa') : (ordre.province || 'Kinshasa'),
      '{{ENTREPRISES}}': entList || '',
      '{{CHEF_MISSION}}': chef,
      '{{AGENTS}}': agents.map(a => a.nom + ' ' + (a.prenom || '')).join(', '),
      '{{AGENTS_TABLE}}': agentTable,
      '{{OBJET}}': String(rawObjet),
      '{{OBJET_LIST}}': objetList || '<p>—</p>',
      '{{OBJET_HTML}}': objetList || '<p>—</p>',
      '{{DATE_DEBUT}}': Utils.fmtDate(mission ? mission.dateDebut : ''),
      '{{DATE_FIN}}': Utils.fmtDate(mission ? mission.dateFin : ''),
      '{{DUREE}}': mission ? (mission.duree || '') : (ordre.duree || ''),
      '{{IMPUTATION}}': mission ? (mission.imputation || "A Charge de l'Inspection Générale du Travail") : "A Charge de l'Inspection Générale du Travail",
      '{{SIGNATAIRE}}': s.nom, '{{FONCTION}}': s.fonction, '{{LIEU}}': s.lieu, '{{ADRESSE}}': s.adresse
    };
    let html = ordre.contenu || defaultTemplate();
    Object.keys(vars).forEach((k) => { html = html.split(k).join(vars[k]); });
    return { html, entreprises, agents, equipe, vars, sign: s, chef };
  }

  /* ---------- Générer un ordre depuis une mission ---------- */
  async function generateForMission(mission) {
    const reference = await generateReference();
    const ent = await MISSIONS.getMissionEntreprises(mission);
    const agts = await MISSIONS.getMissionAgents(mission);
    const eq = await MISSIONS.getEquipeDetails(mission);
    const objetContent = mission.objet || defaultObjets().join('\n');
    let duree = mission.duree;
    if (!duree && mission.dateDebut && mission.dateFin) { const d = Math.round((new Date(mission.dateFin) - new Date(mission.dateDebut)) / 86400000) + 1; duree = d > 0 ? (d + ' jours') : ''; }
    const missionWithDuree = Object.assign({}, mission, { duree, objet: objetContent });

    const ordre = await createOrdre({
      missionId: mission.id, missionReference: mission.reference,
      equipeId: mission.equipeId, equipeNom: eq ? eq.nom : '',
      entrepriseIds: mission.entrepriseIds || [], agentIds: mission.agentIds || [],
      contenu: defaultTemplate(), statut: 'GÉNÉRÉ'
    });
    const sub = await substituteVariables(ordre, missionWithDuree);
    ordre.contenu = sub.html; ordre.missionObjet = objetContent;
    await updateOrdre(ordre.id, { contenu: sub.html, missionObjet: objetContent });
    await MISSIONS.setOrdre(mission.id, ordre.id);
    // journal
    await AUDIT.log('VALIDATE', 'ordres', 'Ordre généré', 'admin', { id: ordre.id, reference: ordre.reference });
    return ordre;
  }

  async function archiver(id) {
    const o = await get(id); if (!o) return;
    o.archive = true; o.statut = 'ARCHIVÉ'; o.modifieLe = Utils.nowStamp();
    await DB.put(S, o);
    await AUDIT.log('ARCHIVE', 'ordres', 'Ordre archivé', 'admin', { id, reference: o.reference });
    return o;
  }

  return {
    S, generateReference, generateForMission, createOrdre, updateOrdre, get, getAll,
    findByReference, findByMission, getEntreprises, getAgents, substituteVariables,
    defaultTemplate, defaultObjets, defaultSignataire, archiver, institutionalHead
  };
})();

/* ==========================================================================
   UI — Module Ordres (éditeur type Word + aperçu A4 + impression + PDF)
   ========================================================================== */
ORDRES.render = async function render(container) {
  let currentOrdre = null;

  async function resolveConflict(ordre) {
    try {
      if (!ordre.missionId) return { canPrint: true };
      const res = await MISSIONS.getMission(ordre.missionId);
      if (!res) return { canPrint: true };
      const va = await MISSIONS.validateMission(res);
      if (!va.canPrint) {
        const errs = va.errors.map((e) => `<li><span class="v-err">${UI.icon('x', 16)}</span><div><strong>${Utils.esc(e.titre)}</strong><div class="muted">${Utils.esc(e.message)}</div></div></li>`).join('');
        Utils.toast('Impression interdite : conflits bloquants détectés.', 'err');
        return { canPrint: false, html: `<div class="val-panel red"><div class="val-title">🔴 IMPRESSION INTERDITE</div><ul class="vlist">${errs}</ul></div>` };
      }
      return { canPrint: true };
    } catch (e) { return { canPrint: true }; }
  }

  async function openA4Preview(ordre) {
    currentOrdre = ordre;
    const sub = await ORDRES.substituteVariables(ordre);
    // QC dans l'aperçu
    let qrHtml = '';
    if (document.getElementById('qr-preview-' + ordre.id)) {
      /* already drawn */
    }
    const m = UI.modal({ title: 'APERÇU DE L\u2019ORDRE DE MISSION', full: true, closeOnBackdrop: false });
    m.body.innerHTML = `
      <div class="preview-toolbar no-print">
        <span class="badge bd-bleu">${UI.icon('fullscreen',15)} A4 — 210 × 297 mm</span>
        <span class="muted">Feuille virtuelle — ce que vous voyez est exactement ce qui sera imprimé.</span>
        <div class="spacer"></div>
        <button class="btn sm sec" id="pr-close">${UI.icon('x', 15)} Fermer</button>
        <button class="btn sm sec" id="pr-edit">${UI.icon('edit', 15)} Modifier</button>
        <button class="btn sm sec" id="pr-full">${UI.icon('fullscreen', 15)} Plein écran</button>
        <button class="btn sm jaune" id="pr-pdf">${UI.icon('download', 15)} Télécharger PDF</button>
        <button class="btn sm" id="pr-print">${UI.icon('print', 15)} Imprimer</button>
      </div>
      <div class="a4-stage" id="pr-stage"><div class="a4-sheet" id="pr-sheet">${sub.html}</div></div>`;
    m.el.querySelector('#pr-close').addEventListener('click', m.close);
    m.el.querySelector('#pr-edit').addEventListener('click', () => { m.close(); openEditor(ordre.id); });
    m.el.querySelector('#pr-full').addEventListener('click', () => {
      const sheet = m.body.querySelector('#pr-sheet');
      if (!sheet) return;
      const w = window.open('', '_blank', 'width=900,height=1100');
      if (!w) return;
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>APERÇU — ' + Utils.esc(ordre.reference) + '</title><style>body{background:#eceff4;margin:20px}.inner{width:210mm;margin:0 auto;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.2);padding:18mm 20mm 16mm;font-family:"Times New Roman",Times,serif;font-size:12pt;color:#111}table{border-collapse:collapse;width:100%}table td,table th{border:1px solid #111;padding:5px 8px}.doc-head{text-align:center}.dh-rep{font-weight:bold;font-size:13pt}.dh-min{font-weight:bold}.dh-igt{font-style:italic;color:#B0000F}.dh-igt2{font-style:italic;color:#123F8C}.doc-title{text-align:center;text-decoration:underline;font-weight:bold;font-size:13.5pt;margin:16px 0 18px}.sign{margin-top:34px}.s-nom{text-decoration:underline;font-weight:bold}.adress{text-align:center;font-size:10pt;margin-top:8px}.rdc-bar{height:8px;border-radius:3px;margin-top:22px;background:linear-gradient(90deg,#0072C6 0 30%,#0B2E6D 30% 70%,#CE1126 70% 88%,#FCD116 88% 100%)}</style></head><body><div class="inner">' + sub.html + '</div></body></html>');
      w.document.close();
    });
    m.el.querySelector('#pr-print').addEventListener('click', async () => {
      const r = await resolveConflict(ordre);
      if (!r.canPrint) return;
      await doSave(ordre);
      printHTML(sub.html, { orientation: 'portrait' });
      await markPrinted(ordre);
    });
    m.el.querySelector('#pr-pdf').addEventListener('click', async () => {
      const r = await resolveConflict(ordre);
      if (!r.canPrint) return;
      printHTML(sub.html, { orientation: 'portrait', pdf: true });
      await markPrinted(ordre);
    });
    scrollToPreview(m.body);
    // dessiner QR
    drawQR(m.body.querySelector('#pr-sheet'), ordre.reference);
  }
  async function scrollToPreview(body) { try { body.scrollTop = 0; } catch (e) {} }
  function drawQR(sheet, ref) {
    try {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.right = '20px'; canvas.style.bottom = '120px';
      canvas.style.border = '1px solid #ddd'; canvas.style.padding = '3px'; canvas.style.background = '#fff';
      QRCode.toCanvas(canvas, ref, { scale: 4 });
      if (sheet) sheet.appendChild(canvas);
    } catch (e) {}
  }

  async function openEditor(ordreId) {
    let ordre = await ORDRES.get(ordreId);
    if (!ordre) return;
    const m = UI.modal({ title: 'Ordre de mission — ' + ordre.reference, full: true, body: '', closeOnBackdrop: false });
    m.body.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px" class="no-print">
        <span class="save-ind" id="ord-saveind">${ordre.imprime ? '✓ Enregistré' : 'Autosave actif'}</span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm sec" id="ord-edit">${UI.icon('edit', 15)} Modifier</button>
        <button class="btn sec sm" id="ord-prev">${UI.icon('eye', 15)} Aperçu A4</button>
        <button class="btn sm vert" id="ord-save">${UI.icon('save', 15)} Enregistrer le modèle</button>
      </div>
      <div class="editor-toolbar" id="ord-edtool">
        <button data-cmd="undo" title="Annuler">${UI.icon('arrow_left', 16)}</button><button data-cmd="redo" title="Rétablir">${UI.icon('refresh', 16)}</button>
        <span class="sep"></span>
        <button data-cmd="bold" title="Gras"><b>B</b></button><button data-cmd="italic" title="Italique"><i>I</i></button><button data-cmd="underline" title="Souligné"><u>U</u></button>
        <span class="sep"></span>
        <select data-cmd="fontSize"><option value="1">Petit</option><option value="3" selected>Normal</option><option value="5">Grand</option><option value="6">Très grand</option></select>
        <select data-cmd="fontName"><option value="Times New Roman">Times</option><option value="Arial">Arial</option><option value="Calibri">Calibri</option></select>
        <span class="sep"></span>
        <button data-cmd="justifyLeft" title="Gauche">⯇</button><button data-cmd="justifyCenter" title="Centré">▣</button><button data-cmd="justifyRight" title="Droite">⯈</button><button data-cmd="justifyFull" title="Justifié">▤</button>
        <span class="sep"></span>
        <button data-cmd="insertUnorderedList" title="Liste">•</button><button data-cmd="insertOrderedList" title="Liste numérotée">1.</button>
        <button data-cmd="insertTable" title="Tableau">⊞</button>
        <button data-cmd="removeFormat" title="Effacer format">✕</button>
      </div>
      <div class="contenteditable-area" id="ord-area" contenteditable="true">${ordre.contenu}</div>`;

    const area = m.body.querySelector('#ord-area');
    const tool = m.body.querySelector('#ord-edtool');
    const saveind = m.body.querySelector('#ord-saveind');
    let saveTimer = null;

    async function doSave() {
      const clean = Utils.sanitizeHTML(area.innerHTML);
      await ORDRES.updateOrdre(ordre.id, { contenu: clean });
      saveind.textContent = '✓ Enregistré';
      currentOrdre = await ORDRES.get(ordre.id);
    }
    function markDirty() { saveind.textContent = 'Enregistrement...'; clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 700); }
    area.addEventListener('input', markDirty);
    area.addEventListener('paste', (e) => {
      e.preventDefault();
      const html = (e.clipboardData || window.clipboardData).getData('text/html');
      const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      let clean;
      if (html) clean = Utils.sanitizeHTML(html);
      else { const t = document.createElement('div'); t.textContent = txt; clean = t.innerHTML; }
      document.execCommand('insertHTML', false, clean);
      markDirty();
    });
    tool.addEventListener('mousedown', (e) => { if (e.target.closest('button,select')) e.preventDefault(); });
    tool.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      const cmd = b.getAttribute('data-cmd');
      if (cmd === 'insertTable') document.execCommand('insertHTML', false, '<table><tbody><tr><td>Cellule</td><td>Cellule</td></tr><tr><td>Cellule</td><td>Cellule</td></tr></tbody></table>');
      else document.execCommand(cmd, false, cmd === 'fontSize' ? b.value : null);
      markDirty();
    });

    m.el.querySelector('#ord-save').addEventListener('click', doSave);
    m.el.querySelector('#ord-edit').addEventListener('click', doSave);
    m.el.querySelector('#ord-prev').addEventListener('click', async () => { await doSave(); m.close(); openA4Preview(await ORDRES.get(ordre.id)); });
  }

  async function doSave(ordre) { if (ordre) { try { const sub = await ORDRES.substituteVariables(ordre); await ORDRES.updateOrdre(ordre.id, { contenu: sub.html }); } catch (e) {} } }
  async function markPrinted(ordre) {
    try {
      await MISSIONS.marquerImprimee(ordre.missionId, ordre.reference);
      await ORDRES.updateOrdre(ordre.id, { imprime: true, dateImpression: Utils.todayISO(), heureImpression: Utils.nowTime() });
      Utils.toast('Ordre imprimé — tracé dans le journal d\u2019audit.', 'ok');
    } catch (e) {}
  }

  function openRegistre(ordre) {
    const m = UI.modal({ title: 'Impression registre', body: `
      <div class="form-grid">
        ${UI.field('Format', UI.select('format', ['A4', 'Registre'], 'A4'))}
        ${UI.field('Orientation', UI.select('orientation', ['Portrait', 'Paysage'], 'Portrait'))}
        ${UI.field('Marges', UI.select('marges', ['Normales', 'Réduites', 'Personnalisées'], 'Normales'))}
        ${UI.field('Copies', UI.input('copies', '1', '', 'number'))}
      </div>`, footer: '<button class="btn sec" id="rg-cancel">Annuler</button><button class="btn" id="rg-print">Imprimer le registre</button>' });
    m.el.querySelector('#rg-cancel').addEventListener('click', m.close);
    m.el.querySelector('#rg-print').addEventListener('click', async () => {
      const opts = UI.collect(m.body); m.close(); await doRegistrePrint(ordre, opts);
    });
  }
  async function doRegistrePrint(ordre, opts) {
    let html = '';
    if (ordre.reference) html += '<h3 style="margin:0 0 12px">REGISTRE DES ORDRES DE MISSION — IGT RDC</h3>';
    const list = await ORDRES.getAll();
    html += '<table><thead><tr><th>N°</th><th>Référence</th><th>Date</th><th>Équipe</th><th>Entreprises</th><th>Statut</th></tr></thead><tbody>' +
      list.map((o, i) => `<tr><td>${i + 1}</td><td>${Utils.esc(o.reference)}</td><td>${Utils.fmtDate(o.date)}</td><td>${Utils.esc(o.equipeNom || '—')}</td><td>${(o.entrepriseIds || []).length}</td><td>${Utils.esc(o.statut)}</td></tr>`).join('') +
      '</tbody></table>';
    printHTML(html, { orientation: 'landscape', margin: opts.marges });
  }

  function printHTML(html, opts) {
    const win = window.open('', '_blank', 'width=860,height=1100');
    if (!win) { Utils.toast('Autorisez les fenêtres pop-up pour imprimer.', 'err'); return; }
    opts = opts || {};
    const orient = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
    const margin = opts.margin === 'Réduites' ? '8mm' : (opts.pdf ? '0' : '18mm');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ordre de mission</title>
    <style>
      @page { size: A4 ${orient}; margin: ${opts.pdf ? '0' : '18mm 20mm'}; }
      body { font-family: "Times New Roman", Times, serif; color:#000; font-size: 11.5pt; margin:${opts.pdf ? '0' : '0'}; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-head { text-align: center; }
      .doc-head img { max-height: 76px; }
      .dh-rep { font-weight: bold; font-size: 13pt; }
      .dh-min { font-weight: bold; }
      .dh-igt { font-style: italic; color: #B0000F; }
      .dh-igt2 { font-style: italic; color: #123F8C; }
      .doc-title { text-align: center; text-decoration: underline; font-weight: bold; font-size: 13.5pt; margin: 16px 0 18px; }
      table { border-collapse: collapse; width: 100%; }
      table td, table th { border: 1px solid #000; padding: 5px 8px; }
      img { max-width: 100%; }
      .sign { break-inside: avoid; page-break-inside: avoid; margin-top: 34px; }
      .s-nom { text-decoration: underline; font-weight: bold; }
      .adress { text-align: center; font-size: 10pt; margin-top: 8px; }
      .rdc-bar { height: 8px; border-radius: 3px; margin-top: 22px; background: linear-gradient(90deg, #0072C6 0 30%, #0B2E6D 30% 70%, #CE1126 70% 88%, #FCD116 88% 100%); }
      table { break-inside: avoid; }
      .objet-block { break-inside: avoid; }
      h1,h2,h3 { color:#000; }
      p { margin: 0 0 .8em; }
      .meta { margin: .2em 0; }
    </style></head><body>${html}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 450);
    setTimeout(() => { win.close(); }, 1600);
  }

  async function draw() {
    const list = await ORDRES.getAll();
    container.innerHTML = `
      <h2 class="section-title"><span class="st-ic">${UI.icon('ordres', 19)}</span>Ordres de mission</h2>
      <div class="card">
        <div class="toolbar">
          <button class="btn" id="ord-new">${UI.icon('plus', 16)} Nouvel ordre</button>
          <div class="spacer"></div>
          <span class="muted">Numérotation automatique : <strong>OM-IGT-${new Date().getFullYear()}-XXXXXX</strong></span>
        </div>
        <div id="ord-list">${renderList(list)}</div>
      </div>`;
    container.querySelector('#ord-new').addEventListener('click', async () => {
      const missions = await MISSIONS.getMissions();
      const mission = missions.find((m) => ['PROGRAMMEE', 'EN_MISSION', 'BROUILLON'].includes(m.statut));
      if (mission) { const o = await ORDRES.generateForMission(mission); openEditor(o.id); }
      else Utils.toast('Créez d\u2019abord une mission.', 'warn');
    });
    container.querySelectorAll('[data-oedit]').forEach((b) => b.addEventListener('click', () => openEditor(b.getAttribute('data-oedit'))));
    container.querySelectorAll('[data-oprev]').forEach((b) => b.addEventListener('click', () => ORDRES.get(b.getAttribute('data-oprev')).then(openA4Preview)));
    container.querySelectorAll('[data-oprint]').forEach((b) => b.addEventListener('click', async () => {
      const o = await ORDRES.get(b.getAttribute('data-oprint'));
      if (!o) return;
      const r = await resolveConflict(o);
      if (!r.canPrint) return;
      const sub = await ORDRES.substituteVariables(o);
      printHTML(sub.html);
      await markPrinted(o);
    }));
    container.querySelectorAll('[data-oarch]').forEach((b) => b.addEventListener('click', async () => { if (await UI.confirmOk('Archiver cet ordre ?', 'Archiver', 'Archiver', true)) { await ORDRES.archiver(b.getAttribute('data-oarch')); Utils.toast('Ordre archivé.', 'ok'); draw(); } }));
  }
  function renderList(list) {
    if (!list.length) return UI.emptyMessage('📄', 'Aucun ordre de mission généré.');
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Numéro</th><th>Date</th><th>Mission</th><th>Équipe</th><th>Entreprises</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      ${list.map((o) => `<tr><td><strong>${Utils.esc(o.reference)}</strong></td><td>${Utils.fmtDate(o.date)}</td><td>${Utils.esc(o.missionReference || '—')}</td><td>${Utils.esc(o.equipeNom || '—')}</td><td>${(o.entrepriseIds || []).length}</td><td>${UI.badge(o.statut)}</td>
        <td><div class="pill-row"><button class="btn sm sec" data-oedit="${o.id}">Consulter</button><button class="btn sm sec" data-oprev="${o.id}">Aperçu A4</button><button class="btn sm" data-oprint="${o.id}">Imprimer</button><button class="btn sm sec" data-oarch="${o.id}">Archiver</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
  }
  await draw();
};
