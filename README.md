# Système de Gestion et de Planification des Missions de l'Inspection Générale du Travail RDC

> **Version :** 2.0 — Refonte professionnelle « Government Enterprise Dashboard » — 2026
> **Type :** Application Web Progressive (PWA) — en ligne + hors ligne
> **Créé par Inspecteur Limengo Daniel (Pmiller) 2026**

Application locale de **contrôle, planification, suivi et archivage des missions** de l'Inspection Générale du Travail de la République Démocratique du Congo.

Nom unique affiché partout : *Système de Gestion et de Planification des Missions de l'Inspection Générale du Travail RDC*.

### 🖼️ Diaporama institutionnel (bandeau photo)

- **10 photos institutionnelles** en haut du tableau de bord, qui **changent automatiquement toutes les 8 secondes**.
- Navigation précédent/suivant + points indicateurs + compteur `1 / 10`.
- Flèches et points cliquables ; l'intervalle se réinitialise après interaction.
- Images optimisées dans `assets/images/slides/` (01–10.jpg), mises en cache PWA.

### 🧩 Menu en tuiles (mode d'affichage application)

- Grille d'accès rapide type application mobile : tuiles arrondies **bleu marine foncé**, **icônes jaunes/or**, libellés blancs.
- Chaque tuile ouvre directement son module (Agents, Entreprises, Équipes, Missions, Ordres, Calendrier, Historique, Statistiques, Archives, Alertes, Paramètres).
- Responsive : 6 colonnes (desktop) → 3 colonnes (mobile).

### 🔐 Page de connexion institutionnelle

- Carte centrée sur fond bleu institutionnel, bande drapeau RDC (bleu–jaune–rouge) en haut.
- **Logo officiel** (République Démocratique du Congo / Ministère de l'Emploi et Travail / Inspection Générale du Travail), grand titre, champs Identifiant & Mot de passe sécurisé avec affichage/masquage.
- « Accès réservé au Gestionnaire Administrateur » + vérification QR d'un ordre de mission.
- **Aucun identifiant/mot de passe de démonstration affiché** (production).

### 🎨 Identité visuelle institutionnelle

- **Dominante bleue** `#0B2E6D` (variantes `#123F8C`, `#174EA6`, `#EAF1FB`), accents **rouge** `#CE1126` et **or** `#FCD116`, neutres blanc / `#F4F6F9` / `#6B7280` / `#1F2937`.
- Cartes modernes, légers arrondis, ombres douces, typographie professionnelle, **icônes SVG homogènes** (`UI.icon`), tables épurées, badges de statut, animations douces 150–300 ms.
- **Page de connexion** à deux volets : panneau institutionnel bleu (logo, drapeau RDC stylisé, devise) + carte blanche de connexion.
- **Mode sombre** ☀️/🌙 (variables `[data-theme="dark"]`, bleu atténué).
- **Responsive** complet : 320 / 360 / 390 / 414 / 768 / 900 / 1024 / 1080 / 1280 / 1366 / 1920 — menu tiroir mobile, cartes, tableaux en cartes, zéro débordement horizontal.
- Horloge temps réel `HH:mm:ss` avec date, indicateur En ligne, notifications, menu utilisateur.
- Footer **« Créé par Inspecteur Limengo Daniel (Pmiller) 2026 »** — non modifiable.

---

## 🔑 Accès

- **Identifiant :** `admin`
- **Mot de passe :** `admin2026`
- **Rôle unique :** Gestionnaire Administrateur

Il n'existe qu'**un seul compte**. Aucune création de second compte, d'administrateur provincial ni de compte agent n'est autorisée.

---

## 🚀 Déploiement (GitHub Pages)

Le projet est conçu pour fonctionner dans un sous-répertoire GitHub :

```
https://utilisateur.github.io/depot/
```

1. Poussez le dossier `igt-missions-rdc` dans un dépôt GitHub.
2. Activez GitHub Pages (branch `main`, dossier racine).
3. Accédez à `https://utilisateur.github.io/depot/`.

Tous les chemins sont **relatifs** (`./css/main.css`, `./js/app.js`, `./assets/logo/logo.png`) — aucun chemin absolu (pas de 404).

Pour un développement local :

```bash
cd igt-missions-rdc
python3 -m http.server 8080
# ou
npx serve . -l 8080
```

Puis ouvrez `http://localhost:8080/`.

---

## 🧱 Structure du projet

```
igt-missions-rdc/
├── index.html          → page de connexion
├── app.html            → application (sécurisée par session)
├── manifest.json       → PWA (standalone, scope "./")
├── service-worker.js   → cache hors ligne
├── README.md
├── css/
│   ├── main.css        → design système institutionnel (bleu RDC, clair + sombre)
│   ├── responsive.css  → 320/360/390/414/768/900/1024/1080/1280/1366/1920
│   └── print.css       → impression A4 / registre / feuille institutionnelle
├── js/
│   ├── app.js          → orchestration + boîte à outils UI (`UI.icon` SVG)
│   ├── slides.js       → diaporama institutionnel (10 photos / 8 s)
│   ├── auth.js         → session unique, garde de app.html
│   ├── db.js           → IndexedDB IGT_MISSIONS_DB (15 stores)
│   ├── router.js       → navigation par modules (hash)
│   ├── dashboard.js    → tableau de bord temps réel (stats + graphique + fil)
│   ├── entreprises.js  → CRUD + doublons + collage/import
│   ├── agents.js       → CRUD + 8 statuts badgés + contrôle disponibilité + fiche imprimable
│   ├── equipes.js      → CRUD + équipes réutilisables
│   ├── missions.js     → wizard 8 étapes + validateMission()
│   ├── ordres.js       → ordres A4 institutionnel + éditeur + aperçu + PDF
│   ├── qr.js           → wrapper QR
│   ├── qrcode-lib.js   → encodeur QR (Kazuhiko Arase, MIT)
│   ├── historique.js   → recherche globale
│   ├── calendrier.js   → vue mois/semaine/jour/liste
│   ├── statistiques.js → missions par mois/année/équipe/agent
│   ├── archives.js     → archives consultables (pas de suppression)
│   ├── alertes.js      → centre d'alertes
│   ├── parametres.js   → paramètres, structures, provinces, sauvegarde
│   ├── audit.js        → journal d'audit (traçabilité)
│   ├── sauvegarde.js   → export / import igt-backup-*.json
│   └── utils.js        → utilitaires partagés + sanitizeHTML()
├── data/
│   └── provinces.json
└── assets/
    ├── logo/logo.png, official.png
    ├── icons/icon-192.png, icon-512.png
    └── images/slides/01.jpg … 10.jpg
```

> **Note complémentaire :** `js/qrcode-lib.js` et `js/qr.js` fournissent la génération de QR Code (référence technique `OM-IGT-AAAA-XXXXXX`) sans dépendance externe ni CDN.

---

## 🗄️ Base de données (IndexedDB)

**Nom :** `IGT_MISSIONS_DB` — **version 1**
Stores : `users`, `settings`, `structures`, `provinces`, `entreprises`, `agents`, `equipes`, `missions`, `missionEntreprises`, `missionAgents`, `ordres`, `historique`, `archives`, `alertes`, `auditLogs`.

- Identifiants uniques : `ENT-000001`, `AGT-000001`, `EQP-000001`, `MIS-000001`, `OM-IGT-2026-000001`.
- Les opérations critiques (création d'une mission + relations + ordre + journal) utilisent des **transactions atomiques**.
- `onupgradeneeded` prévu pour les évolutions futures (montée de version sans détruire les données).

---

## 🛡️ Moteur central de validation — `validateMission()`

Vérifie et retourne `errors[]`, `warnings[]`, `status`, `canValidate`, `canPrint` :

1. Entreprises existantes
2. Doublons dans la mission
3. **Entreprises déjà en mission** (🔴 bloquant)
4. Entreprises récemment visitées (🟠 avertissement — paramètre 4 mois)
5. Équipe disponible
6. Agents disponibles
7. Chevauchement de dates
8. Champs obligatoires
9. Cohérence des dates
10. Ordre correctement renseigné

Règle d'impression :

```js
canPrint = errors.length === 0;
```

Le bouton **Imprimer** est désactivé tant que `canPrint === false`.

---

## 📄 Ordre de mission (A4 institutionnel — priorité 1 de la refonte)

Modèle **institutionnel** : en-tête (logo + RÉPUBLIQUE DÉMOCRATIQUE DU CONGO + Ministère de l'Emploi et Travail + Inspection Générale du Travail), titre souligné « ORDRE DE MISSION COLLECTIF N°… », introduction dynamique avec les entreprises, tableau des agents (N°, Nom/Post-nom/Prénom, Fonction), objet numéroté configurable, DURÉE / DATE DE DÉBUT / DATE DE CLÔTURE / IMPUTATION, signature (Fait à Kinshasa, le…, Chef de corps), pied bleu-rouge-or + adresse institutionnelle.

- **Aperçu A4 plein écran** (210 × 297 mm) identique à l'impression, avec 🖨 Imprimer / 📄 Télécharger PDF / ⛶ Plein écran / ← Modifier.
- **Éditeur intégré** type Word : gras, italique, souligné, taille, police, alignement, listes, tableaux.
- **Collage depuis Word** avec `sanitizeHTML()` (balises autorisées : `p br strong em u ul ol li table thead tbody tr th td`).
- Variables automatiques : `{{NUMERO}} {{DATE}} {{STRUCTURE}} {{PROVINCE}} {{ENTREPRISES}} {{CHEF_MISSION}} {{AGENTS}} {{AGENTS_TABLE}} {{OBJET}} {{OBJET_LIST}} {{DATE_DEBUT}} {{DATE_FIN}} {{DUREE}} {{IMPUTATION}} {{SIGNATAIRE}} {{FONCTION}} {{LIEU}} {{ADRESSE}}`.
- **Autosave** dans IndexedDB (✓ Enregistré / Enregistrement...), registre, QR Code de la référence technique, pagination respectant tableaux & signatures.

---

## 🌐 PWA / hors ligne

- `manifest.json` : `scope: "./"`, `start_url: "./index.html"`, `display: standalone`.
- Service Worker : cache `index.html`, `app.html`, CSS, JS, manifest, icônes, ressources.
- Après le premier chargement, **couper Internet** → l'application reste accessible, les données restent en IndexedDB, création/modification et impression fonctionnent.
- Indicateur : 🟢 En ligne / 🟠 Hors ligne (les fonctions locales restent actives).

---

## 💾 Stockage local

Les données sont **stockées localement sur l'appareil**.
Chaque installation (téléphone A, ordinateur B) possède sa propre base **non synchronisée**.
Le module Paramètres → Stockage l'affiche clairement.

---

## 🔐 Sécurité & données

- Validation des entrées, échappement des données, `sanitizeHTML()` contre l'injection XSS.
- Session contrôlée ; **aucun mot de passe exposé** ; pas de secrets API.
- **Aucune suppression définitive** (agents désactivables, entreprises/missions/ordres archivables et consultables).
- **Aucun** bouton RESET / DELETE ALL / RÉINITIALISER.
- Journal d'audit : `LOGIN LOGOUT CREATE UPDATE ARCHIVE VALIDATE PRINT IMPORT EXPORT` avec ID, date, heure, utilisateur, action, module, objet, identifiant.
- Traçabilité : chaque impression d'ordre est enregistrée (ORDRE IMPRIMÉ, numéro, date, utilisateur).

---

## 🧪 Scénario type

```
Login (admin/admin2026)
  → Entreprises (ajouter / coller)
  → Agents (ajouter / coller)
  → Équipes (créer)
  → Missions → Nouvelle mission
      équipe → entreprises → dates → objet
      → CONTRÔLE AUTOMATIQUE
          → conflit ? (bloquer / changer entreprise)
          → avertissements ? (confirmer)
      → Validation
      → Ordre de mission (généré → éditeur → modifier/coller → prévisualiser → valider → imprimer)
  → Journal d'audit
  → Archiver
  → Historique
```

---

## 🧰 Tests

Le projet a été validé en navigateur headless (Chrome) sur : connexion (mauvais mot de passe refusé), session, dashboard temps réel (stats + graphique + fil), entreprises, collage multiple, doublons, **agents (recherche, filtres, 26 provinces, 8 statuts badgés, contrôle matricule, fiche imprimable)**, équipes, missions, contrôle conflits, historique, alertes, **ordres A4 institutionnels (génération, variables, aperçu 297mm, impression, PDF, registre)**, archives, statistiques, calendrier, export, import, PWA, service worker, hors ligne, **mode sombre, responsive mobile (menu tiroir, zéro débordement), menu utilisateur, horloge live**, console sans erreur.

---

**Footer obligatoire et non modifiable :** *Créé par Inspecteur Limengo Daniel (Pmiller) 2026*
