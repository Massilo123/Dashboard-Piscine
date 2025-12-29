# Guide : Corriger l'Erreur 401 Square API

## ✅ Problème Identifié

L'erreur **401 (UNAUTHORIZED)** indique que le token Square API est :
- **Expiré** : Les tokens Square peuvent expirer
- **Invalide** : Le token peut avoir été révoqué ou mal configuré
- **Différent entre local et production** : Les variables d'environnement peuvent différer

## 🔍 Vérification du Token

### 1. Vérifier le Token dans Docker Compose (Local)

Le token est configuré dans `docker-compose.yml` ligne 14 :
```yaml
- SQUARE_ACCESS_TOKEN=EAAAlyPmyvQ-VFRfruDbPad_8DlYDaoXF7Bxduj8Mehi9GnkUJeDA3jxDv26cOJP
```

### 2. Vérifier le Token en Production

En production, le token doit être configuré dans :
- Variables d'environnement du serveur
- Fichier `.env` du serveur
- Configuration Docker/Cloudflare

## 🔧 Solution : Régénérer le Token Square API

### Étape 1 : Accéder au Dashboard Square

1. Allez sur [https://developer.squareup.com/apps](https://developer.squareup.com/apps)
2. Connectez-vous à votre compte Square
3. Sélectionnez votre application

### Étape 2 : Générer un Nouveau Token

1. Dans le menu de gauche, cliquez sur **"Credentials"** ou **"API Keys"**
2. Trouvez la section **"Access Tokens"** ou **"Production Access Token"**
3. Cliquez sur **"Generate Token"** ou **"Regenerate"**
4. **Copiez le nouveau token** (vous ne pourrez le voir qu'une seule fois !)

### Étape 3 : Mettre à Jour le Token

#### Pour Docker Compose (Local) :

Modifiez `docker-compose.yml` :
```yaml
environment:
  - SQUARE_ACCESS_TOKEN=votre_nouveau_token_ici
```

#### Pour la Production :

Mettez à jour la variable d'environnement `SQUARE_ACCESS_TOKEN` dans :
- Votre fichier `.env` de production
- Les variables d'environnement de votre serveur
- La configuration Docker/Cloudflare

### Étape 4 : Redémarrer les Services

#### Local (Docker) :
```bash
docker-compose down
docker-compose up --build
```

#### Production :
Redémarrez votre serveur ou vos conteneurs Docker.

## 🧪 Vérifier que ça Fonctionne

1. **Vérifiez les logs du serveur** :
   ```
   Square Client initialized with token: EAAAA...
   ```

2. **Testez l'application** :
   - Allez sur la page "Planning"
   - Cliquez sur "Optimiser"
   - L'erreur 401 ne devrait plus apparaître

3. **Vérifiez la console du navigateur** :
   - Plus d'erreurs 401
   - Les requêtes devraient retourner 200 OK

## ⚠️ Notes Importantes

### Sécurité

- **Ne commitez JAMAIS le token dans Git** si vous utilisez un dépôt public
- Utilisez des variables d'environnement ou un gestionnaire de secrets
- Le token dans `docker-compose.yml` est visible dans le code, considérez utiliser un fichier `.env` séparé

### Expiration des Tokens

- Les tokens Square peuvent expirer
- Vérifiez régulièrement la validité du token
- Configurez des alertes si possible

### Rate Limiting

- Square API a des limites de requêtes
- Si vous obtenez des erreurs 429, attendez quelques minutes
- Considérez implémenter un système de cache

## 🔄 Alternative : Utiliser un Fichier .env

Pour plus de sécurité, créez un fichier `.env` à la racine :

```env
SQUARE_ACCESS_TOKEN=votre_token_ici
MAPBOX_TOKEN=votre_token_mapbox
MONGODB_URI=votre_uri_mongodb
```

Puis modifiez `docker-compose.yml` pour utiliser le fichier `.env` :
```yaml
env_file:
  - .env
```

**Important** : Ajoutez `.env` à votre `.gitignore` pour ne pas le commiter !

## 📝 Checklist

- [ ] Token Square API régénéré
- [ ] Token mis à jour dans `docker-compose.yml` (local)
- [ ] Token mis à jour en production
- [ ] Services redémarrés
- [ ] Logs vérifiés (token initialisé)
- [ ] Application testée (plus d'erreur 401)
- [ ] Fichier `.env` ajouté à `.gitignore` (si utilisé)

## 🆘 Si le Problème Persiste

1. **Vérifiez les logs serveur** pour voir les erreurs exactes
2. **Vérifiez que le token est bien chargé** :
   ```bash
   # Dans les logs, vous devriez voir :
   Square Client initialized with token: EAAAA...
   ```

3. **Vérifiez les permissions du token** :
   - Le token doit avoir les permissions pour accéder aux bookings
   - Vérifiez dans le dashboard Square

4. **Vérifiez l'environnement** :
   - Le code utilise `SquareEnvironment.Production`
   - Assurez-vous d'utiliser un token de production, pas un token de sandbox

5. **Contactez le support Square** si nécessaire

