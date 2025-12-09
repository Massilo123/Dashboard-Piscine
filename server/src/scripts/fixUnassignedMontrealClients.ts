/**
 * Script pour re-géocoder les clients non assignés qui sont probablement de Montréal
 * (comme ceux avec "Kirkland", "Dollard-des-Ormeaux", "Pierrefonds" dans leur adresse)
 * et les classer correctement sous Montréal avec leur district
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { geocodeAndExtractLocation } from '../utils/geocodeAndExtractLocation';

async function fixUnassignedMontrealClients() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Trouver les clients qui ont des indices qu'ils sont de Montréal mais ne sont pas classés
    // 1. Clients avec "kirkland", "dollard", "pierrefonds" dans l'adresse mais pas de city/sector
    const montrealKeywords = [
      'kirkland',
      'dollard',
      'pierrefonds',
      'roxboro',
      'dorval',
      'pointe-claire',
      'beaconsfield',
      'westmount',
      'outremont',
      'côte-saint-luc',
      'hampstead',
      'mont-royal',
      'baie-d\'urfé'
    ];

    // Trouver les clients qui ont ces mots-clés dans l'adresse mais ne sont pas classés comme Montréal
    const unassignedClients = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      $or: [
        { city: { $exists: false } },
        { city: null },
        { city: '' },
        { city: { $nin: ['Montréal', 'Montreal', 'montréal', 'montreal'] } },
        { sector: { $exists: false } },
        { sector: null },
        { sector: '' },
        { sector: { $ne: 'Montréal' } }
      ]
    }).lean();

    console.log(`\n📊 Clients potentiellement non classés: ${unassignedClients.length}`);

    // Filtrer ceux qui ont des mots-clés de Montréal dans l'adresse
    const montrealClients = unassignedClients.filter(client => {
      if (!client.addressLine1) return false;
      const addressLower = client.addressLine1.toLowerCase();
      return montrealKeywords.some(keyword => addressLower.includes(keyword));
    });

    console.log(`📊 Clients avec mots-clés Montréal dans l'adresse: ${montrealClients.length}`);

    if (montrealClients.length === 0) {
      console.log('✅ Aucun client à corriger');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n🔄 Re-géocodage en cours...\n`);

    let updated = 0;
    let errors = 0;
    const errorsList: Array<{ clientId: string; name: string; error: string }> = [];

    for (let i = 0; i < montrealClients.length; i++) {
      const client = montrealClients[i];
      const progress = `[${i + 1}/${montrealClients.length}]`;
      
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

fixUnassignedMontrealClients();

