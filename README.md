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

## Supabase (multijoueur en ligne)

1. Copier `.env.example` → `.env.local` et remplir `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
2. Dans le [dashboard Supabase](https://supabase.com/dashboard) → **SQL Editor**, exécuter le fichier `supabase/schema.sql`
3. **Authentication** → désactiver « Confirm email » pour les tests rapides (ou confirmer les emails à l’inscription)
4. **Authentication** → **URL Configuration** → ajouter `https://julie-lepine.github.io/eurolobby/` dans Site URL et Redirect URLs
5. `npm run dev` — ouvrir `http://localhost:5173/eurolobby/` — toast « Mode en ligne » si Supabase est configuré

Sans `.env.local`, l’app reste en mode **localStorage** (un navigateur = une base).

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy.yml` build `dist/` (Vite + bundle Supabase) et publie sur Pages.

### Configuration GitHub (une fois)

1. Repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - `VITE_SUPABASE_URL` = Project URL (Supabase → Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = clé **anon** (publique)
2. **Settings** → **Pages** → **Build and deployment** → Source : **GitHub Actions**
3. Pousser sur `main` : l’action **Deploy GitHub Pages** se lance automatiquement

Site : https://julie-lepine.github.io/eurolobby/

## Roadmap

1. ~~**Phase 3** — Supabase Auth + Realtime~~ ✅ (base)
2. **Phase 4** — Import CSV ordre des prestations, RLS renforcé
3. **Phase 5** — Export PDF (jsPDF), PWA, déploiement

## Données

- **Local** : mots de passe en base64 (démo uniquement).
- **Supabase** : Auth Supabase + profils / lobbys en base.
