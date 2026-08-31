/* ==========================================================================
   IGT MISSIONS RDC — service-worker.js — PWA / hors ligne
   Chemins relatifs pour compatibilité GitHub Pages (sous-répertoire).
   ========================================================================== */

const CACHE_VERSION = 'igt-missions-v2.0.0';
const CACHE_NAME = CACHE_VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/main.css',
  './css/responsive.css',
  './css/print.css',
  './js/app.js',
  './js/auth.js',
  './js/db.js',
  './js/router.js',
  './js/dashboard.js',
  './js/entreprises.js',
  './js/agents.js',
  './js/equipes.js',
  './js/missions.js',
  './js/ordres.js',
  './js/historique.js',
  './js/calendrier.js',
  './js/statistiques.js',
  './js/archives.js',
  './js/slides.js',
  './js/alertes.js',
  './js/parametres.js',
  './js/audit.js',
  './js/sauvegarde.js',
  './js/utils.js',
  './data/provinces.json',
  './assets/logo/logo.png',
  './assets/logo/official.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/slides/01.jpg',
  './assets/images/slides/02.jpg',
  './assets/images/slides/03.jpg',
  './assets/images/slides/04.jpg',
  './assets/images/slides/05.jpg',
  './assets/images/slides/06.jpg',
  './assets/images/slides/07.jpg',
  './assets/images/slides/08.jpg',
  './assets/images/slides/09.jpg',
  './assets/images/slides/10.jpg'
];

/* Installer : mettre en cache le noyau */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

/* Activer : supprimer les anciens caches (changement de version) */
self.addEventListener('activate', (event) => {
  const keysToDelete = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('igt-missions-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch : stratégie cache-first puis réseau (correctif réseau) */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          // Mettre en cache les ressources même origine
          if (resp && resp.status === 200 && req.url.startsWith(self.location.origin)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() => {
          // Ressource manquante en mode hors ligne
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 404, statusText: 'Offline' });
        });
    })
  );
});

/* Message de mise à jour de version de cache */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
