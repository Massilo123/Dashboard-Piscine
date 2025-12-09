// Script pour comparer les résultats des routes /for-map et /by-city
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function compareRoutes() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Filtre de la route /for-map
    const clientsForMap = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    // Filtre de la route /by-city (clients avec adresse)
    const clientsByCityWithAddress = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    // Clients sans adresse
    const clientsByCityWithoutAddress = await Client.find({
      $or: [
        { addressLine1: { $exists: false } },
        { addressLine1: '' },
        { addressLine1: null }
      ]
    }).lean();

    const totalByCity = clientsByCityWithAddress.length + clientsByCityWithoutAddress.length;

    console.log('📊 Comparaison des routes:');
    console.log(`   /for-map: ${clientsForMap.length} clients`);
    console.log(`   /by-city (avec adresse): ${clientsByCityWithAddress.length} clients`);
    console.log(`   /by-city (sans adresse): ${clientsByCityWithoutAddress.length} clients`);
    console.log(`   /by-city (total): ${totalByCity} clients\n`);

    // Trouver les clients qui sont dans /for-map mais pas dans /by-city
    const mapClientIds = new Set(clientsForMap.map(c => c._id.toString()));
    const byCityClientIds = new Set([
      ...clientsByCityWithAddress.map(c => c._id.toString()),
      ...clientsByCityWithoutAddress.map(c => c._id.toString())
    ]);

    const missingInByCity: any[] = [];
    for (const client of clientsForMap) {
      const clientId = client._id.toString();
      if (!byCityClientIds.has(clientId)) {
        missingInByCity.push(client);
      }
    }

    console.log(`⚠️  Clients dans /for-map mais PAS dans /by-city: ${missingInByCity.length}\n`);

    if (missingInByCity.length > 0) {
      console.log('📋 Détails des clients manquants:');
      for (const client of missingInByCity.slice(0, 10)) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: ${client.city || 'N/A'}`);
        console.log(`     Secteur: ${client.sector || 'N/A'}`);
        console.log(`     Coordonnées: ${client.coordinates ? 'Oui' : 'Non'}`);
        console.log('');
      }
      if (missingInByCity.length > 10) {
        console.log(`   ... et ${missingInByCity.length - 10} autres\n`);
      }

      // Analyser pourquoi ils sont manquants
      const withoutAddress = missingInByCity.filter(c => !c.addressLine1 || c.addressLine1.trim() === '');
      console.log(`   - ${withoutAddress.length} client(s) sans adresse`);
      console.log(`   - ${missingInByCity.length - withoutAddress.length} client(s) avec adresse mais manquants\n`);
    }

    // Trouver les clients qui ont des coordonnées mais pas d'adresse
    const clientsWithCoordsButNoAddress = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null },
      $or: [
        { addressLine1: { $exists: false } },
        { addressLine1: '' },
        { addressLine1: null }
      ]
    }).lean();

    console.log(`📊 Clients avec coordonnées + ville + secteur mais SANS adresse: ${clientsWithCoordsButNoAddress.length}`);
    if (clientsWithCoordsButNoAddress.length > 0) {
      console.log('   Ces clients apparaissent sur la carte mais pas dans /by-city car ils n\'ont pas d\'adresse\n');
    }

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

compareRoutes();

