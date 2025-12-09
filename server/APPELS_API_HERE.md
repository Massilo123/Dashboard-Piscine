# 📞 Moments où on fait BEAUCOUP d'appels à l'API HERE

Ce document liste **uniquement** les scénarios où le système effectue **plusieurs appels API en masse** (pas les appels individuels).

---

## 🚨 Scénarios avec BEAUCOUP d'appels API

### **1. Synchronisation depuis Square** ⚠️
**Route:** `POST /api/sync/square-clients`  
**Fichier:** `server/src/routes/syncRoutes.ts`

**Quand:**
- Première synchronisation de tous les clients Square (si jamais nécessaire)
- Ré-synchronisation manuelle après une longue période

**Combien d'appels:**
- **1 appel HERE API par client** qui :
  - A une adresse (`addressLine1`)
  - **ET** n'a pas encore de coordonnées dans MongoDB

**⚠️ IMPORTANT - En production après déploiement:**
```
Si tous les clients ont déjà leurs données dans MongoDB:
→ 0 appels API ✅

Exemple après déploiement:
500 clients dans MongoDB avec city/district/sector/coordinates
→ Synchronisation Square → 0 appels API ✅
```

**Exemple (seulement si données manquantes):**
```
500 clients dans Square
- 400 ont déjà des coordonnées → 0 appels
- 100 n'ont pas de coordonnées → 100 appels API
```

**Protection:**
- ✅ Délai de 100ms entre chaque appel
- ✅ Vérifie si coordonnées existent avant d'appeler
- ✅ Ne bloque pas si un appel échoue

**Fréquence:** Très rare (seulement si synchronisation manuelle ET données manquantes)

---

### **2. Route `/by-city-stream` (DEPRECATED mais encore utilisable)** ⚠️⚠️
**Route:** `GET /api/clients/by-city-stream`  
**Fichier:** `server/src/routes/clientByCityRoutes.ts`

**Quand:**
- Utilisateur clique sur "Reboot" dans la page "Clients par Ville"
- Route utilisée pour le streaming progressif

**Combien d'appels:**
- **1 appel HERE API par client** qui :
  - A une adresse
  - **ET** n'a pas encore de `city`, `district`, `sector` dans MongoDB

**Exemple:**
```
500 clients dans MongoDB
- 450 ont déjà city/district/sector → 0 appels
- 50 n'ont pas city/district/sector → 50 appels API
```

**Protection:**
- ✅ Délai progressif (50ms tous les 10 clients)
- ✅ Vérifie si données existent avant d'appeler
- ✅ Utilise un cache en mémoire pour éviter les appels dupliqués

**⚠️ IMPORTANT:** Cette route est **DEPRECATED** car la route `/by-city` lit directement depuis MongoDB sans faire d'appels API. Mais elle existe encore pour compatibilité.

**Fréquence:** Rare (seulement si utilisateur clique sur "Reboot" ET que des clients n'ont pas de données)

---

### **3. Scripts de migration/correction** ⚠️⚠️⚠️
**Fichiers:** `server/src/scripts/*.ts`

**Quand:**
- Migration initiale des données
- Correction de données incorrectes
- Ajout de nouvelles fonctionnalités de détection

**Scripts concernés:**
- `migrateClientLocation.ts` - Migration initiale
- `fixClientSectors.ts` - Correction des secteurs
- `fixLavalDistricts.ts` - Correction des districts Laval
- `fixMissingMontrealDistricts.ts` - Correction districts Montréal
- `fixUnassignedMontrealClients.ts` - Correction clients Montréal
- `fixAllUnassignedClients.ts` - Correction tous les clients non assignés
- Et autres scripts de correction...

**Combien d'appels:**
- **1 appel HERE API par client** traité par le script
- Peut aller de quelques dizaines à **TOUS les clients** (500+)

**Exemple:**
```bash
# Script pour corriger 147 clients de Laval sans district
npx ts-node src/scripts/fixLavalDistrictsFromPostalCode.ts
→ 147 appels API (si tous doivent être re-géocodés)
```

**Protection:**
- ✅ Délai de 200ms entre chaque appel (dans la plupart des scripts)
- ✅ Logs détaillés pour suivre la progression
- ✅ Gestion d'erreurs pour ne pas bloquer

**Fréquence:** Très rare (seulement lors de migrations/corrections ponctuelles)

---

## ✅ Scénarios avec PEU ou AUCUN appel API

### **1. Webhooks Square (création/modification client)** ✅
**Route:** `POST /api/webhooks/webhook`  
**Fichier:** `server/src/routes/webhookRoutes.ts`

**Quand:**
- Client créé ou modifié dans Square
- Webhook automatique envoyé par Square

**Combien d'appels:**
- **1 appel HERE API par client** créé/modifié
- **Uniquement** si le client a une adresse

**Exemple:**
```
1 nouveau client créé dans Square
→ 1 webhook reçu
→ 1 appel API HERE (si adresse présente)
```

**Fréquence:** Normale (au fur et à mesure des créations/modifications)

**Impact:** ✅ Faible (1 appel à la fois)

---

### **2. Route `/by-city` (route principale)** ✅✅
**Route:** `GET /api/clients/by-city`  
**Fichier:** `server/src/routes/clientByCityRoutes.ts`

**Quand:**
- Chargement de la page "Clients par Ville"
- Rafraîchissement des données

**Combien d'appels:**
- **0 appel API HERE** ✅
- Lit directement depuis MongoDB

**Fréquence:** Fréquente (chaque fois qu'on ouvre la page)

**Impact:** ✅✅ Aucun appel API

---

### **3. Route `/for-map`** ✅✅
**Route:** `GET /api/clients/for-map`  
**Fichier:** `server/src/routes/clientByCityRoutes.ts`

**Quand:**
- Chargement de la page "Carte"
- Rafraîchissement de la carte

**Combien d'appels:**
- **0 appel API HERE** ✅
- Lit directement depuis MongoDB

**Fréquence:** Fréquente (chaque fois qu'on ouvre la carte)

**Impact:** ✅✅ Aucun appel API

---

### **4. Création manuelle de client** ✅
**Route:** `POST /api/clients`  
**Fichier:** `server/src/routes/clientRoutes.ts`

**Quand:**
- Création d'un client via l'interface

**Combien d'appels:**
- **1 appel HERE API** (si adresse présente)

**Fréquence:** Occasionnelle

**Impact:** ✅ Faible (1 appel à la fois)

---

## 📊 Résumé des Appels API

### **En production après déploiement (données déjà dans MongoDB):**

| Scénario | Appels API | Fréquence | Impact |
|----------|-----------|-----------|--------|
| **Webhook Square** | 1 par nouveau client | Normale | ✅ Faible (1-2 max) |
| **Route `/by-city`** | 0 | Fréquente | ✅✅ Aucun |
| **Route `/for-map`** | 0 | Fréquente | ✅✅ Aucun |
| **Sync Square** | 0 (vérifie si coords existent) | Rare | ✅✅ Aucun |
| **Route `/by-city-stream`** | 0 (deprecated) | Rare | ✅✅ Aucun |
| **Scripts migration** | 0 (déjà exécutés) | Très rare | ✅✅ Aucun |

### **Avant déploiement / Migration initiale:**

| Scénario | Appels API | Fréquence | Impact |
|----------|-----------|-----------|--------|
| **Sync Square** | 1 par client sans coords | Rare | ⚠️ Moyen |
| **Route `/by-city-stream`** | 1 par client sans données | Rare | ⚠️ Moyen |
| **Scripts migration** | 1 par client traité | Très rare | ⚠️⚠️ Élevé |

---

## 🎯 Conclusion

### **⚠️ En production après déploiement (données déjà dans MongoDB):**

**Appels API en masse = 0 scénario** ✅

Tous les clients ont déjà leurs données (`city`, `district`, `sector`, `coordinates`) dans MongoDB, donc:
- ✅ Synchronisation Square → **0 appels API** (vérifie si coordonnées existent)
- ✅ Route `/by-city` → **0 appels API** (lit depuis MongoDB)
- ✅ Route `/for-map` → **0 appels API** (lit depuis MongoDB)

### **Appels API normaux (1 à la fois, au fur et à mesure):**

- ✅ **Webhooks Square** → **1 appel API par nouveau client créé/modifié**
  - Client créé dans Square → Webhook → 1 appel API HERE
  - Client modifié dans Square → Webhook → 1 appel API HERE
  - **Maximum: 1-2 appels API à la fois** (jamais 500)

- ✅ Création manuelle de client → 1 appel API

### **Scénarios avec appels en masse (seulement si données manquantes):**

1. **Synchronisation Square** (très rare, seulement si clients sans coordonnées)
2. **Route `/by-city-stream`** (rare, deprecated, seulement si clients sans données)
3. **Scripts de migration/correction** (très rare, ponctuel, après déploiement initial)

### **Aucun appel API (en fonctionnement normal):**

- ✅✅ Route `/by-city` (lecture directe MongoDB)
- ✅✅ Route `/for-map` (lecture directe MongoDB)
- ✅✅ Synchronisation Square (si données déjà présentes)

---

## 💡 Recommandations

### **Pour éviter les appels API en masse (après déploiement):**

1. ✅ **Utiliser la route `/by-city`** au lieu de `/by-city-stream` (déjà fait)
2. ✅ **S'assurer que tous les clients ont `city`, `district`, `sector`** dans MongoDB (déjà fait)
3. ✅ **Exécuter les scripts de migration une seule fois** après déploiement (déjà fait)
4. ✅ **Laisser les webhooks faire le travail** pour les nouveaux clients (automatique)

### **En production normale:**

- ✅ **0 appels API en masse** (tous les clients ont déjà leurs données)
- ✅ **0-2 appels API à la fois** (seulement pour nouveaux clients créés/modifiés)
- ✅ **Les webhooks gèrent automatiquement** les nouveaux clients (1 appel par client)

### **Si vous devez faire beaucoup d'appels:**

1. ⚠️ **Utiliser des délais** entre les appels (déjà implémenté)
2. ⚠️ **Vérifier les limites de rate** de HERE API
3. ⚠️ **Exécuter les scripts en dehors des heures de pointe**
4. ⚠️ **Monitorer les logs** pour détecter les erreurs

---

## 🔍 Vérification: Combien d'appels API sont faits actuellement?

Pour vérifier combien de clients nécessitent encore des appels API:

```bash
# Clients sans coordonnées
npx ts-node -e "
const mongoose = require('mongoose');
const Client = require('./dist/models/Client').default;
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const withoutCoords = await Client.countDocuments({
    addressLine1: { \$exists: true, \$ne: '' },
    \$or: [
      { 'coordinates.lng': { \$exists: false } },
      { 'coordinates.lat': { \$exists: false } }
    ]
  });
  console.log('Clients sans coordonnées:', withoutCoords);
  process.exit(0);
});
"

# Clients sans city/district/sector
npx ts-node -e "
const mongoose = require('mongoose');
const Client = require('./dist/models/Client').default;
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const withoutData = await Client.countDocuments({
    addressLine1: { \$exists: true, \$ne: '' },
    \$or: [
      { city: { \$exists: false } },
      { city: '' },
      { sector: { \$exists: false } },
      { sector: '' }
    ]
  });
  console.log('Clients sans city/sector:', withoutData);
  process.exit(0);
});
"
```

---

**En résumé:** 

### **En production après déploiement:**
- ✅ **0 appels API en masse** (tous les clients ont déjà leurs données)
- ✅ **0-2 appels API à la fois** (seulement pour nouveaux clients créés/modifiés via webhooks)
- ✅ **0 appels API** pour afficher les pages (lecture directe MongoDB)

### **Avant déploiement / Migration initiale:**
- ⚠️ Scripts de migration peuvent faire beaucoup d'appels (une seule fois)
- ⚠️ Synchronisation Square peut faire beaucoup d'appels (si données manquantes)

**Le système normal fonctionne avec 0 ou 1-2 appels à la fois grâce au stockage direct dans MongoDB !** 🎉

