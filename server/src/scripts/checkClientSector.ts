// Script pour vérifier le secteur d'un client spécifique
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function checkClientSector() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Rechercher la cliente "Tahara"
    const client = await Client.findOne({
      $or: [
        { givenName: /tahara/i },
        { familyName: /tahara/i },
        { givenName: /tahara/i }
      ]
    }).lean();

    if (!client) {
      console.log('❌ Client "Tahara" non trouvé');
      await mongoose.disconnect();
      return;
    }

    console.log('\n📋 Informations du client:');
    console.log(`   ID: ${client._id}`);
    console.log(`   Nom: ${client.givenName} ${client.familyName || ''}`);
    console.log(`   Adresse: ${client.addressLine1 || 'N/A'}`);
    console.log(`   Ville (city): ${client.city || 'N/A'}`);
    console.log(`   District: ${client.district || 'N/A'}`);
    console.log(`   Secteur (sector): ${client.sector || 'N/A'}`);
    console.log(`   Coordonnées: ${client.coordinates ? `lng: ${(client.coordinates as any).lng}, lat: ${(client.coordinates as any).lat}` : 'N/A'}`);

    // Vérifier pourquoi elle est dans "Autres"
    if (!client.sector || client.sector === 'Autres') {
      console.log('\n⚠️ Problème détecté:');
      if (!client.sector) {
        console.log('   - Le champ "sector" est null/undefined');
      } else {
        console.log('   - Le champ "sector" est "Autres"');
      }
      
      if (client.city && client.city.toLowerCase().includes('laval')) {
        console.log('   - Mais la ville contient "Laval", donc le secteur devrait être "Laval"');
        console.log('\n💡 Solution: Exécuter le script de correction des secteurs');
      }
    } else {
      console.log(`\n✅ Le secteur est correctement défini: ${client.sector}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkClientSector();

