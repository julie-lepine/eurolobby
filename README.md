# EuroLobby

Application de vote Eurovision en direct entre amis — prototype fonctionnel (Phase 1–2).

## Lancer en local

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173` (Vite sert les modules ES et le catalogue `data/countries-2025.json`).

> Ouvrir `index.html` directement (`file://`) ne fonctionne pas : les modules et `fetch` nécessitent un serveur HTTP.

## Ce qui est implémenté (MVP local)

| Fonctionnalité | Statut |
|----------------|--------|
| Inscription / connexion (localStorage) | ✅ |
| Mode invité (pseudo) pour rejoindre | ✅ |
| Création lobby + code généré | ✅ |
| Rejoindre par code | ✅ |
| Catalogue 37 pays 2025 | ✅ |
| Votes −3…+3 enregistrés | ✅ |
| Moyennes, distribution, classement | ✅ |
| Timer 3 min + révélation auto à 15 s | ✅ |
| Admin : démarrer / stop / suivant / reset | ✅ |
| Chat lobby | ✅ |
| Sync multi-onglets (storage events) | ✅ |

## Architecture

```
js/
  app.js          — navigation, timer, handlers UI
  store.js        — persistance localStorage
  auth.js         — comptes
  lobby.js        — lobbys, prestations, admin
  vote-engine.js  — agrégation scores
  render.js       — rendu dynamique des écrans
  utils.js
data/
  countries-2025.json
```

## Roadmap

1. **Phase 3** — Supabase Auth + Realtime (votes, timer maître, chat)
2. **Phase 4** — Import CSV ordre des prestations
3. **Phase 5** — Export PDF (jsPDF), PWA, déploiement

## Données

Les mots de passe sont hashés en base64 pour la démo locale uniquement — **ne pas utiliser en production**.
