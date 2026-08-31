/* ==========================================================================
   IGT MISSIONS RDC — db.js — Couche de données IndexedDB
   Base : IGT_MISSIONS_DB — version 1 (migration possible via onupgradeneeded)
   ========================================================================== */
'use strict';

const DB = (() => {
  const DB_NAME = 'IGT_MISSIONS_DB';
  const DB_VERSION = 1;

  const STORES = [
    'users', 'settings', 'structures', 'provinces',
    'entreprises', 'agents', 'equipes',
    'missions', 'missionEntreprises', 'missionAgents',
    'ordres', 'historique', 'archives', 'alertes', 'auditLogs'
  ];

  let _db = null;
  let _initPromise = null;

  /* ---------- Ouverture / initialisation ---------- */
  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) { return reject(e); }
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            seedIndexes(store, name);
          } else {
            const store = ev.target.transaction.objectStore(name);
            seedIndexes(store, name);
          }
        });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => { _db = req.result; reject(req.error); };
      req.onblocked = () => reject(new Error('Base bloquée par une autre fenêtre.'));
    });
  }

  function seedIndexes(store, name) {
    const idx = (key) => { try { if (!store.indexNames.contains(key)) store.createIndex(key, key); } catch (e) {} };
    if (['entreprises', 'agents', 'equipes', 'missions', 'ordres'].includes(name)) {
      idx('nom'); idx('statut'); idx('province'); idx('date'); idx('dateDebut'); idx('dateFin'); idx('equipeId');
      idx('denomination'); idx('matricule'); idx('reference'); idx('structureId'); idx('valeur');
    }
    idx('type'); idx('dateCreation'); idx('date'); idx('action'); idx('objetId'); idx('objetId');
  }

  /* ---------- Méthodes de base (toutes transactionnelles) ---------- */
  function _tx(storeName, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(storeName, mode || 'readonly'); } catch (e) { return reject(e); }
      const store = tx.objectStore(storeName);
      let result;
      try { result = fn(store); } catch (e) { tx.abort(); return reject(e); }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    }));
  }

  function _request(req) {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }

  function add(store, value) { return _tx(store, 'readwrite', (s) => _request(s.add(value))); }
  function put(store, value) { return _tx(store, 'readwrite', (s) => _request(s.put(value))); }
  function update(store, value) { return _tx(store, 'readwrite', (s) => _request(s.put(value))); }
  function get(store, id) { return _tx(store, 'readonly', (s) => _request(s.get(id))); }
  function getAll(store) { return _tx(store, 'readonly', (s) => _request(s.getAll())); }
  function getByIndex(store, key, value) {
    return _tx(store, 'readonly', (s) => _request(s.index(key).getAll(value)));
  }
  function del(store, id) { return _tx(store, 'readwrite', (s) => _request(s.delete(id))); }

  /* ---------- Transaction multi-stores ------------- */
  // cb(stores, req) : stores = { nomStore: objectStore }, req = helper promesse
  function transact(storeNames, mode, cb) {
    return open().then((db) => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(storeNames, mode); } catch (e) { return reject(e); }
      const stores = {};
      storeNames.forEach((n) => { if (tx.objectStore(n)) stores[n] = tx.objectStore(n); });
      tx.oncomplete = () => resolve(tx._result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
      try { tx._result = cb(stores, _request); } catch (e) { try { tx.abort(); } catch (x) {} reject(e); }
    }));
  }

  /* ---------- Persistance / disponibilité ---------- */
  function available() {
    return new Promise((resolve) => {
      try { if (!('indexedDB' in self)) return resolve(false); resolve(true); }
      catch (e) { resolve(false); }
    });
  }
  function persist() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(() => false);
    }
    return Promise.resolve(false);
  }
  function storageEstimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().catch(() => null);
    return Promise.resolve(null);
  }

  /* ---------- API interne publique ---------- */
  return {
    NAME: DB_NAME, VERSION: DB_VERSION, STORES: STORES,
    init: open, add, put, update, get, getAll, getByIndex, del, transact,
    available, persist, storageEstimate,
    _open: open
  };
})();
