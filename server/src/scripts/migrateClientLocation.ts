// Script de migration pour remplir city, district, sector pour les clients existants
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

dotenv.config();

async function migrateClients() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connecté à MongoDB');

    // Récupérer tous les clients qui n'ont pas city ou sector
    const clientsToMigrate = await Client.find({
      $or: [
        { city: { $exists: false } },
        { city: null },
        { city: '' },
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' }
      ],
      addressLine1: { $exists: true, $ne: '' }
    });

    console.log(`📊 ${clientsToMigrate.length} client(s) à migrer`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < clientsToMigrate.length; i++) {
      const client = clientsToMigrate[i];
      const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
      
      console.log(`\n[${i + 1}/${clientsToMigrate.length}] Traitement: ${clientName}`);
      console.log(`   Adresse: ${client.addressLine1}`);

      // Vérifier si le client a déjà des coordonnées
      const hasCoordinates = client.coordinates && 
        typeof client.coordinates === 'object' &&
        client.coordinates !== null &&
        'lng' in client.coordinates &&
        'lat' in client.coordinates &&
        client.coordinates.lng != null &&
        client.coordinates.lat != null;

      if (!hasCoordinates) {
        console.log(`   ⚠️  Pas de coordonnées, géocodage nécessaire...`);
      }

      try {
        const result = await geocodeAndExtractLocation(client._id.toString());
        
        if (result.success) {
          successCount++;
          console.log(`   ✅ Migré: ${result.city}${result.district ? ` (${result.district})` : ''} [${result.sector}]`);
        } else {
          failCount++;
          console.log(`   ❌ Échec: ${result.error}`);
        }

        // Délai pour éviter de surcharger l'API HERE (100ms entre chaque client)
        if (i < clientsToMigrate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        failCount++;
        console.error(`   ❌ Erreur:`, error);
      }
    }

    console.log(`\n📊 Résumé de la migration:`);
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ❌ Échecs: ${failCount}`);
    console.log(`   ⏭️  Ignorés: ${skippedCount}`);

    await mongoose.disconnect();
    console.log('\n✅ Migration terminée');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Lancer la migration
migrateClients();

