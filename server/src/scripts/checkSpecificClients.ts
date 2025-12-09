/**
 * Script pour vérifier des clients spécifiques et comprendre pourquoi ils ne sont pas classés
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

async function checkSpecificClients() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Chercher les clients spécifiques
    const clients = await Client.find({
      $or: [
        { givenName: /hakam/i },
        { givenName: /boucher/i },
        { addressLine1: /nelligan/i },
        { addressLine1: /cercle green/i }
      ]
    }).lean();

    console.log(`\n📊 Clients trouvés: ${clients.length}\n`);

    for (const client of clients) {
      console.log(`📋 Client: ${client.givenName} ${client.familyName || ''}`);
      console.log(`   Adresse: ${client.addressLine1 || 'N/A'}`);
      console.log(`   Ville: "${client.city || 'N/A'}"`);
      console.log(`   Secteur: "${client.sector || 'N/A'}"`);
      console.log(`   District: "${client.district || 'N/A'}"`);
      console.log(`   Coordonnées: ${client.coordinates ? `${client.coordinates.lat}, ${client.coordinates.lng}` : 'N/A'}`);
      console.log('');
    }

    // Re-géocoder ces clients
    console.log(`\n🔄 Re-géocodage en cours...\n`);

    for (const client of clients) {
      try {
        console.log(`🔍 ${client.givenName} ${client.familyName || ''}: ${client.addressLine1}`);
        
        const result = await geocodeAndExtractLocation(client._id.toString());
        
        if (result.success) {
          console.log(`✅ ${client.givenName} ${client.familyName || ''}: ${result.city || 'N/A'}${result.district ? ` (${result.district})` : ''} [${result.sector || 'N/A'}]`);
        } else {
          console.log(`❌ ${client.givenName} ${client.familyName || ''}: ${result.error || 'Erreur inconnue'}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ Erreur pour ${client.givenName}:`, error);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkSpecificClients();

