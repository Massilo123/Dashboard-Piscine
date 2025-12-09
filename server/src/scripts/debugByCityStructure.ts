// Script pour déboguer la structure /by-city et voir si des clients sont perdus
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function debugByCityStructure() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Récupérer les clients comme dans /by-city
    const clientsWithAddress = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Clients récupérés: ${clientsWithAddress.length}\n`);

    // Simuler la construction de la structure comme dans /by-city
    const clientsBySector: Record<string, Record<string, {
      clients: any[];
      districts?: Record<string, any[]>;
    }>> = {};

    let processedCount = 0;
    let skippedCount = 0;

    for (const client of clientsWithAddress) {
      const sector = client.sector || 'Non assignés';
      const city = client.city || 'Inconnu';
      const district = client.district || undefined;

      // Initialiser le secteur
      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }

      // Pour Montréal et Laval
      if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
          (sector === 'Laval' && city.toLowerCase() === 'laval')) {
        const sectorKey = sector;
        
        if (!clientsBySector[sector][sectorKey]) {
          clientsBySector[sector][sectorKey] = {
            clients: [],
            districts: {}
          };
        }
        
        if (district) {
          if (!clientsBySector[sector][sectorKey].districts) {
            clientsBySector[sector][sectorKey].districts = {};
          }
          if (!clientsBySector[sector][sectorKey].districts![district]) {
            clientsBySector[sector][sectorKey].districts![district] = [];
          }
          clientsBySector[sector][sectorKey].districts![district].push(client);
          processedCount++;
        } else {
          clientsBySector[sector][sectorKey].clients.push(client);
          processedCount++;
        }
      } else {
        // Pour les autres villes
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        clientsBySector[sector][city].clients.push(client);
        processedCount++;
      }
    }

    // Compter le total dans la structure
    let totalInStructure = 0;
    for (const sector of Object.keys(clientsBySector)) {
      for (const cityOrKey of Object.keys(clientsBySector[sector])) {
        const data = clientsBySector[sector][cityOrKey];
        if (data.districts) {
          for (const district of Object.keys(data.districts)) {
            totalInStructure += data.districts[district].length;
          }
        }
        if (data.clients) {
          totalInStructure += data.clients.length;
        }
      }
    }

    console.log(`📊 Résultats:`);
    console.log(`   Clients traités: ${processedCount}`);
    console.log(`   Clients dans la structure: ${totalInStructure}`);
    console.log(`   Différence: ${clientsWithAddress.length - totalInStructure}\n`);

    if (totalInStructure !== clientsWithAddress.length) {
      console.log(`⚠️  PROBLÈME: ${clientsWithAddress.length - totalInStructure} client(s) perdu(s) dans la structure!\n`);
      
      // Trouver les clients manquants
      const processedIds = new Set<string>();
      for (const sector of Object.keys(clientsBySector)) {
        for (const cityOrKey of Object.keys(clientsBySector[sector])) {
          const data = clientsBySector[sector][cityOrKey];
          if (data.districts) {
            for (const district of Object.keys(data.districts)) {
              for (const client of data.districts[district]) {
                processedIds.add(client._id.toString());
              }
            }
          }
          if (data.clients) {
            for (const client of data.clients) {
              processedIds.add(client._id.toString());
            }
          }
        }
      }

      const missingClients = clientsWithAddress.filter(c => !processedIds.has(c._id.toString()));
      console.log(`📋 Clients manquants (${missingClients.length}):`);
      for (const client of missingClients.slice(0, 10)) {
        console.log(`   - ${client.givenName} ${client.familyName || ''}`);
        console.log(`     Ville: ${client.city}`);
        console.log(`     Secteur: ${client.sector}`);
        console.log(`     District: ${client.district || 'N/A'}`);
        console.log('');
      }
    } else {
      console.log(`✅ Tous les clients sont dans la structure\n`);
    }

    // Afficher les statistiques par secteur
    console.log(`📊 Statistiques par secteur:`);
    for (const sector of Object.keys(clientsBySector)) {
      let sectorCount = 0;
      for (const cityOrKey of Object.keys(clientsBySector[sector])) {
        const data = clientsBySector[sector][cityOrKey];
        if (data.districts) {
          for (const district of Object.keys(data.districts)) {
            sectorCount += data.districts[district].length;
          }
        }
        if (data.clients) {
          sectorCount += data.clients.length;
        }
      }
      console.log(`   ${sector}: ${sectorCount} clients`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

debugByCityStructure();

