/* =====================================================================
   utils.js — Fonctions utilitaires partagées (dates, DOM, messages,
   formats, identifiants, CSV). Aucune dépendance externe.
   ===================================================================== */

const Utils = (() => {

  /** Génère un identifiant unique local (préfixe + timestamp + alea). */
  function uid(prefixe = 'id') {
    return `${prefixe}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Échappe le HTML pour éviter toute injection dans le rendu. */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Format de date FR : 28/08/2026 */
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Date longue FR : le 01 Septembre 2026 */
  function fmtDateLongue(iso) {
    if (!iso) return '—';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return '—';
    return 'le ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /** Date et heure : 31/08/2026 14:05 */
  function fmtDT(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** Aujourd'hui au format ISO yyyy-mm-dd (local). */
  function aujourdhui() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Compare deux plages de dates ISO : vrai si elles se chevauchent. */
  function chevauche(debutA, finA, debutB, finB) {
    const fA = finA || debutA, fB = finB || debutB;
    return debutA <= fB && debutB <= fA;
  }

  /** Nombre de jours entre deux dates ISO (inclusif, minimum 1). */
  function nbJours(debut, fin) {
    if (!debut) return 0;
    const d1 = new Date(debut + 'T00:00:00');
    const d2 = new Date((fin || debut) + 'T00:00:00');
    const diff = Math.round((d2 - d1) / 86400000) + 1;
    return Math.max(1, diff);
  }

  /** Convertit un nombre en texte (trente, etc.) — approximation française fiable jusqu'à 999. */
  function nombreEnLettres(n) {
    const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
      'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
    if (n === 0) return 'zéro';
    let res = '';
    if (n >= 100) {
      const c = Math.floor(n / 100);
      res += (c > 1 ? unites[c] + ' ' : '') + 'cent' + (c > 1 && Math.floor(n / 100) === c && n % 100 === 0 ? 's' : '');
      n %= 100;
      if (n) res += ' ';
    }
    if (n >= 20 || n === 10 || n === 11 || n === 12 || n === 13 || n === 14 || n === 15 || n === 16) {
      const d = Math.floor(n / 10);
      const reste = n % 10;
      if (d === 7 || d === 9) {
        res += dizaines[d - 1] + (d === 7 ? ' et ' : '-') + unites[reste + 10];
      } else if (d === 8) {
        res += 'quatre-vingt' + (reste === 0 ? 's' : (reste === 1 ? '-et-un' : '-' + unites[reste]));
      } else {
        res += dizaines[d] + (reste === 1 ? ' et un' : reste ? '-' + unites[reste] : '');
      }
    } else if (n > 0) {
      res += unites[n];
    }
    return res;
  }

  /** Récupère un élément par ID. */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /** Crée un élément DOM avec attributs et contenu. */
  function el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    if (html !== null && html !== undefined) e.innerHTML = html;
    return e;
  }

  /** Raccourci : valeur d'un champ. */
  const val = (sel) => { const n = $(sel); return n ? n.value.trim() : ''; };

  /** Notifications toast (succès / erreur / info / avertissement). */
  function toast(message, type = 'info', duree = 3800) {
    let conteneur = $('#toast-container');
    if (!conteneur) {
      conteneur = el('div', { id: 'toast-container', 'aria-live': 'polite' });
      document.body.appendChild(conteneur);
    }
    const icones = { succes: '✅', erreur: '⛔', info: 'ℹ️', avert: '⚠️' };
    const t = el('div', { class: `toast toast--${type}`, role: 'alert' },
      `<span style="font-size:1.1rem">${icones[type] || 'ℹ️'}</span><span>${esc(message)}</span>`);
    conteneur.appendChild(t);
    setTimeout(() => {
      t.classList.add('sortie');
      setTimeout(() => t.remove(), 320);
    }, duree);
  }

  /** Boîte de confirmation modale (promesse booléenne). */
  function confirmer(titre, message, options = {}) {
    return new Promise((resolve) => {
      const okLabel = options.okLabel || 'Confirmer';
      const okClass = options.okClass || 'btn--rouge';
      const html = `
        <div class="modal-overlay open" id="modal-confirm">
          <div class="modal modal--sm" role="dialog" aria-modal="true" aria-label="${esc(titre)}">
            <div class="modal-head"><h3>${esc(titre)}</h3>
              <button class="modal-close" data-act="non" aria-label="Fermer">✕</button></div>
            <div class="modal-body"><p style="margin:0">${esc(message)}</p></div>
            <div class="modal-foot">
              <button class="btn btn--gris" data-act="non">Annuler</button>
              <button class="btn ${okClass}" data-act="oui">${esc(okLabel)}</button>
            </div>
          </div>
        </div>`;
      const wrap = el('div', {}, html);
      document.body.appendChild(wrap);
      document.body.classList.add('modal-ouverte');
      const fermer = (reponse) => {
        wrap.remove();
        document.body.classList.remove('modal-ouverte');
        resolve(reponse);
      };
      wrap.querySelectorAll('[data-act]').forEach((b) =>
        b.addEventListener('click', () => fermer(b.dataset.act === 'oui')));
      wrap.addEventListener('click', (e) => { if (e.target === wrap.firstElementChild || e.target === wrap) fermer(false); });
    });
  }

  /** Ouvre une modale générique depuis un sélecteur ; retourne l'élément. */
  function ouvrirModale(sel) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    if (m) { m.classList.add('open'); document.body.classList.add('modal-ouverte'); }
    return m;
  }
  function fermerModale(sel) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    if (m) { m.classList.remove('open'); document.body.classList.remove('modal-ouverte'); }
  }

  /** Télécharge un contenu (Blob) côté navigateur. */
  function telecharger(nomFichier, contenu, typeMime = 'application/json') {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: typeMime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nomFichier });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Analyse CSV simple (gère guillemets et points-virgules/virgules/tabulations). */
  function parserCSV(texte) {
    texte = texte.replace(/^﻿/, '');
    const lignes = [];
    let champ = '', ligne = [], dansGuillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (c === '"') {
        if (dansGuillemets && texte[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = !dansGuillemets;
      } else if ((c === ';' || c === ',' || c === '\t') && !dansGuillemets) {
        ligne.push(champ.trim()); champ = '';
      } else if ((c === '\n' || c === '\r') && !dansGuillemets) {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ.trim()); champ = '';
        if (ligne.some((x) => x !== '')) lignes.push(ligne);
        ligne = [];
      } else {
        champ += c;
      }
    }
    if (champ !== '' || ligne.length) { ligne.push(champ.trim()); if (ligne.some((x) => x !== '')) lignes.push(ligne); }
    return lignes;
  }

  /** Met un bouton en état chargement puis restaure. */
  function avecChargement(bouton, fn, labelSucces) {
    if (!bouton) return Promise.resolve(fn && fn());
    const label = bouton.querySelector('.btn-label');
    const texteOriginal = label ? label.textContent : '';
    bouton.classList.add('is-loading');
    bouton.disabled = true;
    return Promise.resolve()
      .then(() => fn && fn())
      .then((r) => {
        if (labelSucces && label) {
          label.textContent = labelSucces;
          setTimeout(() => { label.textContent = texteOriginal; }, 1600);
        }
        return r;
      })
      .finally(() => {
        bouton.classList.remove('is-loading');
        bouton.disabled = false;
      });
  }

  /** Debounce. */
  function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Nom complet d'un agent. */
  function nomAgent(a) {
    if (!a) return '—';
    return [a.nom, a.postnom, a.prenom].filter(Boolean).join(' ').toUpperCase();
  }

  /** Normalise une chaîne pour recherche insensible (retire accents). */
  function normaliser(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /** Masque de nom de fichier sûr. */
  function nomFichierSur(s) {
    return String(s || 'fichier').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80);
  }

  return {
    uid, esc, fmtDate, fmtDateLongue, fmtDT, aujourdhui, chevauche, nbJours,
    nombreEnLettres, $, $$, el, val, toast, confirmer, ouvrirModale, fermerModale,
    telecharger, parserCSV, avecChargement, debounce, nomAgent, normaliser, nomFichierSur
  };
})();
