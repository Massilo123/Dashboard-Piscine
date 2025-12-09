/**
 * Script pour corriger les 8 clients de Montréal sans district
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

async function fixMissingMontrealDistricts() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Trouver les clients de Montréal sans district
    const clientsWithoutDistrict = await Client.find({
      $and: [
        {
          $or: [
            { sector: { $regex: /^montréal$/i } },
            { city: { $regex: /^montréal$/i } }
          ]
        },
        {
          $or: [
            { district: { $exists: false } },
            { district: null },
            { district: '' }
          ]
        }
      ]
    }).lean();

    console.log(`📊 Clients de Montréal sans district: ${clientsWithoutDistrict.length}\n`);

    let fixed = 0;
    let errors = 0;

    for (const client of clientsWithoutDistrict) {
      try {
        console.log(`🔍 ${client.givenName} ${client.familyName || ''}: ${client.addressLine1}`);
        
        const result = await geocodeAndExtractLocation(client._id.toString());
        
        if (result.success && result.district) {
          console.log(`✅ ${client.givenName}: ${result.city} (${result.district}) [${result.sector}]`);
          fixed++;
        } else {
          console.log(`⚠️  ${client.givenName}: District non trouvé`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ Erreur pour ${client.givenName}:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Correction terminée:`);
    console.log(`   ${fixed} client(s) corrigé(s)`);
    console.log(`   ${errors} erreur(s)`);

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixMissingMontrealDistricts();

