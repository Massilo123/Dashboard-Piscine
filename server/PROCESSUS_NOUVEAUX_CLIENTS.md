# 📋 Processus de Traitement des Nouveaux Clients

Ce document explique **concrètement** les étapes qu'un nouveau client passera depuis son ajout sur Square jusqu'à son affichage dans l'application, avec tous les mécanismes de détection et de correction automatique.

---

## 🔄 Flux Complet : De Square à l'Application

### **Étape 1 : Création/Mise à jour du client sur Square**
- L'utilisateur crée ou modifie un client dans Square
- Square envoie un webhook à notre serveur (`/api/webhooks/webhook`)

### **Étape 2 : Réception du webhook** (`webhookRoutes.ts`)
```
📥 Webhook reçu → Type: "customer.created" ou "customer.updated"
   ↓
📊 Récupération des données depuis Square API
   ↓
💾 Sauvegarde dans MongoDB (Client model)
   - givenName, familyName, phoneNumber, addressLine1, squareId
```

### **Étape 3 : Géocodage automatique** (`geocodeAndExtractLocation.ts`)

Si le client a une adresse (`addressLine1`), le système lance **automatiquement** le géocodage :

#### 3.1. Appel à HERE API
```
🌐 Requête à HERE Geocoding API
   - Adresse: "25 rue nelligan"
   - Retourne: coordonnées + données d'adresse structurées
```

#### 3.2. Extraction de la ville brute
```
📍 Ville brute de HERE API: "Kirkland" (ou "Dollard-des Ormeaux", etc.)
```

#### 3.3. Normalisation de la ville
```
🔄 normalizeCity(rawCity)
   ↓
   Vérifie si c'est une ville de l'agglomération de Montréal
   - Comparaison flexible (ignore tirets/espaces)
   - Exemples détectés: "Dollard-des Ormeaux", "Dollard-Des Ormeaux", "Ste-Anne-de-Bellevue"
   ↓
   Ville normalisée: "Montréal" (si agglomération) ou ville originale
```

#### 3.4. Détection du district (pour Montréal et Laval)

**Pour Montréal :**
```
🔍 Si ville normalisée = "Montréal" ET ville brute ≠ "Montréal"
   ↓
   ✅ Détection depuis la ville brute de HERE API
   - Patterns flexibles: ["dollard", "ormeaux"] → "Dollard-des-Ormeaux"
   - Patterns flexibles: ["ste", "anne", "bellevue"] → "Sainte-Anne-de-Bellevue"
   ↓
   📍 District détecté: "Kirkland", "Dollard-des-Ormeaux", etc.
```

**Si district non trouvé depuis ville brute :**
```
🔍 Fallback 1: Chercher dans l'adresse originale du client
   - Analyse de "addressLine1" avec patterns flexibles
   - Exemple: "34 rue meadowvale dollard des ormeaux" → "Dollard-des-Ormeaux"
```

**Pour Laval :**
```
🔍 Si ville normalisée = "Laval"
   ↓
   ✅ Détection depuis HERE API (district/subdistrict)
   ↓
   Si non trouvé: Fallback avec code postal
   - Extraction du code postal depuis HERE API ou adresse
   - Mapping code postal → district (ex: H7A → "Saint-François")
```

#### 3.5. Détermination du secteur
```
🌍 getSector(city)
   ↓
   Vérifie dans l'ordre:
   1. Montréal ou agglomération → "Montréal"
   2. Laval → "Laval"
   3. Liste RIVE_NORD_CITIES → "Rive Nord"
   4. Liste RIVE_SUD_CITIES → "Rive Sud"
   5. Autre → "Autres"
```

#### 3.6. Sauvegarde dans MongoDB
```
💾 Client.updateOne()
   {
     coordinates: { lng, lat },
     city: "Montréal",
     district: "Kirkland",
     sector: "Montréal"
   }
```

### **Étape 4 : Affichage dans l'application**

Les routes `/api/clients/by-city` et `/api/clients/for-map` lisent **directement** depuis MongoDB :
- ✅ Pas besoin de recalculer
- ✅ Pas besoin de cache
- ✅ Données toujours à jour

---

## 🛡️ Mécanismes de Protection et Fallback

### **1. Détection flexible des villes**
- ✅ Ignore les variations de tirets/espaces
- ✅ Gère les majuscules/minuscules
- ✅ Reconnaît les abréviations (Ste, St, etc.)

### **2. Fallback en cascade pour les districts**

**Pour Montréal :**
```
1. Ville brute de HERE API (ex: "Kirkland")
   ↓ (si échec)
2. Adresse originale du client (ex: "dollard des ormeaux")
   ↓ (si échec)
3. District = undefined (affiché dans "Sans quartier assigné")
```

**Pour Laval :**
```
1. District/Subdistrict de HERE API
   ↓ (si échec)
2. Code postal depuis HERE API
   ↓ (si échec)
3. Code postal depuis adresse originale
   ↓ (si échec)
4. District = undefined (affiché dans "Sans quartier assigné")
```

### **3. Gestion des erreurs**
- ✅ Si HERE API échoue → Client sauvegardé sans coordonnées
- ✅ Si géocodage échoue → Log d'erreur, client reste dans MongoDB
- ✅ Pas de blocage du processus webhook

---

## 📊 Exemples Concrets

### **Exemple 1 : Client de Kirkland**
```
1. Square: "25 rue nelligan"
   ↓
2. HERE API retourne: city="Kirkland", county="Montréal"
   ↓
3. normalizeCity("Kirkland") → "Montréal"
   ↓
4. Détection district: "Kirkland" (depuis ville brute)
   ↓
5. getSector("Montréal") → "Montréal"
   ↓
6. MongoDB: { city: "Montréal", district: "Kirkland", sector: "Montréal" }
   ↓
7. Affichage: Montréal → Kirkland (3 clients)
```

### **Exemple 2 : Client de Dollard-des-Ormeaux (variation)**
```
1. Square: "2 Gariepy dollard des ormeaux"
   ↓
2. HERE API retourne: city="Dollard-des Ormeaux" (avec espace)
   ↓
3. normalizeCity("Dollard-des Ormeaux") → "Montréal" ✅ (détection flexible)
   ↓
4. Détection district: patterns ["dollard", "ormeaux"] → "Dollard-des-Ormeaux"
   ↓
5. MongoDB: { city: "Montréal", district: "Dollard-des-Ormeaux", sector: "Montréal" }
```

### **Exemple 3 : Client de Laval sans district dans HERE API**
```
1. Square: "123 rue principale, Laval, H7A 1A1"
   ↓
2. HERE API retourne: city="Laval", district=null, postalCode="H7A 1A1"
   ↓
3. normalizeCity("Laval") → "Laval"
   ↓
4. Détection district: postalCode "H7A" → "Saint-François" (fallback)
   ↓
5. MongoDB: { city: "Laval", district: "Saint-François", sector: "Laval" }
```

### **Exemple 4 : Client non reconnu**
```
1. Square: "123 rue inconnue, VilleInconnue"
   ↓
2. HERE API retourne: city="VilleInconnue"
   ↓
3. normalizeCity("VilleInconnue") → "VilleInconnue" (pas dans les listes)
   ↓
4. getSector("VilleInconnue") → "Autres"
   ↓
5. MongoDB: { city: "VilleInconnue", district: undefined, sector: "Autres" }
   ↓
6. Affichage: Autres → VilleInconnue
```

---

## 🔧 Points d'Amélioration Possibles

### **1. Script de correction périodique**
Créer un script qui tourne périodiquement pour :
- Re-géocoder les clients sans district
- Vérifier les clients dans "Autres" qui pourraient être mieux classés
- Corriger les incohérences

### **2. Logs et monitoring**
- Logger les clients qui ne sont pas reconnus
- Créer une alerte si trop de clients dans "Autres"
- Dashboard de statistiques de géocodage

### **3. Interface de correction manuelle**
- Permettre de corriger manuellement le district d'un client
- Interface pour ajouter de nouvelles villes à la liste

---

## ✅ Résumé : Pourquoi ça fonctionne maintenant

1. **Détection flexible** : Gère toutes les variations d'écriture
2. **Fallback en cascade** : Plusieurs méthodes de détection
3. **Normalisation robuste** : Ignore les différences de formatage
4. **Sauvegarde directe** : Pas de cache intermédiaire, données toujours à jour
5. **Traitement automatique** : Aucune intervention manuelle nécessaire

**Résultat** : Les nouveaux clients sont automatiquement classés correctement dès leur création ! 🎉

