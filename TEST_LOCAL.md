# 🚀 Guide rapide : Tester en local

## 📋 Prérequis
- Node.js 18+ installé
- MongoDB accessible (local ou distant)
- Tokens Square et Mapbox valides

## ⚡ Démarrage rapide (2 terminaux)

### Terminal 1 : Backend
```bash
cd server
npm run dev
```
✅ Le serveur démarre sur `http://localhost:3000`

### Terminal 2 : Frontend
```bash
# Depuis la racine du projet
npm run dev
```
✅ Le frontend démarre sur `http://localhost:5173`

## 🔧 Configuration nécessaire

### 1. Créer `.env.local` à la racine
```env
VITE_API_URL=http://localhost:3000
```

### 2. Modifier `vite.config.ts` (ligne 11)
```typescript
target: 'http://localhost:3000',  // Au lieu de 'http://server:3000'
```

### 3. Vérifier `server/.env` existe
```env
PORT=3000
MONGODB_URI=votre_uri_mongodb
MAPBOX_TOKEN=votre_token_mapbox
SQUARE_ACCESS_TOKEN=votre_token_square
```

## ✅ Vérification

1. **Backend** : Ouvrez `http://localhost:3000` → Devrait afficher une erreur 404 (normal, pas de route racine)
2. **Frontend** : Ouvrez `http://localhost:5173` → L'application devrait se charger
3. **Console navigateur** : Vérifiez qu'il n'y a pas d'erreurs 404 vers l'API

## 🔄 Retour à la production

1. **Supprimer** `.env.local`
2. **Modifier** `vite.config.ts` : `target: 'http://server:3000'`
3. Redémarrer les serveurs

## 🐛 Dépannage

### Erreur 404 sur les requêtes API
- Vérifiez que `.env.local` existe avec `VITE_API_URL=http://localhost:3000`
- Redémarrez Vite après création/modification de `.env.local`
- Vérifiez que le backend tourne sur le port 3000

### Le backend ne démarre pas
- Vérifiez que `server/.env` existe
- Vérifiez que MongoDB est accessible
- Vérifiez les tokens Square et Mapbox

### Le frontend ne se charge pas
- Vérifiez que le port 5173 n'est pas déjà utilisé
- Vérifiez les dépendances : `npm install`
- Vérifiez la console pour les erreurs


