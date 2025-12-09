/**
 * Script pour corriger les clients de Laval qui ont des districts non principaux
 * en utilisant le code postal et HERE API pour trouver leur vrai district
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { getLavalDistrictFromPostalCode, VALID_LAVAL_DISTRICTS } from '../config/districts';

// Districts non principaux à corriger
const INVALID_DISTRICTS = [
  'Champ-Fleuri',
  'champ-fleuri',
  'champ fleuri',
  'Plage-Idéale',
  'plage-idéale',
  'plage idéale',
  'Plage-Jacques-Cartier',
  'plage-jacques-cartier',
  'plage jacques cartier',
  'Renaud',
  'renaud',
  'Bélanger',
  'bélanger',
  'Saraguay',
  'saraguay',
  'St-Martin',
  'st-martin',
  'st martin',
  'saint-martin',
  'saint martin',
  'Val-des-Arbres',
  'val-des-arbres',
  'val des arbres',
  'Val-des-Brises',
  'val-des-brises',
  'val des brises',
  'Laval-sur-le-Lac',
  'laval-sur-le-lac',
  'laval sur le lac',
  'Souvenir',
  'souvenir',
  'Vieux-Saint-Martin',
  'vieux-saint-martin',
  'vieux saint martin',
  'Saint-Laurent',
  'saint-laurent',
  'st-laurent',
  'st laurent'
];

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

// Fonction pour extraire le code postal d'une adresse
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

async function fixInvalidLavalDistricts() {
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

    // Trouver tous les clients de Laval avec des districts non principaux
    const invalidClients = await Client.find({
      city: { $regex: /^laval$/i },
      district: { $in: INVALID_DISTRICTS }
    }).lean();
    
    console.log(`\n📊 Clients de Laval avec districts non principaux: ${invalidClients.length}`);
    
    if (invalidClients.length === 0) {
      console.log('✅ Aucun client à corriger');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n🔄 Correction en cours...\n`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const errorsList: Array<{ clientId: string; name: string; oldDistrict: string; error: string }> = [];
    const updates: Array<{ name: string; oldDistrict: string; newDistrict: string; postalCode: string }> = [];

    for (let i = 0; i < invalidClients.length; i++) {
      const client = invalidClients[i];
      const progress = `[${i + 1}/${invalidClients.length}]`;
      
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
        const newDistrict = getLavalDistrictFromPostalCode(postalCode);

        if (newDistrict && VALID_LAVAL_DISTRICTS.has(newDistrict)) {
          await Client.updateOne(
            { _id: client._id },
            { $set: { district: newDistrict } }
          );
          const oldDistrict = client.district || 'N/A';
          console.log(`${progress} ✅ ${client.givenName} ${client.familyName || ''}: "${oldDistrict}" -> "${newDistrict}" (${postalCode})`);
          updates.push({
            name: `${client.givenName} ${client.familyName || ''}`,
            oldDistrict: oldDistrict,
            newDistrict: newDistrict,
            postalCode: postalCode
          });
          updated++;
        } else {
          console.log(`${progress} ⚠️  ${client.givenName} ${client.familyName || ''}: Code postal ${postalCode} ne correspond à aucun district principal`);
          notFound++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`${progress} ❌ Erreur pour ${client.givenName} ${client.familyName || ''}:`, errorMsg);
        errorsList.push({ 
          clientId: client._id.toString(), 
          name: `${client.givenName} ${client.familyName || ''}`,
          oldDistrict: client.district || 'N/A',
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

    if (updates.length > 0) {
      console.log(`\n✅ Corrections effectuées:`);
      updates.forEach(u => {
        console.log(`   - ${u.name}: "${u.oldDistrict}" -> "${u.newDistrict}" (${u.postalCode})`);
      });
    }

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
fixInvalidLavalDistricts();

