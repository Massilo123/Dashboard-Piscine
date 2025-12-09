/**
 * Script pour mettre à jour les districts de Laval en utilisant les codes postaux
 * Ce script trouve tous les clients de Laval sans district et essaie de déterminer
 * le district à partir de leur code postal (extrait de l'adresse ou depuis MongoDB)
 */

import mongoose from 'mongoose';
import Client from '../models/Client';
import { getLavalDistrictFromPostalCode } from '../config/districts';

// Fonction pour extraire le code postal d'une adresse (améliorée)
function extractPostalCodeFromAddress(address: string): string | undefined {
  if (!address) return undefined;
  
  // Pattern pour code postal canadien: A1A 1A1 ou A1A1A1
  // Essayer plusieurs patterns pour être plus flexible
  const patterns = [
    /\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i,  // Format standard: H7W 5G2 ou H7W5G2
    /\b([A-Z]\d[A-Z])\s*(\d[A-Z]\d)\b/i, // Format avec espace: H7W 5G2
    /([A-Z]\d[A-Z]\d[A-Z]\d)/i,          // Format sans espace: H7W5G2
    /laval\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i, // Code postal après "laval"
    /([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s*laval/i, // Code postal avant "laval"
    /([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s*QC/i,   // Code postal avant "QC"
    /QC\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i    // Code postal après "QC"
  ];
  
  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      // Prendre le premier groupe de capture ou le match complet
      const postalCode = match[1] || match[0];
      if (postalCode) {
        // Nettoyer et normaliser
        const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
        // Vérifier que c'est un code postal valide (6 caractères, format A1A1A1)
        if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
          return cleaned;
        }
      }
    }
  }
  
  return undefined;
}

async function fixLavalDistrictsFromPostalCode() {
  try {
    // Connexion à MongoDB (utiliser la même méthode que index.ts)
    // Charger les variables d'environnement
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini dans les variables d\'environnement');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Trouver tous les clients de Laval
    const allLavalClients = await Client.find({
      $or: [
        { city: { $regex: /^laval$/i } },
        { city: 'Laval' },
        { city: 'laval' }
      ]
    }).lean();
    
    // Filtrer ceux sans district
    const lavalClients = allLavalClients.filter(client => 
      !client.district || client.district.trim() === ''
    );
    
    console.log(`\n📊 Total clients de Laval: ${allLavalClients.length}`);
    console.log(`📊 Clients de Laval sans district: ${lavalClients.length}`);

    let updated = 0;
    let notFound = 0;
    const errors: Array<{ clientId: string; error: string }> = [];

    for (const client of lavalClients) {
      try {
        // Essayer d'extraire le code postal de l'adresse
        let postalCode: string | undefined;
        
        if (client.addressLine1) {
          postalCode = extractPostalCodeFromAddress(client.addressLine1);
        }

        if (!postalCode) {
          console.log(`⚠️  Pas de code postal trouvé pour ${client.givenName} ${client.familyName || ''} (${client._id})`);
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
          console.log(`✅ ${client.givenName} ${client.familyName || ''}: ${postalCode} -> ${district}`);
          updated++;
        } else {
          console.log(`⚠️  Code postal ${postalCode} non reconnu pour ${client.givenName} ${client.familyName || ''}`);
          notFound++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`❌ Erreur pour client ${client._id}:`, errorMsg);
        errors.push({ clientId: client._id.toString(), error: errorMsg });
      }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ Mis à jour: ${updated}`);
    console.log(`   ⚠️  Non trouvé: ${notFound}`);
    console.log(`   ❌ Erreurs: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`\n❌ Erreurs détaillées:`);
      errors.forEach(e => console.log(`   - ${e.clientId}: ${e.error}`));
    }

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

// Exécuter le script
fixLavalDistrictsFromPostalCode();

