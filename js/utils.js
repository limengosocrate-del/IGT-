/* ==========================================================================
   IGT MISSIONS RDC — utils.js — fonctions utilitaires partagées
   ========================================================================== */
'use strict';

const Utils = (() => {
  const d = document;

  /* ---------- Sélection / création ---------- */
  const $ = (sel, root = d) => root.querySelector(sel);
  const $$ = (sel, root = d) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, html = '') => {
    const e = d.createElement(tag);
    for (const k in attrs) {
      if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html) e.innerHTML = html;
    return e;
  };

  /* ---------- Échappement / sécurité ---------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const sanitizeHTML = (html) => {
    const allowed = ['P', 'BR', 'STRONG', 'EM', 'U', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'DIV', 'H1', 'H2', 'H3', 'H4', 'SPAN'];
    const tmp = d.createElement('div');
    tmp.innerHTML = html;
    const clean = (node) => {
      Array.from(node.children).forEach((child) => {
        clean(child);
        if (!allowed.includes(child.tagName)) {
          // Remplacer une balise non autorisée par son texte
          const frag = d.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
          return;
        }
        // Supprimer les attributs dangereux
        Array.from(child.attributes).forEach((a) => {
          const at = a.name.toLowerCase();
          if (at.startsWith('on') || (at === 'style' && /expression|javascript:/i.test(a.value)) || at === 'src' && !/^data:|^https?:|^\.\//.test(a.value)) child.removeAttribute(a.name);
          else if (at === 'src' && child.tagName === 'IMG') child.remove(); // pas d'images externes
        });
        // Nettoyer style
        if (child.hasAttribute('style')) {
          const st = child.getAttribute('style');
          if (/expression|javascript:/i.test(st)) child.removeAttribute('style');
        }
      });
    };
    clean(tmp);
    return tmp.innerHTML;
  };

  /* ---------- Normalisation / comparaison ---------- */
  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

  const normKey = (s) => norm(s).replace(/[^A-Z0-9]/g, '');

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };
  const nowTime = () => {
    const t = new Date();
    return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
  };
  const nowStamp = () => `${todayISO()} ${nowTime()}`;
  const dateISO = (dateStr) => {
    if (!dateStr) return '';
    const s = String(dateStr).slice(0, 10);
    return s;
  };
  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const s = String(dateStr).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateStr;
    const [y, m, dd] = s.split('-');
    return `${dd}/${m}/${y}`;
  };
  const addMonths = (dateStr, months) => {
    const dt = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    dt.setMonth(dt.getMonth() + months);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  const monthKey = (dateStr) => String(dateStr || '').slice(0, 7); // YYYY-MM
  const yearKey = (dateStr) => String(dateStr || '').slice(0, 4);
  const inRange = (d1, d2, s, e) => {
    // chevauchement entre [d1,d2] et [s,e]
    return String(d1) <= String(e) && String(s) <= String(d2);
  };
  const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  /* ---------- Identifiants ---------- */
  const genId = (prefix, num) => `${prefix}-${String(num).padStart(6, '0')}`;

  /* ---------- Toasts ---------- */
  const toast = (msg, type = 'info', title = '') => {
    const box = $('#toasts');
    if (!box) return;
    const icons = { ok: '✔', warn: '⚠', err: '✖', info: 'ℹ' };
    const t = el('div', { class: 'toast ' + (type === 'info' ? '' : type) });
    t.innerHTML = `<span class="ttl">${icons[type] || ''} ${esc(title || 'Notification')}</span>
      <div class="msg">${msg}</div><button>&times;</button>`;
    t.querySelector('button').addEventListener('click', () => t.remove());
    box.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 4200);
  };

  /* ---------- Confirmations ---------- */
  const confirmDialog = (title, msg, okLabel = 'Confirmer', danger = false) => {
    return new Promise((resolve) => {
      const ov = el('div', { class: 'overlay open' });
      ov.innerHTML = `<div class="modal" style="max-width:420px">
        <div class="modal-header"><h3>${esc(title)}</h3></div>
        <div class="modal-body">${msg}</div>
        <div class="modal-footer">
          <button class="btn sec" data-c="0">Annuler</button>
          <button class="btn ${danger ? 'rouge' : ''}" data-c="1">${esc(okLabel)}</button>
        </div></div>`;
      d.body.appendChild(ov);
      ov.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const val = b.getAttribute('data-c') === '1';
        ov.remove(); resolve(val);
      }));
    });
  };

  /* ---------- Petites fonctions données ---------- */
  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  const fileToText = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
  });
  const fileToDataURL = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });

  /* ---------- Impression / export ---------- */
  const downloadJSON = (obj, name) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    d.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };
  const downloadText = (text, name, mime = 'text/plain') => {
    const blob = new Blob([text], { type: mime });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    d.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };
  const copyText = async (text) => { try { await navigator.clipboard.writeText(text); } catch (e) { /* ignore */ } };

  return {
    $, $$, el, esc, sanitizeHTML, norm, normKey,
    todayISO, nowTime, nowStamp, dateISO, fmtDate, addMonths, monthKey, yearKey, inRange,
    DAYS, MONTHS, genId, toast, confirmDialog, debounce,
    fileToText, fileToDataURL, downloadJSON, downloadText, copyText, pad
  };
})();
