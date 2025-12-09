/**
 * Script pour trouver les 8 clients de Montréal manquants dans la page "Clients par Ville"
 */

import mongoose from 'mongoose';
import Client from '../models/Client';

async function findMissingMontrealClients() {
  try {
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI non défini');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Compter tous les clients
    const totalClients = await Client.countDocuments({});
    console.log(`📊 Total clients dans MongoDB: ${totalClients}`);

    // Trouver tous les clients de Montréal
    const montrealClients = await Client.find({
      $or: [
        { sector: { $regex: /^montréal$/i } },
        { city: { $regex: /^montréal$/i } }
      ]
    }).lean();

    console.log(`📊 Clients avec secteur ou ville = Montréal: ${montrealClients.length}`);

    // Analyser les clients de Montréal
    const clientsWithDistrict = montrealClients.filter(c => c.district && c.district.trim() !== '');
    const clientsWithoutDistrict = montrealClients.filter(c => !c.district || c.district.trim() === '');

    console.log(`\n📊 Analyse des clients de Montréal:`);
    console.log(`   ✅ Avec district: ${clientsWithDistrict.length}`);
    console.log(`   ⚠️  Sans district: ${clientsWithoutDistrict.length}`);

    if (clientsWithoutDistrict.length > 0) {
      console.log(`\n📋 Clients de Montréal SANS district:`);
      clientsWithoutDistrict.forEach((client, index) => {
        console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: "${client.city || 'N/A'}"`);
        console.log(`     Secteur: "${client.sector || 'N/A'}"`);
        console.log(`     District: "${client.district || 'N/A'}"`);
        console.log(`     Coordonnées: ${client.coordinates ? `${client.coordinates.lat}, ${client.coordinates.lng}` : 'N/A'}`);
        console.log('');
      });
    }

    // Compter les clients par district
    const districtCounts: Record<string, number> = {};
    montrealClients.forEach(client => {
      const district = client.district || 'Sans district';
      districtCounts[district] = (districtCounts[district] || 0) + 1;
    });

    console.log(`\n📊 Répartition par district:`);
    Object.entries(districtCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([district, count]) => {
        console.log(`   ${district}: ${count} client(s)`);
      });

    // Vérifier les clients qui ont des coordonnées mais ne sont peut-être pas classés
    const clientsWithCoordinates = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true, $ne: null },
      'coordinates.lat': { $exists: true, $ne: null }
    }).lean();

    console.log(`\n📊 Clients avec coordonnées: ${clientsWithCoordinates.length}`);

    // Trouver les clients qui ont des coordonnées mais ne sont pas dans Montréal
    const clientsWithCoordsButNotMontreal = clientsWithCoordinates.filter(c => {
      const sector = c.sector?.toLowerCase() || '';
      const city = c.city?.toLowerCase() || '';
      return sector !== 'montréal' && city !== 'montréal' && city !== 'montreal';
    });

    // Vérifier si certains de ces clients devraient être de Montréal
    const potentialMontrealClients = clientsWithCoordsButNotMontreal.filter(c => {
      if (!c.addressLine1) return false;
      const addressLower = c.addressLine1.toLowerCase();
      const montrealKeywords = [
        'kirkland', 'dollard', 'pierrefonds', 'dorval', 'pointe-claire',
        'beaconsfield', 'westmount', 'outremont', 'côte-saint-luc',
        'hampstead', 'mont-royal', 'baie-d\'urfé', 'ile-bizard'
      ];
      return montrealKeywords.some(keyword => addressLower.includes(keyword));
    });

    if (potentialMontrealClients.length > 0) {
      console.log(`\n⚠️  Clients avec coordonnées qui pourraient être de Montréal:`);
      potentialMontrealClients.forEach((client, index) => {
        console.log(`  ${index + 1}. ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Adresse: ${client.addressLine1 || 'N/A'}`);
        console.log(`     Ville: "${client.city || 'N/A'}"`);
        console.log(`     Secteur: "${client.sector || 'N/A'}"`);
        console.log(`     District: "${client.district || 'N/A'}"`);
        console.log('');
      });
    }

    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

findMissingMontrealClients();

