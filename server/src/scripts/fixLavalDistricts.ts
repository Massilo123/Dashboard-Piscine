// Script pour corriger les clients qui ont "Le Val-St-François" ou autres districts de Laval comme ville
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

dotenv.config();

async function fixLavalDistricts() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Trouver tous les clients qui ont un district de Laval comme ville
    const lavalDistricts = [
      'le val-st-françois', 'le val-st-francois', 'le val st-françois', 'le val st-francois',
      'val-st-françois', 'val-st-francois', 'val st-françois', 'val st-francois',
      'saint-françois', 'saint françois', 'saint-francois', 'saint francois',
      'st-françois', 'st françois', 'st-francois', 'st francois',
      'auteuil', 'chomedey', 'duvernay', 'fabreville', 'iles-laval', 'laval-des-rapides',
      'laval-ouest', 'pont-viau', 'sainte-dorothée', 'sainte-rose', 'vimont'
    ];

    const clientsToFix = await Client.find({
      city: { $in: lavalDistricts.map(d => new RegExp(d, 'i')) },
      addressLine1: { $exists: true, $ne: '' }
    });

    console.log(`\n📊 ${clientsToFix.length} client(s) à corriger\n`);

    if (clientsToFix.length === 0) {
      console.log('✅ Aucun client à corriger');
      await mongoose.disconnect();
      return;
    }

    let corrected = 0;
    let errors = 0;

    for (const client of clientsToFix) {
      try {
        console.log(`\n🔄 Correction de: ${client.givenName} ${client.familyName || ''}`);
        console.log(`   Ville actuelle: ${client.city}`);
        console.log(`   Secteur actuel: ${client.sector}`);
        console.log(`   Adresse: ${client.addressLine1}`);

        // Re-géocoder pour corriger la ville et le secteur
        const result = await geocodeAndExtractLocation(client._id.toString());

        if (result.success) {
          const updatedClient = await Client.findById(client._id).lean();
          console.log(`   ✅ Corrigé: ${updatedClient?.city}${updatedClient?.district ? ` (${updatedClient.district})` : ''} [${updatedClient?.sector}]`);
          corrected++;
        } else {
          console.log(`   ❌ Erreur: ${result.error}`);
          errors++;
        }

        // Attendre un peu pour éviter de surcharger l'API HERE
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`   ❌ Erreur lors de la correction:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Correction terminée:`);
    console.log(`   - ${corrected} client(s) corrigé(s)`);
    console.log(`   - ${errors} erreur(s)`);

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixLavalDistricts();

