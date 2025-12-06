import { Router } from 'express';
import Client from '../models/Client';
import squareClient from '../config/square';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    
    // Géocoder automatiquement le client s'il a une adresse
    if (client.addressLine1 && client.addressLine1.trim() !== '') {
      const { geocodeClient } = await import('../utils/geocodeClient');
      geocodeClient(client._id.toString()).catch(err => {
        console.error('Erreur lors du géocodage automatique après création:', err);
      });
    }
    
    res.status(201).json(client);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    res.status(400).json({ message: errorMessage });
  }
});

router.get('/', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    res.status(500).json({ message: errorMessage });
  }
});

// Route pour récupérer les clients dans une plage de positions dans la base de données
router.get('/range', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ 
        success: false,
        message: 'Les paramètres "start" et "end" sont requis (positions dans la BD)' 
      });
    }

    const startPos = parseInt(start as string, 10);
    const endPos = parseInt(end as string, 10);

    if (isNaN(startPos) || isNaN(endPos) || startPos < 0 || endPos < startPos) {
      return res.status(400).json({ 
        success: false,
        message: 'Les paramètres "start" et "end" doivent être des nombres valides (start <= end)' 
      });
    }

    // Calculer le nombre de documents à récupérer
    const limit = endPos - startPos + 1;
    
    // Récupérer les clients dans la plage de positions (ordre naturel de la BD)
    // skip() pour sauter les premiers documents, limit() pour limiter le nombre
    const clients = await Client.find()
      .skip(startPos - 1) // -1 car les positions commencent à 1, mais skip() commence à 0
      .limit(limit)
      .select('givenName familyName phoneNumber addressLine1 coordinates squareId _id');

    res.json({
      success: true,
      count: clients.length,
      startPosition: startPos,
      endPosition: endPos,
      data: clients
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour supprimer un client par position (TEST - commence par le 273ème)
router.delete('/position/:position', async (req, res) => {
  try {
    const position = parseInt(req.params.position, 10);

    if (isNaN(position) || position < 1) {
      return res.status(400).json({ 
        success: false,
        message: 'La position doit être un nombre valide supérieur à 0' 
      });
    }

    console.log(`\n========================================`);
    console.log(`🗑️  SUPPRESSION DU CLIENT À LA POSITION ${position}`);
    console.log(`========================================\n`);

    // Récupérer le client à cette position
    const clients = await Client.find()
      .skip(position - 1)
      .limit(1)
      .select('givenName familyName phoneNumber addressLine1 squareId _id');

    if (clients.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: `Aucun client trouvé à la position ${position}` 
      });
    }

    const client = clients[0];
    const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';

    console.log(`📋 Client trouvé:`);
    console.log(`   Nom: ${clientName}`);
    console.log(`   Square ID: ${client.squareId}`);
    console.log(`   MongoDB ID: ${client._id}`);
    console.log(`   Adresse: ${client.addressLine1 || 'N/A'}`);
    console.log(`   Téléphone: ${client.phoneNumber || 'N/A'}`);

    const results = {
      mongoDeleted: false,
      squareDeleted: false,
      errors: [] as string[]
    };

    // 1. Supprimer de MongoDB
    try {
      await Client.deleteOne({ _id: client._id });
      results.mongoDeleted = true;
      console.log(`✅ Client supprimé de MongoDB`);
    } catch (mongoError) {
      const errorMsg = `Erreur MongoDB: ${mongoError instanceof Error ? mongoError.message : 'Erreur inconnue'}`;
      results.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }

    // 2. Supprimer de Square (si squareId existe)
    if (client.squareId) {
      try {
        // Square API v40 - Utiliser deleteCustomer via l'API REST
        // Note: Le SDK Square peut ne pas avoir de méthode deleteCustomer directe
        // On utilise une requête HTTP directe vers l'API Square
        const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
        if (!SQUARE_ACCESS_TOKEN) {
          throw new Error('SQUARE_ACCESS_TOKEN non configuré');
        }

        const squareResponse = await fetch(
          `https://connect.squareup.com/v2/customers/${client.squareId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
              'Square-Version': '2024-01-18'
            }
          }
        );

        if (squareResponse.ok || squareResponse.status === 404) {
          // 404 signifie que le client n'existe plus dans Square (déjà supprimé)
          results.squareDeleted = true;
          if (squareResponse.status === 404) {
            console.log(`⚠️  Client non trouvé dans Square (déjà supprimé)`);
          } else {
            console.log(`✅ Client supprimé de Square`);
          }
        } else {
          const errorData = await squareResponse.json().catch(() => ({}));
          throw new Error(errorData.errors?.[0]?.detail || `Erreur HTTP ${squareResponse.status}`);
        }
      } catch (squareError: any) {
        const errorMsg = `Erreur Square: ${squareError?.message || 'Erreur inconnue'}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        
        // Si le client n'existe pas dans Square, ce n'est pas grave
        if (squareError?.message?.includes('404') || squareError?.message?.includes('NOT_FOUND')) {
          console.log(`⚠️  Client non trouvé dans Square (peut-être déjà supprimé)`);
          results.squareDeleted = true; // On considère comme réussi si déjà supprimé
        }
      }
    } else {
      console.log(`⚠️  Pas de squareId, impossible de supprimer de Square`);
      results.errors.push('Pas de squareId disponible');
    }

    console.log(`\n========================================`);
    console.log(`✅ SUPPRESSION TERMINÉE`);
    console.log(`   MongoDB: ${results.mongoDeleted ? '✅' : '❌'}`);
    console.log(`   Square: ${results.squareDeleted ? '✅' : '❌'}`);
    console.log(`========================================\n`);

    res.json({
      success: results.mongoDeleted || results.squareDeleted,
      position: position,
      client: {
        name: clientName,
        squareId: client.squareId,
        mongoId: client._id.toString()
      },
      results: results
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error(`❌ Erreur lors de la suppression:`, error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour supprimer une plage de clients (273 à 686)
router.delete('/range', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ 
        success: false,
        message: 'Les paramètres "start" et "end" sont requis' 
      });
    }

    const startPos = parseInt(start as string, 10);
    const endPos = parseInt(end as string, 10);

    if (isNaN(startPos) || isNaN(endPos) || startPos < 1 || endPos < startPos) {
      return res.status(400).json({ 
        success: false,
        message: 'Les paramètres "start" et "end" doivent être des nombres valides (start <= end)' 
      });
    }

    console.log(`\n========================================`);
    console.log(`🗑️  SUPPRESSION DE LA PLAGE ${startPos} À ${endPos}`);
    console.log(`========================================\n`);

    // Récupérer tous les clients dans la plage
    const limit = endPos - startPos + 1;
    const clients = await Client.find()
      .skip(startPos - 1)
      .limit(limit)
      .select('givenName familyName phoneNumber addressLine1 squareId _id');

    if (clients.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: `Aucun client trouvé dans la plage ${startPos} à ${endPos}` 
      });
    }

    console.log(`📋 ${clients.length} client(s) à supprimer\n`);

    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('SQUARE_ACCESS_TOKEN non configuré');
    }

    const results = {
      total: clients.length,
      mongoDeleted: 0,
      squareDeleted: 0,
      squareNotFound: 0,
      errors: [] as Array<{ position: number; client: string; error: string }>
    };

    // Supprimer chaque client
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const currentPosition = startPos + i;
      const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';

      console.log(`[${i + 1}/${clients.length}] Suppression position ${currentPosition}: ${clientName}`);

      // 1. Supprimer de MongoDB
      try {
        await Client.deleteOne({ _id: client._id });
        results.mongoDeleted++;
        console.log(`  ✅ MongoDB: supprimé`);
      } catch (mongoError) {
        const errorMsg = mongoError instanceof Error ? mongoError.message : 'Erreur inconnue';
        results.errors.push({ position: currentPosition, client: clientName, error: `MongoDB: ${errorMsg}` });
        console.error(`  ❌ MongoDB: ${errorMsg}`);
      }

      // 2. Supprimer de Square (si squareId existe)
      if (client.squareId) {
        try {
          const squareResponse = await fetch(
            `https://connect.squareup.com/v2/customers/${client.squareId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Square-Version': '2024-01-18'
              }
            }
          );

          if (squareResponse.ok) {
            results.squareDeleted++;
            console.log(`  ✅ Square: supprimé`);
          } else if (squareResponse.status === 404) {
            results.squareNotFound++;
            console.log(`  ⚠️  Square: déjà supprimé (404)`);
          } else {
            const errorData = await squareResponse.json().catch(() => ({}));
            const errorMsg = errorData.errors?.[0]?.detail || `Erreur HTTP ${squareResponse.status}`;
            results.errors.push({ position: currentPosition, client: clientName, error: `Square: ${errorMsg}` });
            console.error(`  ❌ Square: ${errorMsg}`);
          }
        } catch (squareError: any) {
          const errorMsg = squareError?.message || 'Erreur inconnue';
          results.errors.push({ position: currentPosition, client: clientName, error: `Square: ${errorMsg}` });
          console.error(`  ❌ Square: ${errorMsg}`);
        }

        // Petit délai pour éviter de surcharger l'API Square
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        console.log(`  ⚠️  Square: pas de squareId`);
        results.errors.push({ position: currentPosition, client: clientName, error: 'Pas de squareId' });
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ SUPPRESSION TERMINÉE`);
    console.log(`   Total: ${results.total}`);
    console.log(`   MongoDB supprimés: ${results.mongoDeleted}`);
    console.log(`   Square supprimés: ${results.squareDeleted}`);
    console.log(`   Square déjà supprimés: ${results.squareNotFound}`);
    console.log(`   Erreurs: ${results.errors.length}`);
    console.log(`========================================\n`);

    res.json({
      success: results.mongoDeleted > 0,
      startPosition: startPos,
      endPosition: endPos,
      results: results
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error(`❌ Erreur lors de la suppression:`, error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour comparer les clients Square et MongoDB
router.get('/compare', async (req, res) => {
  try {
    console.log(`\n========================================`);
    console.log(`🔍 COMPARAISON SQUARE vs MONGODB`);
    console.log(`========================================\n`);

    // 1. Récupérer tous les clients de Square
    console.log('📥 Récupération des clients depuis Square...');
    const squareClients: Map<string, any> = new Map();
    let squareCount = 0;

    try {
      const customers = await squareClient.customers.list();
      for await (const customer of customers) {
        if (customer.id) {
          squareClients.set(customer.id, {
            id: customer.id,
            givenName: customer.givenName || '',
            familyName: customer.familyName || '',
            phoneNumber: customer.phoneNumber || '',
            addressLine1: customer.address?.addressLine1 || ''
          });
          squareCount++;
        }
      }
      console.log(`✅ ${squareCount} clients récupérés depuis Square\n`);
    } catch (squareError) {
      console.error('❌ Erreur lors de la récupération Square:', squareError);
      throw squareError;
    }

    // 2. Récupérer tous les clients de MongoDB
    console.log('📥 Récupération des clients depuis MongoDB...');
    const mongoClients = await Client.find().select('givenName familyName phoneNumber addressLine1 squareId _id');
    const mongoCount = mongoClients.length;
    console.log(`✅ ${mongoCount} clients récupérés depuis MongoDB\n`);

    // 3. Créer des maps pour faciliter la comparaison
    const mongoClientsBySquareId: Map<string, any> = new Map();
    mongoClients.forEach(client => {
      if (client.squareId) {
        mongoClientsBySquareId.set(client.squareId, {
          _id: client._id.toString(),
          squareId: client.squareId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber || '',
          addressLine1: client.addressLine1 || ''
        });
      }
    });

    // 4. Identifier les différences
    const onlyInSquare: any[] = [];
    const onlyInMongo: any[] = [];
    const different: Array<{
      squareId: string;
      square: any;
      mongo: any;
      differences: string[];
    }> = [];
    const identical: any[] = [];

    // Clients uniquement dans Square
    squareClients.forEach((squareClient, squareId) => {
      if (!mongoClientsBySquareId.has(squareId)) {
        onlyInSquare.push(squareClient);
      }
    });

    // Clients uniquement dans MongoDB
    mongoClients.forEach(mongoClient => {
      if (mongoClient.squareId && !squareClients.has(mongoClient.squareId)) {
        onlyInMongo.push({
          _id: mongoClient._id.toString(),
          squareId: mongoClient.squareId,
          givenName: mongoClient.givenName || '',
          familyName: mongoClient.familyName || '',
          phoneNumber: mongoClient.phoneNumber || '',
          addressLine1: mongoClient.addressLine1 || ''
        });
      } else if (!mongoClient.squareId) {
        onlyInMongo.push({
          _id: mongoClient._id.toString(),
          squareId: null,
          givenName: mongoClient.givenName || '',
          familyName: mongoClient.familyName || '',
          phoneNumber: mongoClient.phoneNumber || '',
          addressLine1: mongoClient.addressLine1 || ''
        });
      }
    });

    // Comparer les clients présents dans les deux
    squareClients.forEach((squareClient, squareId) => {
      const mongoClient = mongoClientsBySquareId.get(squareId);
      if (mongoClient) {
        const differences: string[] = [];
        
        if (squareClient.givenName !== mongoClient.givenName) {
          differences.push(`givenName: "${squareClient.givenName}" vs "${mongoClient.givenName}"`);
        }
        if (squareClient.familyName !== mongoClient.familyName) {
          differences.push(`familyName: "${squareClient.familyName}" vs "${mongoClient.familyName}"`);
        }
        if (squareClient.phoneNumber !== mongoClient.phoneNumber) {
          differences.push(`phoneNumber: "${squareClient.phoneNumber}" vs "${mongoClient.phoneNumber}"`);
        }
        if (squareClient.addressLine1 !== mongoClient.addressLine1) {
          differences.push(`addressLine1: "${squareClient.addressLine1}" vs "${mongoClient.addressLine1}"`);
        }

        if (differences.length > 0) {
          different.push({
            squareId,
            square: squareClient,
            mongo: mongoClient,
            differences
          });
        } else {
          identical.push({
            squareId,
            client: squareClient
          });
        }
      }
    });

    // 5. Résumé
    console.log(`\n========================================`);
    console.log(`📊 RÉSUMÉ DE LA COMPARAISON`);
    console.log(`========================================`);
    console.log(`Square: ${squareCount} clients`);
    console.log(`MongoDB: ${mongoCount} clients`);
    console.log(`\n✅ Identiques: ${identical.length}`);
    console.log(`⚠️  Différents: ${different.length}`);
    console.log(`📥 Uniquement dans Square: ${onlyInSquare.length}`);
    console.log(`📤 Uniquement dans MongoDB: ${onlyInMongo.length}`);
    console.log(`========================================\n`);

    // Afficher quelques exemples de différences
    if (different.length > 0) {
      console.log(`\n🔍 Exemples de clients différents (premiers 5):`);
      different.slice(0, 5).forEach((diff, index) => {
        console.log(`\n${index + 1}. Square ID: ${diff.squareId}`);
        diff.differences.forEach(d => console.log(`   - ${d}`));
      });
    }

    if (onlyInSquare.length > 0) {
      console.log(`\n📥 Exemples de clients uniquement dans Square (premiers 5):`);
      onlyInSquare.slice(0, 5).forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.givenName} ${client.familyName} (${client.id})`);
      });
    }

    if (onlyInMongo.length > 0) {
      console.log(`\n📤 Exemples de clients uniquement dans MongoDB (premiers 5):`);
      onlyInMongo.slice(0, 5).forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.givenName} ${client.familyName} (${client.squareId || 'Pas de Square ID'})`);
      });
    }

    res.json({
      success: true,
      summary: {
        squareCount,
        mongoCount,
        identical: identical.length,
        different: different.length,
        onlyInSquare: onlyInSquare.length,
        onlyInMongo: onlyInMongo.length,
        areIdentical: onlyInSquare.length === 0 && onlyInMongo.length === 0 && different.length === 0
      },
      details: {
        identical: identical.slice(0, 100), // Limiter à 100 pour la réponse
        different: different.slice(0, 50), // Limiter à 50 pour la réponse
        onlyInSquare: onlyInSquare.slice(0, 50),
        onlyInMongo: onlyInMongo.slice(0, 50)
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error('❌ Erreur lors de la comparaison:', error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour synchroniser les clients manquants depuis Square vers MongoDB
router.post('/sync-missing', async (req, res) => {
  try {
    console.log(`\n========================================`);
    console.log(`🔄 SYNCHRONISATION DES CLIENTS MANQUANTS`);
    console.log(`========================================\n`);

    // 1. Récupérer tous les clients de Square
    console.log('📥 Récupération des clients depuis Square...');
    const squareClients: Map<string, any> = new Map();
    let squareCount = 0;

    const customers = await squareClient.customers.list();
    for await (const customer of customers) {
      if (customer.id) {
        squareClients.set(customer.id, {
          id: customer.id,
          givenName: customer.givenName || '',
          familyName: customer.familyName || '',
          phoneNumber: customer.phoneNumber || '',
          addressLine1: customer.address?.addressLine1 || ''
        });
        squareCount++;
      }
    }
    console.log(`✅ ${squareCount} clients récupérés depuis Square\n`);

    // 2. Récupérer tous les clients de MongoDB
    console.log('📥 Récupération des clients depuis MongoDB...');
    const mongoClients = await Client.find().select('squareId');
    const mongoSquareIds = new Set(mongoClients.map(c => c.squareId).filter(Boolean));
    console.log(`✅ ${mongoClients.length} clients récupérés depuis MongoDB\n`);

    // 3. Identifier les clients manquants
    const missingClients: any[] = [];
    squareClients.forEach((squareClient, squareId) => {
      if (!mongoSquareIds.has(squareId)) {
        missingClients.push(squareClient);
      }
    });

    console.log(`📋 ${missingClients.length} client(s) manquant(s) à synchroniser\n`);

    if (missingClients.length === 0) {
      return res.json({
        success: true,
        message: 'Aucun client manquant à synchroniser',
        synced: 0
      });
    }

    // 4. Synchroniser les clients manquants
    const results = {
      total: missingClients.length,
      synced: 0,
      errors: [] as Array<{ squareId: string; error: string }>
    };

    for (let i = 0; i < missingClients.length; i++) {
      const squareClient = missingClients[i];
      const clientName = `${squareClient.givenName || ''} ${squareClient.familyName || ''}`.trim() || 'Sans nom';

      console.log(`[${i + 1}/${missingClients.length}] Synchronisation: ${clientName} (${squareClient.id})`);

      try {
        await Client.findOneAndUpdate(
          { squareId: squareClient.id },
          {
            givenName: squareClient.givenName || '',
            familyName: squareClient.familyName || '',
            phoneNumber: squareClient.phoneNumber || '',
            addressLine1: squareClient.addressLine1 || '',
            squareId: squareClient.id
          },
          { upsert: true, new: true }
        );
        results.synced++;
        console.log(`  ✅ Synchronisé`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        results.errors.push({ squareId: squareClient.id, error: errorMsg });
        console.error(`  ❌ Erreur: ${errorMsg}`);
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ SYNCHRONISATION TERMINÉE`);
    console.log(`   Total: ${results.total}`);
    console.log(`   Synchronisés: ${results.synced}`);
    console.log(`   Erreurs: ${results.errors.length}`);
    console.log(`========================================\n`);

    res.json({
      success: results.synced > 0,
      synced: results.synced,
      total: results.total,
      errors: results.errors
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error('❌ Erreur lors de la synchronisation:', error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour afficher les détails des clients différents
router.get('/compare-differences', async (req, res) => {
  try {
    console.log(`\n========================================`);
    console.log(`🔍 DÉTAILS DES CLIENTS DIFFÉRENTS`);
    console.log(`========================================\n`);

    // 1. Récupérer tous les clients de Square
    const squareClients: Map<string, any> = new Map();
    const customers = await squareClient.customers.list();
    for await (const customer of customers) {
      if (customer.id) {
        squareClients.set(customer.id, {
          id: customer.id,
          givenName: customer.givenName || '',
          familyName: customer.familyName || '',
          phoneNumber: customer.phoneNumber || '',
          addressLine1: customer.address?.addressLine1 || ''
        });
      }
    }

    // 2. Récupérer tous les clients de MongoDB
    const mongoClients = await Client.find().select('givenName familyName phoneNumber addressLine1 squareId _id');
    const mongoClientsBySquareId: Map<string, any> = new Map();
    mongoClients.forEach(client => {
      if (client.squareId) {
        mongoClientsBySquareId.set(client.squareId, {
          _id: client._id.toString(),
          squareId: client.squareId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber || '',
          addressLine1: client.addressLine1 || ''
        });
      }
    });

    // 3. Identifier les clients différents
    const different: Array<{
      squareId: string;
      square: any;
      mongo: any;
      differences: string[];
    }> = [];

    squareClients.forEach((squareClient, squareId) => {
      const mongoClient = mongoClientsBySquareId.get(squareId);
      if (mongoClient) {
        const differences: string[] = [];
        
        if (squareClient.givenName !== mongoClient.givenName) {
          differences.push(`givenName: "${squareClient.givenName}" vs "${mongoClient.givenName}"`);
        }
        if (squareClient.familyName !== mongoClient.familyName) {
          differences.push(`familyName: "${squareClient.familyName}" vs "${mongoClient.familyName}"`);
        }
        if (squareClient.phoneNumber !== mongoClient.phoneNumber) {
          differences.push(`phoneNumber: "${squareClient.phoneNumber}" vs "${mongoClient.phoneNumber}"`);
        }
        if (squareClient.addressLine1 !== mongoClient.addressLine1) {
          differences.push(`addressLine1: "${squareClient.addressLine1}" vs "${mongoClient.addressLine1}"`);
        }

        if (differences.length > 0) {
          different.push({
            squareId,
            square: squareClient,
            mongo: mongoClient,
            differences
          });
        }
      }
    });

    console.log(`📋 ${different.length} client(s) avec des différences trouvé(s)\n`);

    // Afficher les détails dans les logs
    different.forEach((diff, index) => {
      console.log(`\n${index + 1}. Square ID: ${diff.squareId}`);
      console.log(`   Nom: ${diff.square.givenName} ${diff.square.familyName}`);
      console.log(`   Différences:`);
      diff.differences.forEach(d => console.log(`     - ${d}`));
    });

    res.json({
      success: true,
      count: different.length,
      differences: different
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error('❌ Erreur:', error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

// Route pour mettre à jour Square avec les données de MongoDB pour les clients différents
router.post('/sync-differences-to-square', async (req, res) => {
  try {
    console.log(`\n========================================`);
    console.log(`🔄 MISE À JOUR SQUARE AVEC DONNÉES MONGODB`);
    console.log(`========================================\n`);

    // 1. Récupérer tous les clients de Square
    const squareClients: Map<string, any> = new Map();
    const customers = await squareClient.customers.list();
    for await (const customer of customers) {
      if (customer.id) {
        squareClients.set(customer.id, {
          id: customer.id,
          givenName: customer.givenName || '',
          familyName: customer.familyName || '',
          phoneNumber: customer.phoneNumber || '',
          addressLine1: customer.address?.addressLine1 || ''
        });
      }
    }

    // 2. Récupérer tous les clients de MongoDB
    const mongoClients = await Client.find().select('givenName familyName phoneNumber addressLine1 squareId _id');
    const mongoClientsBySquareId: Map<string, any> = new Map();
    mongoClients.forEach(client => {
      if (client.squareId) {
        mongoClientsBySquareId.set(client.squareId, {
          _id: client._id.toString(),
          squareId: client.squareId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber || '',
          addressLine1: client.addressLine1 || ''
        });
      }
    });

    // 3. Identifier les clients différents
    const different: Array<{
      squareId: string;
      square: any;
      mongo: any;
      differences: string[];
    }> = [];

    squareClients.forEach((squareClient, squareId) => {
      const mongoClient = mongoClientsBySquareId.get(squareId);
      if (mongoClient) {
        const differences: string[] = [];
        
        if (squareClient.givenName !== mongoClient.givenName) {
          differences.push('givenName');
        }
        if (squareClient.familyName !== mongoClient.familyName) {
          differences.push('familyName');
        }
        if (squareClient.phoneNumber !== mongoClient.phoneNumber) {
          differences.push('phoneNumber');
        }
        if (squareClient.addressLine1 !== mongoClient.addressLine1) {
          differences.push('addressLine1');
        }

        if (differences.length > 0) {
          different.push({
            squareId,
            square: squareClient,
            mongo: mongoClient,
            differences
          });
        }
      }
    });

    console.log(`📋 ${different.length} client(s) avec des différences trouvé(s)\n`);

    if (different.length === 0) {
      return res.json({
        success: true,
        message: 'Aucun client différent à mettre à jour',
        updated: 0
      });
    }

    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('SQUARE_ACCESS_TOKEN non configuré');
    }

    // 4. Mettre à jour Square avec les données MongoDB
    const results = {
      total: different.length,
      updated: 0,
      errors: [] as Array<{ squareId: string; error: string }>
    };

    for (let i = 0; i < different.length; i++) {
      const diff = different[i];
      const clientName = `${diff.mongo.givenName || ''} ${diff.mongo.familyName || ''}`.trim() || 'Sans nom';

      console.log(`[${i + 1}/${different.length}] Mise à jour: ${clientName} (${diff.squareId})`);
      console.log(`   Différences: ${diff.differences.join(', ')}`);

      try {
        // Récupérer d'abord le client actuel de Square pour préserver les autres champs
        const currentCustomerResponse = await squareClient.customers.get({
          customerId: diff.squareId
        });

        if (!currentCustomerResponse.customer) {
          throw new Error('Client non trouvé dans Square');
        }

        const currentCustomer = currentCustomerResponse.customer;

        // Préparer les données de mise à jour avec les valeurs MongoDB
        const updateData: any = {
          givenName: diff.mongo.givenName || currentCustomer.givenName || '',
          familyName: diff.mongo.familyName || currentCustomer.familyName || '',
          phoneNumber: diff.mongo.phoneNumber || currentCustomer.phoneNumber || ''
        };

        // Mettre à jour l'adresse avec la valeur MongoDB
        if (diff.mongo.addressLine1) {
          updateData.address = {
            addressLine1: diff.mongo.addressLine1,
            locality: currentCustomer.address?.locality || '',
            administrativeDistrictLevel1: currentCustomer.address?.administrativeDistrictLevel1 || '',
            postalCode: currentCustomer.address?.postalCode || '',
            country: currentCustomer.address?.country || 'CA'
          };
        }

        // Mettre à jour dans Square via l'API REST
        const squareResponse = await fetch(
          `https://connect.squareup.com/v2/customers/${diff.squareId}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
              'Square-Version': '2024-01-18'
            },
            body: JSON.stringify(updateData)
          }
        );

        const responseData = await squareResponse.json();

        if (squareResponse.ok && responseData.customer) {
          results.updated++;
          console.log(`  ✅ Mis à jour dans Square`);
          console.log(`     Nouvelle adresse: ${responseData.customer.address?.addressLine1 || 'N/A'}`);
        } else {
          const errorMsg = responseData.errors?.[0]?.detail || `Erreur HTTP ${squareResponse.status}`;
          results.errors.push({ squareId: diff.squareId, error: errorMsg });
          console.error(`  ❌ Erreur: ${errorMsg}`);
          console.error(`     Réponse:`, JSON.stringify(responseData, null, 2));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        results.errors.push({ squareId: diff.squareId, error: errorMsg });
        console.error(`  ❌ Erreur: ${errorMsg}`);
      }

      // Petit délai pour éviter de surcharger l'API Square
      if (i < different.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ MISE À JOUR TERMINÉE`);
    console.log(`   Total: ${results.total}`);
    console.log(`   Mis à jour: ${results.updated}`);
    console.log(`   Erreurs: ${results.errors.length}`);
    console.log(`========================================\n`);

    res.json({
      success: results.updated > 0,
      updated: results.updated,
      total: results.total,
      errors: results.errors
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
    console.error('❌ Erreur lors de la mise à jour:', error);
    res.status(500).json({ 
      success: false,
      message: errorMessage 
    });
  }
});

export default router;