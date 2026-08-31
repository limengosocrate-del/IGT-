/* =====================================================================
   SERVICE WORKER — IGT Missions RDC
   Stratégie :
   - Pré-cache des ressources de l'application (app shell) à l'installation.
   - Navigation / fichiers : stratégie "cache d'abord, réseau en secours"
     avec mise à jour du cache en arrière-plan (stale-while-revalidate).
   - Fonctionne totalement hors ligne après le premier chargement.
   ===================================================================== */

const CACHE_NAME = 'igt-missions-rdc-v3';
const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './verifier-ordre.html',
  './manifest.json',
  './assets/img/logo-igt.png',
  './css/style.css',
  './css/dashboard.css',
  './css/responsive.css',
  './css/print.css',
  './js/utils.js',
  './js/vendor/qrcode-generator.js',
  './js/qrcode.js',
  './js/database.js',
  './js/auth.js',
  './js/audit.js',
  './js/notifications.js',
  './js/entreprises.js',
  './js/agents.js',
  './js/equipes.js',
  './js/missions.js',
  './js/ordres.js',
  './js/historique.js',
  './js/statistiques.js',
  './js/parametres.js',
  './js/import-export.js',
  './js/app.js',
  './templates/ordre-mission.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-64.png'
];

// Installation : mise en cache de l'app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] App shell partiellement mis en cache :', err))
  );
});

// Activation : suppression des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Stratégie stale-while-revalidate pour les requêtes GET locales
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ne pas intercepter des origines tierces non listées (laisser le navigateur gérer)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached); // hors ligne et non caché -> renvoyer le cache si dispo
      return cached || networkFetch;
    })
  );
});

// Permet à la page de demander la mise à jour du SW
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
