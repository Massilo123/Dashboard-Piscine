// Script pour trouver les clients qui devraient être dans /by-city mais qui n'y sont pas
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function findMissingClients() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Total de clients dans la base
    const totalClients = await Client.countDocuments();
    console.log(`📊 Total de clients dans MongoDB: ${totalClients}\n`);

    // Clients avec coordonnées (pour la carte)
    const clientsWithCoords = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true }
    }).lean();
    console.log(`📍 Clients avec coordonnées: ${clientsWithCoords.length}`);

    // Clients avec ville ET secteur (pour /by-city)
    const clientsWithCityAndSector = await Client.find({
      city: { $exists: true, $nin: [null, ''] },
      sector: { $exists: true, $nin: [null, ''] }
    }).lean();
    console.log(`🏙️  Clients avec ville ET secteur: ${clientsWithCityAndSector.length}`);

    // Clients avec coordonnées MAIS sans ville ou secteur
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
    console.log(`⚠️  Clients avec coordonnées MAIS sans ville/secteur: ${clientsWithCoordsButNoCitySector.length}`);

    // Clients avec ville/secteur MAIS sans coordonnées
    const clientsWithCitySectorButNoCoords = await Client.find({
      city: { $exists: true, $nin: [null, ''] },
      sector: { $exists: true, $nin: [null, ''] },
      $or: [
        { coordinates: { $exists: false } },
        { 'coordinates.lng': { $exists: false } },
        { 'coordinates.lat': { $exists: false } }
      ]
    }).lean();
    console.log(`⚠️  Clients avec ville/secteur MAIS sans coordonnées: ${clientsWithCitySectorButNoCoords.length}\n`);

    // Clients qui devraient être dans /by-city (avec adresse + ville + secteur)
    const shouldBeInByCity = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      city: { $exists: true, $nin: [null, ''] },
      sector: { $exists: true, $nin: [null, ''] }
    }).lean();
    console.log(`✅ Clients qui DEVRAIENT être dans /by-city (avec adresse): ${shouldBeInByCity.length}`);

    // Clients qui sont actuellement dans /by-city
    const currentlyInByCity = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();
    console.log(`📋 Clients actuellement dans /by-city: ${currentlyInByCity.length}\n`);

    // Différence
    const difference = shouldBeInByCity.length - currentlyInByCity.length;
    if (difference !== 0) {
      console.log(`⚠️  DIFFÉRENCE: ${difference} client(s) manquant(s)\n`);
    } else {
      console.log(`✅ Aucune différence détectée\n`);
    }

    // Afficher quelques exemples de clients avec coordonnées mais sans ville/secteur
    if (clientsWithCoordsButNoCitySector.length > 0) {
      console.log('📋 Exemples de clients avec coordonnées mais sans ville/secteur:');
      for (const client of clientsWithCoordsButNoCitySector.slice(0, 5)) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: ${client.city || 'null'}`);
        console.log(`     Secteur: ${client.sector || 'null'}`);
        console.log('');
      }
    }

    // Afficher quelques exemples de clients avec ville/secteur mais sans coordonnées
    if (clientsWithCitySectorButNoCoords.length > 0) {
      console.log('📋 Exemples de clients avec ville/secteur mais sans coordonnées:');
      for (const client of clientsWithCitySectorButNoCoords.slice(0, 5)) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: ${client.city || 'N/A'}`);
        console.log(`     Secteur: ${client.sector || 'N/A'}`);
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

findMissingClients();

