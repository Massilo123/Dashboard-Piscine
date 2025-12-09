/**
 * Script pour déboguer les clients Hakam et BOUCHER et voir ce que HERE API retourne
 */

import mongoose from 'mongoose';
import Client from '../models/Client';

async function debugHakamBoucher() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      throw new Error('HERE_API_KEY non défini');
    }

    // Trouver les clients
    const clients = await Client.find({
      $or: [
        { givenName: /hakam/i },
        { givenName: /boucher/i }
      ]
    }).lean();

    console.log(`\n📊 Clients trouvés: ${clients.length}\n`);

    for (const client of clients) {
      console.log(`📋 Client: ${client.givenName} ${client.familyName || ''}`);
      console.log(`   Adresse: ${client.addressLine1}`);
      console.log(`   Ville: "${client.city || 'N/A'}"`);
      console.log(`   Secteur: "${client.sector || 'N/A'}"`);
      console.log(`   District: "${client.district || 'N/A'}"`);
      console.log('');
      
      // Appeler HERE API pour voir ce qu'il retourne
      console.log(`🔍 Appel HERE API pour: ${client.addressLine1}`);
      const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(client.addressLine1 || '')}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          const addressData = data.items[0].address;
          console.log(`   📍 Réponse HERE API:`);
          console.log(`      - city: "${addressData.city || 'N/A'}"`);
          console.log(`      - county: "${addressData.county || 'N/A'}"`);
          console.log(`      - district: "${addressData.district || 'N/A'}"`);
          console.log(`      - subdistrict: "${addressData.subdistrict || 'N/A'}"`);
          console.log(`      - postalCode: "${addressData.postalCode || 'N/A'}"`);
          console.log(`      - label: "${addressData.label || 'N/A'}"`);
          console.log(`      - street: "${addressData.street || 'N/A'}"`);
          console.log(`      - additionalData:`, JSON.stringify(addressData.additionalData || {}, null, 2));
        } else {
          console.log(`   ❌ Aucun résultat HERE API`);
        }
      } else {
        console.log(`   ❌ Erreur HERE API: ${response.status} ${response.statusText}`);
      }
      console.log('');
    }

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

debugHakamBoucher();

