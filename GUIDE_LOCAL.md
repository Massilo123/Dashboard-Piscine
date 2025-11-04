# Guide pour lancer l'application en local

## ✅ Configuration centralisée

**Toutes les URLs de l'API sont maintenant centralisées dans `src/config/api.ts` !**

Pour tester en local, il suffit de modifier **un seul fichier** : `.env.local`

## Prérequis
- Node.js installé (version 18+ recommandée)
- npm ou yarn
- MongoDB (local ou distant)
- Variables d'environnement configurées

## Étapes pour lancer en local

### 1. Installer les dépendances

**Frontend (racine du projet) :**
```bash
npm install
```

**Backend (dossier server) :**
```bash
cd server
npm install
```

### 2. Configurer les variables d'environnement

**Backend (server/.env) :**
Créer un fichier `.env` dans le dossier `server/` avec :
```env
PORT=3000
MONGODB_URI=votre_uri_mongodb
MAPBOX_TOKEN=votre_token_mapbox
SQUARE_ACCESS_TOKEN=votre_token_square
```

**Frontend (.env.local) :**
Créer un fichier `.env.local` à la racine avec :
```env
VITE_MAPBOX_TOKEN=votre_token_mapbox
VITE_API_URL=http://localhost:3000
```

**C'est tout !** 🎉 

Tous les composants utilisent maintenant `src/config/api.ts` qui lit automatiquement `VITE_API_URL` depuis `.env.local`

### 3. Modifier temporairement vite.config.ts (optionnel)

Si vous utilisez le proxy Vite, dans `vite.config.ts`, ligne 11, changer :
```typescript
target: 'http://server:3000',
```
par :
```typescript
target: 'http://localhost:3000',
```

### 4. Lancer le serveur backend

Dans un terminal, depuis le dossier `server/` :
```bash
cd server
npm run dev
```

Le serveur devrait démarrer sur `http://localhost:3000`

### 5. Lancer le frontend

Dans un autre terminal, depuis la racine du projet :
```bash
npm run dev
```

Le frontend devrait démarrer sur `http://localhost:5173`

### 6. Accéder à l'application

Ouvrir votre navigateur sur : `http://localhost:5173`

## Basculement entre local et production

### Pour tester en local :
1. Créer/modifier `.env.local` avec `VITE_API_URL=http://localhost:3000`
2. Lancer le backend et le frontend

### Pour revenir en production :
1. Supprimer ou renommer `.env.local`
2. Ou mettre `VITE_API_URL=https://api.piscineaquarius.com` dans `.env.local`

## Notes importantes

- Le backend doit être lancé avant le frontend
- Assurez-vous que MongoDB est accessible
- Les tokens Mapbox et Square doivent être valides
- Le fichier `.env.local` est ignoré par git (pas de risque de le committer)

## Fichiers modifiés

Tous les composants utilisent maintenant `API_CONFIG` depuis `src/config/api.ts` :
- ✅ `src/components/RouteOptimizerSchedule.tsx`
- ✅ `src/components/RouteOptimizer.tsx`
- ✅ `src/components/ClientSearch.tsx`
- ✅ `src/components/OptimisationRdvClient.tsx`
- ✅ `src/components/DistrictTable.tsx`
- ✅ `src/components/UnidentifiedClientsManager.tsx`
- ✅ `src/api/clientApi.ts`
