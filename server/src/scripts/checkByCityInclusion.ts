// Script pour vérifier si tous les clients avec ville/secteur sont inclus dans /by-city
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function checkByCityInclusion() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Tous les clients avec ville ET secteur
    const allClientsWithCitySector = await Client.find({
      city: { $exists: true, $nin: [null, ''] },
      sector: { $exists: true, $nin: [null, ''] }
    }).lean();

    console.log(`📊 Total clients avec ville ET secteur: ${allClientsWithCitySector.length}\n`);

    // Clients avec adresse (inclus dans /by-city)
    const clientsWithAddress = allClientsWithCitySector.filter(c => 
      c.addressLine1 && c.addressLine1.trim() !== ''
    );

    // Clients sans adresse (inclus dans /by-city sous "Sans adresse")
    const clientsWithoutAddress = allClientsWithCitySector.filter(c => 
      !c.addressLine1 || c.addressLine1.trim() === ''
    );

    console.log(`📊 Clients avec adresse: ${clientsWithAddress.length}`);
    console.log(`📊 Clients sans adresse: ${clientsWithoutAddress.length}`);
    console.log(`📊 Total dans /by-city: ${clientsWithAddress.length + clientsWithoutAddress.length}\n`);

    if (allClientsWithCitySector.length !== clientsWithAddress.length + clientsWithoutAddress.length) {
      console.log(`⚠️  PROBLÈME: Différence de ${allClientsWithCitySector.length - (clientsWithAddress.length + clientsWithoutAddress.length)} client(s)\n`);
    } else {
      console.log(`✅ Tous les clients avec ville/secteur sont inclus dans /by-city\n`);
    }

    // Vérifier les clients avec ville/secteur mais sans adresse qui ont des coordonnées
    const clientsWithoutAddressButWithCoords = clientsWithoutAddress.filter(c => 
      c.coordinates && 
      (c.coordinates as any).lng != null && 
      (c.coordinates as any).lat != null
    );

    console.log(`📊 Clients sans adresse mais avec coordonnées: ${clientsWithoutAddressButWithCoords.length}`);
    console.log(`   Ces clients apparaissent dans "Non assignés" -> "Sans adresse" dans /by-city\n`);

    // Comparer avec /for-map
    const clientsInForMap = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Clients dans /for-map: ${clientsInForMap.length}`);
    console.log(`📊 Clients dans /by-city (avec adresse): ${clientsWithAddress.length}`);
    console.log(`📊 Différence: ${clientsInForMap.length - clientsWithAddress.length}\n`);

    if (clientsInForMap.length > clientsWithAddress.length) {
      console.log(`⚠️  ${clientsInForMap.length - clientsWithAddress.length} client(s) sont dans /for-map mais pas dans /by-city (avec adresse)`);
      console.log(`   Ces clients sont probablement dans "Non assignés" -> "Sans adresse"\n`);
    }

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkByCityInclusion();

