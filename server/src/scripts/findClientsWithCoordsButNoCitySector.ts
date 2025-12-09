// Script pour trouver les clients avec coordonnées mais sans ville/secteur
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function findClientsWithCoordsButNoCitySector() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Clients avec coordonnées mais sans ville ou secteur
    const clientsWithCoordsButNoCitySector = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      $or: [
        { city: { $exists: false } },
        { city: null },
        { city: '' },
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' }
      ]
    }).lean();

    console.log(`📊 Clients avec coordonnées mais sans ville/secteur: ${clientsWithCoordsButNoCitySector.length}\n`);

    if (clientsWithCoordsButNoCitySector.length > 0) {
      console.log('📋 Détails:');
      for (const client of clientsWithCoordsButNoCitySector) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: ${client.city || 'null'}`);
        console.log(`     Secteur: ${client.sector || 'null'}`);
        console.log(`     Coordonnées: ${(client.coordinates as any)?.lng}, ${(client.coordinates as any)?.lat}`);
        console.log('');
      }
    } else {
      console.log('✅ Tous les clients avec coordonnées ont aussi une ville et un secteur\n');
    }

    // Vérifier aussi les clients qui ont des coordonnées mais qui ne passent pas le filtre de /for-map
    const allClientsWithCoords = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true }
    }).lean();

    const clientsInForMap = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Total clients avec coordonnées: ${allClientsWithCoords.length}`);
    console.log(`📊 Clients dans /for-map: ${clientsInForMap.length}`);
    console.log(`📊 Différence: ${allClientsWithCoords.length - clientsInForMap.length}\n`);

    if (allClientsWithCoords.length !== clientsInForMap.length) {
      const missingIds = new Set(clientsInForMap.map(c => c._id.toString()));
      const missing = allClientsWithCoords.filter(c => !missingIds.has(c._id.toString()));
      console.log(`⚠️  ${missing.length} client(s) avec coordonnées mais pas dans /for-map:`);
      for (const client of missing.slice(0, 10)) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Ville: ${client.city || 'null'}`);
        console.log(`     Secteur: ${client.sector || 'null'}`);
        console.log('');
      }
    }

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

findClientsWithCoordsButNoCitySector();

