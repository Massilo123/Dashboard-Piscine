// Script de test pour vérifier que les routes directes fonctionnent sans cache
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function testDirectRoutes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connecté à MongoDB\n');

    // Test 1: Vérifier que les clients ont city/district/sector
    console.log('📊 Test 1: Vérification des champs city/district/sector...');
    const totalClients = await Client.countDocuments();
    const clientsWithCity = await Client.countDocuments({ city: { $exists: true, $ne: null } });
    const clientsWithSector = await Client.countDocuments({ sector: { $exists: true, $ne: null } });
    const clientsWithDistrict = await Client.countDocuments({ district: { $exists: true, $ne: null } });
    
    console.log(`   Total clients: ${totalClients}`);
    console.log(`   Clients avec city: ${clientsWithCity} (${((clientsWithCity/totalClients)*100).toFixed(1)}%)`);
    console.log(`   Clients avec sector: ${clientsWithSector} (${((clientsWithSector/totalClients)*100).toFixed(1)}%)`);
    console.log(`   Clients avec district: ${clientsWithDistrict} (${((clientsWithDistrict/totalClients)*100).toFixed(1)}%)\n`);

    // Test 2: Simuler la requête /by-city
    console.log('📊 Test 2: Simulation de /by-city (structure hiérarchique)...');
    const startTime1 = Date.now();
    
    const clientsForByCity = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    const clientsBySector: Record<string, Record<string, {
      clients: any[];
      districts?: Record<string, any[]>;
    }>> = {};

    for (const client of clientsForByCity) {
      const sector = client.sector || 'Non assignés';
      const city = client.city || 'Inconnu';
      const district = client.district || undefined;

      const clientWithLocation = {
        _id: client._id.toString(),
        givenName: client.givenName || '',
        familyName: client.familyName || '',
        phoneNumber: client.phoneNumber ?? undefined,
        addressLine1: client.addressLine1 || '',
        coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
          ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
          : undefined,
        city: city,
        district: district
      };

      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }

      if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
          (sector === 'Laval' && city.toLowerCase() === 'laval')) {
        const sectorKey = sector;
        if (!clientsBySector[sector][sectorKey]) {
          clientsBySector[sector][sectorKey] = { clients: [], districts: {} };
        }
        if (district) {
          if (!clientsBySector[sector][sectorKey].districts![district]) {
            clientsBySector[sector][sectorKey].districts![district] = [];
          }
          clientsBySector[sector][sectorKey].districts![district].push(clientWithLocation);
        } else {
          clientsBySector[sector][sectorKey].clients.push(clientWithLocation);
        }
      } else {
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        clientsBySector[sector][city].clients.push(clientWithLocation);
      }
    }

    const time1 = ((Date.now() - startTime1) / 1000).toFixed(2);
    console.log(`   ✅ Structure créée en ${time1}s`);
    console.log(`   📊 Secteurs: ${Object.keys(clientsBySector).length}`);
    let totalCities = 0;
    Object.values(clientsBySector).forEach(sector => {
      totalCities += Object.keys(sector).length;
    });
    console.log(`   📊 Villes: ${totalCities}`);
    console.log(`   📊 Clients traités: ${clientsForByCity.length}\n`);

    // Test 3: Simuler la requête /for-map
    console.log('📊 Test 3: Simulation de /for-map (clients avec coordonnées)...');
    const startTime2 = Date.now();
    
    const clientsForMap = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    const formattedClients = clientsForMap.map(client => ({
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

    const time2 = ((Date.now() - startTime2) / 1000).toFixed(2);
    console.log(`   ✅ Clients formatés en ${time2}s`);
    console.log(`   📊 Clients avec coordonnées: ${formattedClients.length}\n`);

    // Test 4: Vérifier les index
    console.log('📊 Test 4: Vérification des index MongoDB...');
    const indexes = await Client.collection.indexes();
    const indexNames = indexes.map(idx => Object.keys(idx.key || {}).join(', '));
    console.log(`   Index existants: ${indexNames.length}`);
    indexNames.forEach(name => {
      if (name) console.log(`   - ${name}`);
    });
    
    const hasSectorIndex = indexNames.some(name => name.includes('sector'));
    const hasCityIndex = indexNames.some(name => name.includes('city'));
    const hasCoordinatesIndex = indexNames.some(name => name.includes('coordinates'));
    
    if (!hasSectorIndex || !hasCityIndex || !hasCoordinatesIndex) {
      console.log(`\n   ⚠️  Certains index manquent. Exécutez: npx ts-node src/scripts/createIndexes.ts\n`);
    } else {
      console.log(`   ✅ Index optimisés présents\n`);
    }

    // Résumé
    console.log('========================================');
    console.log('✅ TESTS TERMINÉS');
    console.log('========================================');
    console.log(`📊 Performance:`);
    console.log(`   /by-city: ${time1}s pour ${clientsForByCity.length} clients`);
    console.log(`   /for-map: ${time2}s pour ${formattedClients.length} clients`);
    console.log(`\n📊 Couverture des données:`);
    console.log(`   City: ${((clientsWithCity/totalClients)*100).toFixed(1)}%`);
    console.log(`   Sector: ${((clientsWithSector/totalClients)*100).toFixed(1)}%`);
    console.log(`   District: ${((clientsWithDistrict/totalClients)*100).toFixed(1)}%`);
    
    if (clientsWithCity < totalClients * 0.8) {
      console.log(`\n⚠️  Attention: Moins de 80% des clients ont un city.`);
      console.log(`   Exécutez: npx ts-node src/scripts/migrateClientLocation.ts\n`);
    } else {
      console.log(`\n✅ Données prêtes pour les requêtes directes !\n`);
    }

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testDirectRoutes();

