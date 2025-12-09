/**
 * Script pour re-géocoder tous les clients actuellement dans "Sans quartier assigné"
 * et les classer correctement
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

async function fixAllUnassignedClients() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Trouver les clients qui sont probablement non assignés
    // (pas de city, pas de sector, ou city/sector vides)
    const unassignedClients = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      $or: [
        { city: { $exists: false } },
        { city: null },
        { city: '' },
        { city: { $in: ['Inconnu', 'Non traité'] } },
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' },
        { sector: { $ne: 'Montréal' } }
      ]
    }).limit(20).lean(); // Limiter à 20 pour ne pas surcharger l'API

    console.log(`\n📊 Clients potentiellement non assignés (limite 20): ${unassignedClients.length}`);

    if (unassignedClients.length === 0) {
      console.log('✅ Aucun client à corriger');
      await mongoose.disconnect();
      return;
    }

    // Afficher les clients trouvés
    console.log('\n📋 Clients trouvés:');
    unassignedClients.forEach((client, index) => {
      console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''} - ${client.addressLine1?.substring(0, 60)}`);
      console.log(`     Ville: "${client.city || 'N/A'}" - Secteur: "${client.sector || 'N/A'}" - District: "${client.district || 'N/A'}"`);
    });

    console.log(`\n🔄 Re-géocodage en cours...\n`);

    let updated = 0;
    let errors = 0;
    const errorsList: Array<{ clientId: string; name: string; error: string }> = [];

    for (let i = 0; i < unassignedClients.length; i++) {
      const client = unassignedClients[i];
      const progress = `[${i + 1}/${unassignedClients.length}]`;
      
      try {
        console.log(`${progress} 🔍 ${client.givenName} ${client.familyName || ''}: ${client.addressLine1?.substring(0, 50)}...`);
        
        const result = await geocodeAndExtractLocation(client._id.toString());
        
        if (result.success) {
          console.log(`${progress} ✅ ${client.givenName} ${client.familyName || ''}: ${result.city || 'N/A'}${result.district ? ` (${result.district})` : ''} [${result.sector || 'N/A'}]`);
          updated++;
        } else {
          console.log(`${progress} ⚠️  ${client.givenName} ${client.familyName || ''}: ${result.error || 'Erreur inconnue'}`);
          errors++;
          errorsList.push({
            clientId: client._id.toString(),
            name: `${client.givenName} ${client.familyName || ''}`,
            error: result.error || 'Erreur inconnue'
          });
        }
        
        // Petite pause pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`${progress} ❌ Erreur pour ${client.givenName} ${client.familyName || ''}:`, errorMsg);
        errors++;
        errorsList.push({
          clientId: client._id.toString(),
          name: `${client.givenName} ${client.familyName || ''}`,
          error: errorMsg
        });
        
        // Si erreur de rate limit, attendre plus longtemps
        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          console.log('⏳ Attente de 5 secondes avant de continuer...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ Mis à jour: ${updated}`);
    console.log(`   ❌ Erreurs: ${errors}`);

    if (errorsList.length > 0) {
      console.log(`\n❌ Erreurs détaillées:`);
      errorsList.forEach(e => console.log(`   - ${e.name} (${e.clientId}): ${e.error}`));
    }

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixAllUnassignedClients();

