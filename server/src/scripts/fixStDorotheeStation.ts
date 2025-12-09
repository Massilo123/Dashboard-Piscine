/**
 * Script pour normaliser "St-Dorothée-Station" vers "Sainte-Dorothée"
 */

import mongoose from 'mongoose';
import Client from '../models/Client';

async function fixStDorotheeStation() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Trouver tous les clients avec St-Dorothée-Station
    const clients = await Client.find({
      district: { $regex: /st-dorothée-station|st dorothée station|st-dorothee-station|st dorothee station/i }
    }).lean();

    console.log(`\n📊 Clients avec St-Dorothée-Station: ${clients.length}`);

    if (clients.length === 0) {
      console.log('✅ Aucun client à corriger');
      await mongoose.disconnect();
      return;
    }

    let updated = 0;
    for (const client of clients) {
      await Client.updateOne(
        { _id: client._id },
        { $set: { district: 'Sainte-Dorothée' } }
      );
      console.log(`✅ ${client.givenName} ${client.familyName || ''}: "${client.district}" -> "Sainte-Dorothée"`);
      updated++;
    }

    console.log(`\n📊 Résumé: ${updated} client(s) mis à jour`);
    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixStDorotheeStation();

