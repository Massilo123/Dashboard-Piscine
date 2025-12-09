/**
 * Script pour re-géocoder les clients de Laval sans district en utilisant HERE API
 * pour obtenir leur code postal et déterminer le district
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { getLavalDistrictFromPostalCode } from '../config/districts';

// Fonction pour extraire le code postal d'une adresse (améliorée)
function extractPostalCodeFromAddress(address: string): string | undefined {
  if (!address) return undefined;
  
  const patterns = [
    /\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i,
    /\b([A-Z]\d[A-Z])\s*(\d[A-Z]\d)\b/i,
    /([A-Z]\d[A-Z]\d[A-Z]\d)/i,
    /laval\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i,
    /([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s*laval/i,
    /([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s*QC/i,
    /QC\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i
  ];
  
  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      const postalCode = match[1] || match[0];
      if (postalCode) {
        const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
        if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
          return cleaned;
        }
      }
    }
  }
  
  return undefined;
}

// Fonction pour extraire le code postal depuis le label HERE API
function extractPostalCodeFromLabel(label: string): string | undefined {
  const patterns = [
    /\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i,
    /([A-Z]\d[A-Z]\d[A-Z]\d)/i
  ];
  
  for (const pattern of patterns) {
    const match = label.match(pattern);
    if (match) {
      const postalCode = match[1] || match[0];
      if (postalCode) {
        const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
        if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
          return cleaned;
        }
      }
    }
  }
  
  return undefined;
}

async function regeocodeLavalClientsWithoutDistrict() {
  try {
    // Charger les variables d'environnement
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini dans les variables d\'environnement');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      throw new Error('HERE_API_KEY non défini dans les variables d\'environnement');
    }

    // Trouver tous les clients de Laval sans district
    const allLavalClients = await Client.find({
      $or: [
        { city: { $regex: /^laval$/i } },
        { city: 'Laval' },
        { city: 'laval' }
      ]
    }).lean();
    
    const lavalClients = allLavalClients.filter(client => 
      !client.district || client.district.trim() === ''
    );
    
    console.log(`\n📊 Total clients de Laval: ${allLavalClients.length}`);
    console.log(`📊 Clients de Laval sans district: ${lavalClients.length}`);
    console.log(`\n🔄 Re-géocodage avec HERE API...\n`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const errorsList: Array<{ clientId: string; name: string; error: string }> = [];

    for (let i = 0; i < lavalClients.length; i++) {
      const client = lavalClients[i];
      const progress = `[${i + 1}/${lavalClients.length}]`;
      
      try {
        if (!client.addressLine1 || client.addressLine1.trim() === '') {
          console.log(`${progress} ⚠️  ${client.givenName} ${client.familyName || ''}: Pas d'adresse`);
          notFound++;
          continue;
        }

        // D'abord essayer d'extraire le code postal de l'adresse
        let postalCode = extractPostalCodeFromAddress(client.addressLine1);
        
        // Si pas trouvé, utiliser HERE API
        if (!postalCode) {
          console.log(`${progress} 🔍 ${client.givenName} ${client.familyName || ''}: Géocodage avec HERE API...`);
          
          const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(client.addressLine1)}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
          const response = await fetch(url);
          
          if (!response.ok) {
            if (response.status === 429) {
              console.log(`${progress} ⚠️  Rate limit atteint, attente de 2 secondes...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              i--; // Réessayer ce client
              continue;
            }
            throw new Error(`HERE API error: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.items && data.items.length > 0) {
            const addressData = data.items[0].address;
            
            // Essayer d'obtenir le code postal depuis la réponse HERE
            postalCode = addressData.postalCode;
            if (!postalCode && addressData.label) {
              postalCode = extractPostalCodeFromLabel(addressData.label);
            }
          }
          
          // Petite pause pour éviter le rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!postalCode) {
          console.log(`${progress} ⚠️  ${client.givenName} ${client.familyName || ''}: Code postal non trouvé`);
          notFound++;
          continue;
        }

        // Obtenir le district depuis le code postal
        const district = getLavalDistrictFromPostalCode(postalCode);

        if (district) {
          await Client.updateOne(
            { _id: client._id },
            { $set: { district: district } }
          );
          console.log(`${progress} ✅ ${client.givenName} ${client.familyName || ''}: ${postalCode} -> ${district}`);
          updated++;
        } else {
          console.log(`${progress} ⚠️  ${client.givenName} ${client.familyName || ''}: Code postal ${postalCode} non reconnu`);
          notFound++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`${progress} ❌ Erreur pour ${client.givenName} ${client.familyName || ''}:`, errorMsg);
        errorsList.push({ 
          clientId: client._id.toString(), 
          name: `${client.givenName} ${client.familyName || ''}`,
          error: errorMsg 
        });
        errors++;
        
        // Si erreur de rate limit, attendre plus longtemps
        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          console.log('⏳ Attente de 5 secondes avant de continuer...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ Mis à jour: ${updated}`);
    console.log(`   ⚠️  Non trouvé: ${notFound}`);
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

// Exécuter le script
regeocodeLavalClientsWithoutDistrict();

