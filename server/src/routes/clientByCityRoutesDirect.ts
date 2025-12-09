// Version SANS CACHE - Utilise directement MongoDB avec aggregate()
// Cette version est plus simple et devrait être rapide avec des index MongoDB
import { Router, Request, Response } from 'express';
import Client from '../models/Client';

const router = Router();

// Route pour récupérer les clients par ville SANS cache
router.get('/by-city-direct', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Calcul direct depuis MongoDB (sans cache)...');
    const startTime = Date.now();

    // Utiliser MongoDB aggregate() pour construire la structure hiérarchique
    // C'est optimisé par MongoDB avec des index sur sector, city, district
    const result = await Client.aggregate([
      // Filtrer seulement les clients avec adresse
      { $match: { addressLine1: { $exists: true, $ne: '' } } },
      
      // Grouper par secteur, puis ville, puis district
      {
        $group: {
          _id: {
            sector: { $ifNull: ['$sector', 'Non assignés'] },
            city: { $ifNull: ['$city', 'Inconnu'] },
            district: '$district'
          },
          clients: {
            $push: {
              _id: '$_id',
              givenName: '$givenName',
              familyName: '$familyName',
              phoneNumber: '$phoneNumber',
              addressLine1: '$addressLine1',
              coordinates: '$coordinates',
              city: { $ifNull: ['$city', 'Inconnu'] },
              district: '$district'
            }
          }
        }
      },
      
      // Reconstruire la structure hiérarchique
      {
        $group: {
          _id: '$_id.sector',
          cities: {
            $push: {
              city: '$_id.city',
              district: '$_id.district',
              clients: '$clients'
            }
          }
        }
      }
    ]);

    // Transformer le résultat en structure attendue par le frontend
    const structuredData: Record<string, any> = {};
    let totalClients = 0;

    for (const sectorGroup of result) {
      const sector = sectorGroup._id;
      structuredData[sector] = {};

      // Grouper par ville
      const citiesMap = new Map<string, any>();

      for (const cityData of sectorGroup.cities) {
        const city = cityData.city;
        
        if (!citiesMap.has(city)) {
          citiesMap.set(city, {
            clients: [],
            districts: {}
          });
        }

        const cityObj = citiesMap.get(city);

        if (cityData.district) {
          // Client avec district
          if (!cityObj.districts[cityData.district]) {
            cityObj.districts[cityData.district] = [];
          }
          cityObj.districts[cityData.district].push(...cityData.clients);
        } else {
          // Client sans district
          cityObj.clients.push(...cityData.clients);
        }

        totalClients += cityData.clients.length;
      }

      // Pour Montréal et Laval, structure spéciale
      if (sector === 'Montréal' || sector === 'Laval') {
        const sectorKey = sector;
        structuredData[sector][sectorKey] = {
          clients: [],
          districts: {}
        };

        citiesMap.forEach((cityData, city) => {
          if (cityData.districts && Object.keys(cityData.districts).length > 0) {
            Object.assign(structuredData[sector][sectorKey].districts, cityData.districts);
          }
          if (cityData.clients.length > 0) {
            structuredData[sector][sectorKey].clients.push(...cityData.clients);
          }
        });
      } else {
        // Pour les autres secteurs, structure normale
        citiesMap.forEach((cityData, city) => {
          structuredData[sector][city] = cityData;
        });
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Calcul terminé en ${totalTime}s (${totalClients} clients)`);

    res.json({
      success: true,
      data: structuredData,
      totalClients: totalClients
    });
  } catch (error) {
    console.error('❌ Erreur lors du calcul direct:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour récupérer les clients pour la map SANS cache
router.get('/for-map-direct', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📍 Calcul direct depuis MongoDB pour la map (sans cache)...');
    const startTime = Date.now();

    // Récupérer tous les clients avec coordonnées
    const clients = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    // Formater pour la map
    const formattedClients = clients.map(client => ({
      _id: client._id.toString(),
      name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
      phoneNumber: client.phoneNumber || undefined,
      address: client.addressLine1 || '',
      city: client.city || 'Inconnu',
      district: client.district || undefined,
      sector: client.sector || 'Non assignés',
      coordinates: {
        lng: (client.coordinates as any).lng,
        lat: (client.coordinates as any).lat
      }
    }));

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Calcul terminé en ${totalTime}s (${formattedClients.length} clients)`);

    res.json({
      success: true,
      clients: formattedClients,
      total: formattedClients.length,
      totalInDatabase: await Client.countDocuments(),
      totalWithCoordinates: formattedClients.length,
      withoutCoordinates: await Client.countDocuments({ 
        $or: [
          { coordinates: { $exists: false } },
          { 'coordinates.lng': { $exists: false } },
          { 'coordinates.lat': { $exists: false } }
        ]
      }),
      missingClients: []
    });
  } catch (error) {
    console.error('❌ Erreur lors du calcul direct pour la map:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

export default router;

