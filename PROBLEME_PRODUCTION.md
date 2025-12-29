# Problème de Production - Erreurs 401/500 Square API

## Problème Observé

- **Erreur 401 (UNAUTHORIZED)** dans l'interface utilisateur
- **Erreur 500 (Internal Server Error)** dans la console
- Fonctionne en local mais pas en production
- Fonctionnait parfois avec 5G mais pas avec WiFi
- Ne fonctionne plus ni avec 5G ni avec WiFi

## Causes Probables

### 1. **Rate Limiting Square API**
Square API a des limites de requêtes par seconde/minute. Si vous faites trop de requêtes :
- Les premières requêtes passent
- Puis Square bloque temporairement (rate limiting)
- Cela explique pourquoi ça fonctionnait parfois avec 5G (moins de requêtes) mais pas avec WiFi

### 2. **Token Square API Expiré ou Invalide**
- Le token d'accès Square peut expirer
- Le token peut être invalide en production mais valide en local (variables d'environnement différentes)
- Vérifiez que `SQUARE_ACCESS_TOKEN` est correctement configuré en production

### 3. **Manque de Gestion d'Erreur**
- Les erreurs 401 de Square API n'étaient pas gérées spécifiquement
- Elles étaient transformées en erreurs 500 génériques
- Pas de messages d'erreur clairs pour l'utilisateur

## Solutions Implémentées

### 1. **Gestion Spécifique des Erreurs Square API**

Ajout de gestion d'erreur dans :
- `server/src/routes/clientRdvOptimizer.ts`
- `server/src/routes/routeOptimizer.ts`

**Erreurs gérées :**
- **401 (UNAUTHORIZED)** : Erreur d'authentification - retourne un message clair
- **429 (RATE_LIMITED)** : Rate limiting - suggère de réessayer plus tard
- **Autres erreurs Square** : Messages d'erreur détaillés

### 2. **Amélioration du Logging**

- Logs avec emojis pour faciliter le debugging (❌, 🔐, ⏱️)
- Stack traces en mode développement
- Détails des erreurs Square API dans les logs

### 3. **Messages d'Erreur Utilisateur**

- Messages d'erreur clairs et actionnables
- Distinction entre erreurs d'authentification et autres erreurs
- Suggestions de solutions

## Actions à Prendre

### 1. **Vérifier le Token Square API en Production**

```bash
# Vérifiez que la variable d'environnement est correcte
echo $SQUARE_ACCESS_TOKEN

# Ou dans votre fichier .env de production
SQUARE_ACCESS_TOKEN=votre_token_ici
```

### 2. **Vérifier les Limites Square API**

Square API a des limites :
- **Sandbox** : 500 requêtes/seconde
- **Production** : Varies selon votre plan

Si vous dépassez les limites :
- Attendez quelques minutes avant de réessayer
- Implémentez un système de retry avec backoff exponentiel (à faire)

### 3. **Vérifier les Logs Serveur**

Après le déploiement, vérifiez les logs pour voir :
- Les erreurs exactes retournées par Square API
- Les codes d'erreur spécifiques
- Les détails des erreurs d'authentification

### 4. **Tester en Production**

1. Déployez les changements
2. Testez l'endpoint `/optimisation-rdv`
3. Vérifiez les logs serveur pour les erreurs détaillées
4. Si erreur 401 : Vérifiez le token Square API
5. Si erreur 429 : Attendez quelques minutes et réessayez

## Prochaines Améliorations Suggérées

### 1. **Système de Retry avec Backoff Exponentiel**

```typescript
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 1000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (i === maxRetries - 1) throw error;
            
            // Si c'est une erreur de rate limiting, attendre plus longtemps
            const delay = error?.response?.statusCode === 429 
                ? initialDelay * Math.pow(2, i) * 2  // Double le délai pour rate limiting
                : initialDelay * Math.pow(2, i);
            
            console.log(`⏱️ Retry dans ${delay}ms (tentative ${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries reached');
}
```

### 2. **Cache des Requêtes Square API**

- Mettre en cache les résultats des requêtes Square API
- Réduire le nombre de requêtes vers Square
- Améliorer les performances

### 3. **Monitoring et Alertes**

- Surveiller les erreurs 401/429
- Alertes automatiques si le token expire
- Dashboard de monitoring des appels API

## Fichiers Modifiés

- `server/src/routes/clientRdvOptimizer.ts` : Gestion d'erreur Square API
- `server/src/routes/routeOptimizer.ts` : Gestion d'erreur Square API

## Notes

- Les erreurs sont maintenant mieux gérées et retournent des codes HTTP appropriés
- Les logs sont plus détaillés pour faciliter le debugging
- Les messages d'erreur sont plus clairs pour l'utilisateur final

