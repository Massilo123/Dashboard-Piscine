# Créer le fichier .env pour la production

## 📝 Instructions

Pour que le token Square API fonctionne en production, vous devez créer un fichier `.env` dans le dossier `server/`.

### 1. Créer le fichier `.env`

Créez un fichier nommé `.env` dans le dossier `server/` avec le contenu suivant :

```env
# Square API Token
SQUARE_ACCESS_TOKEN=EAAAl5gSQK3Asi-npLm22-80r3X0nm-Z_eWj7sFydjnRT5QJaF14TmaV9YnYdBcx

# Mapbox Token
MAPBOX_TOKEN=pk.eyJ1IjoibWFzc2lsbzEyMyIsImEiOiJjbTcxbHp5ZnAwMHlkMnJvY3YwNG1sMHVmIn0.XdRskUpVX3PF5dOqbmIyzQ

# MongoDB URI
MONGODB_URI=mongodb+srv://massilseba:Massilo123@piscine.zpig8.mongodb.net/clients?retryWrites=true&w=majority&appName=piscine

# HERE API Key
HERE_API_KEY=3SzQggURCzw4M5E-_RG-dOjY-ZsvaGAIdLjMGL6Vr9c

# Cloudflare Tunnel Token (si nécessaire)
# CLOUDFLARE_TOKEN=votre_token_cloudflare_ici

# Node Environment
NODE_ENV=production

# Port
PORT=3000
```

### 2. Alternative : Valeurs par défaut

Le fichier `server/docker-compose.yml` a été modifié pour inclure des valeurs par défaut. Si vous ne créez pas le fichier `.env`, ces valeurs seront utilisées automatiquement.

### 3. Redémarrer les services

Après avoir créé le fichier `.env` (ou si vous utilisez les valeurs par défaut), redémarrez les services :

```bash
cd server
docker-compose down
docker-compose up -d --build
```

### 4. Vérifier

Vérifiez les logs pour confirmer que le token est bien chargé :

```bash
docker-compose logs backend | grep "Square Client"
```

Vous devriez voir :
```
Square Client initialized with token: EAAAl...
```

## ✅ C'est fait !

Le token Square API est maintenant configuré pour la production.

