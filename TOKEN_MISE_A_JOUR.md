# Token Square API Mis à Jour

## ✅ Token Mis à Jour

Le nouveau token Square API a été configuré :
```
EAAAl5gSQK3Asi-npLm22-80r3X0nm-Z_eWj7sFydjnRT5QJaF14TmaV9YnYdBcx
```

## 📝 Fichiers Modifiés

### 1. `docker-compose.yml` (Local)
- ✅ `SQUARE_ACCESS_TOKEN` mis à jour (ligne 14)
- ✅ `VITE_SQUARE_ACCESS_TOKEN` mis à jour (ligne 45)

## 🚀 Pour Tester en Local

1. **Redémarrer Docker Compose** :
   ```bash
   docker-compose down
   docker-compose up --build
   ```

2. **Vérifier les logs** :
   Vous devriez voir dans les logs :
   ```
   Square Client initialized with token: EAAAl...
   ```

3. **Tester l'application** :
   - Allez sur la page "Planning"
   - Cliquez sur "Optimiser"
   - L'erreur 401 ne devrait plus apparaître

## ⚠️ IMPORTANT : Configuration Production

Le fichier `server/docker-compose.yml` utilise une **variable d'environnement** :
```yaml
- SQUARE_ACCESS_TOKEN=${SQUARE_ACCESS_TOKEN}
```

### Pour la Production, vous devez :

1. **Configurer la variable d'environnement** sur votre serveur de production :
   ```bash
   export SQUARE_ACCESS_TOKEN=EAAAl5gSQK3Asi-npLm22-80r3X0nm-Z_eWj7sFydjnRT5QJaF14TmaV9YnYdBcx
   ```

2. **Ou créer un fichier `.env`** dans le dossier `server/` :
   ```env
   SQUARE_ACCESS_TOKEN=EAAAl5gSQK3Asi-npLm22-80r3X0nm-Z_eWj7sFydjnRT5QJaF14TmaV9YnYdBcx
   MAPBOX_TOKEN=pk.eyJ1IjoibWFzc2lsbzEyMyIsImEiOiJjbTcxbHp5ZnAwMHlkMnJvY3YwNG1sMHVmIn0.XdRskUpVX3PF5dOqbmIyzQ
   MONGODB_URI=mongodb+srv://massilseba:Massilo123@piscine.zpig8.mongodb.net/clients?retryWrites=true&w=majority&appName=piscine
   HERE_API_KEY=3SzQggURCzw4M5E-_RG-dOjY-ZsvaGAIdLjMGL6Vr9c
   ```

3. **Redémarrer les services en production** :
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## 🔍 Vérification

Après avoir redémarré, vérifiez :

1. **Les logs du serveur** :
   ```
   Square Client initialized with token: EAAAl...
   ```

2. **L'application** :
   - Plus d'erreur 401 dans l'interface
   - Plus d'erreur 401 dans la console du navigateur
   - Les requêtes retournent 200 OK

## 📌 Notes

- Le token est maintenant à jour pour le développement local
- **N'oubliez pas de mettre à jour le token en production également**
- Le token dans `docker-compose.yml` est visible dans le code (pour le local, c'est OK)
- Pour la production, utilisez des variables d'environnement ou un fichier `.env` (qui est dans `.gitignore`)

