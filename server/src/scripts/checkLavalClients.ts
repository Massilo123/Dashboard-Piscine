/**
 * Script pour vérifier comment les clients de Laval sont stockés dans MongoDB
 */

import mongoose from 'mongoose';
import Client from '../models/Client';

async function checkLavalClients() {
  try {
    // Charger les variables d'environnement
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini dans les variables d\'environnement');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Compter tous les clients
    const totalClients = await Client.countDocuments({});
    console.log(`📊 Total clients dans la base: ${totalClients}`);

    // Chercher tous les clients avec "laval" dans la ville (insensible à la casse)
    const lavalClients = await Client.find({
      city: { $regex: /laval/i }
    }).limit(10).lean();

    console.log(`\n📊 Clients avec "laval" dans la ville (échantillon de 10):`);
    lavalClients.forEach((client, index) => {
      console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''} - Ville: "${client.city}" - District: "${client.district || 'N/A'}"`);
    });

    // Compter les clients par ville (top 10)
    const cities = await Client.aggregate([
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    console.log(`\n📊 Top 10 villes par nombre de clients:`);
    cities.forEach((city, index) => {
      console.log(`  ${index + 1}. ${city._id || 'N/A'}: ${city.count} clients`);
    });

    // Chercher les clients avec secteur = Laval
    const lavalSectorClients = await Client.find({
      sector: { $regex: /^laval$/i }
    }).limit(10).lean();

    console.log(`\n📊 Clients avec secteur = "Laval" (échantillon de 10):`);
    lavalSectorClients.forEach((client, index) => {
      console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''} - Ville: "${client.city || 'N/A'}" - District: "${client.district || 'N/A'}"`);
    });

    const lavalSectorCount = await Client.countDocuments({
      sector: { $regex: /^laval$/i }
    });
    console.log(`\n📊 Total clients avec secteur = "Laval": ${lavalSectorCount}`);

    // Compter les clients de Laval sans district
    const lavalWithoutDistrict = await Client.find({
      sector: { $regex: /^laval$/i },
      $or: [
        { district: { $exists: false } },
        { district: null },
        { district: '' }
      ]
    }).limit(10).lean();

    console.log(`\n📊 Clients de Laval (secteur) sans district (échantillon de 10):`);
    lavalWithoutDistrict.forEach((client, index) => {
      console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''} - Ville: "${client.city || 'N/A'}" - Adresse: "${client.addressLine1 || 'N/A'}"`);
    });

    const lavalWithoutDistrictCount = await Client.countDocuments({
      sector: { $regex: /^laval$/i },
      $or: [
        { district: { $exists: false } },
        { district: null },
        { district: '' }
      ]
    });
    console.log(`\n📊 Total clients de Laval (secteur) sans district: ${lavalWithoutDistrictCount}`);

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkLavalClients();

