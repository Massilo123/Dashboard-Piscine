// Script pour déboguer pourquoi tous les clients ne sont pas comptés
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function debugTotalClients() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Total dans MongoDB
    const totalInMongoDB = await Client.countDocuments();
    console.log(`📊 Total clients dans MongoDB: ${totalInMongoDB}\n`);

    // Récupérer TOUS les clients
    const allClients = await Client.find({}).lean();
    console.log(`📊 Total clients récupérés: ${allClients.length}\n`);

    // Catégoriser les clients
    const clientsWithAddressAndCitySector = allClients.filter(c => 
      c.addressLine1 && c.addressLine1.trim() !== '' &&
      c.city && c.city.trim() !== '' &&
      c.sector && c.sector.trim() !== ''
    );

    const clientsWithoutAddress = allClients.filter(c => 
      !c.addressLine1 || c.addressLine1.trim() === ''
    );

    const clientsWithAddressButNoCitySector = allClients.filter(c => 
      c.addressLine1 && c.addressLine1.trim() !== '' &&
      (!c.city || c.city.trim() === '' || !c.sector || c.sector.trim() === '')
    );

    const clientsWithoutAddressButWithCitySector = clientsWithoutAddress.filter(c => 
      c.city && c.city.trim() !== '' && c.sector && c.sector.trim() !== ''
    );

    const clientsWithoutAddressAndNoCitySector = clientsWithoutAddress.filter(c => 
      !c.city || c.city.trim() === '' || !c.sector || c.sector.trim() === ''
    );

    console.log('📊 Catégorisation:');
    console.log(`   Clients avec adresse + ville/secteur: ${clientsWithAddressAndCitySector.length}`);
    console.log(`   Clients sans adresse mais avec ville/secteur: ${clientsWithoutAddressButWithCitySector.length}`);
    console.log(`   Clients sans adresse ET sans ville/secteur: ${clientsWithoutAddressAndNoCitySector.length}`);
    console.log(`   Clients avec adresse mais sans ville/secteur: ${clientsWithAddressButNoCitySector.length}`);
    console.log(`   Total catégorisé: ${clientsWithAddressAndCitySector.length + clientsWithoutAddressButWithCitySector.length + clientsWithoutAddressAndNoCitySector.length + clientsWithAddressButNoCitySector.length}\n`);

    // Simuler la construction de la structure comme dans /by-city
    const clientsBySector: Record<string, Record<string, {
      clients: any[];
      districts?: Record<string, any[]>;
    }>> = {};

    let processedCount = 0;

    // Traiter les clients avec adresse ET ville/secteur
    for (const client of clientsWithAddressAndCitySector) {
      const sector = client.sector || 'Non assignés';
      const city = client.city || 'Inconnu';
      const district = client.district || undefined;

      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }

      if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
          (sector === 'Laval' && city.toLowerCase() === 'laval')) {
        const sectorKey = sector;
        if (!clientsBySector[sector][sectorKey]) {
          clientsBySector[sector][sectorKey] = { clients: [], districts: {} };
        }
        if (district) {
          if (!clientsBySector[sector][sectorKey].districts) {
            clientsBySector[sector][sectorKey].districts = {};
          }
          if (!clientsBySector[sector][sectorKey].districts![district]) {
            clientsBySector[sector][sectorKey].districts![district] = [];
          }
          clientsBySector[sector][sectorKey].districts![district].push(client);
        } else {
          clientsBySector[sector][sectorKey].clients.push(client);
        }
      } else {
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        clientsBySector[sector][city].clients.push(client);
      }
      processedCount++;
    }

    // Traiter les clients sans adresse mais avec ville/secteur
    for (const client of clientsWithoutAddressButWithCitySector) {
      const sector = client.sector || 'Non assignés';
      const city = client.city || 'Inconnu';
      const district = client.district || undefined;

      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }

      if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
          (sector === 'Laval' && city.toLowerCase() === 'laval')) {
        const sectorKey = sector;
        if (!clientsBySector[sector][sectorKey]) {
          clientsBySector[sector][sectorKey] = { clients: [], districts: {} };
        }
        if (district) {
          if (!clientsBySector[sector][sectorKey].districts) {
            clientsBySector[sector][sectorKey].districts = {};
          }
          if (!clientsBySector[sector][sectorKey].districts![district]) {
            clientsBySector[sector][sectorKey].districts![district] = [];
          }
          clientsBySector[sector][sectorKey].districts![district].push(client);
        } else {
          clientsBySector[sector][sectorKey].clients.push(client);
        }
      } else {
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        clientsBySector[sector][city].clients.push(client);
      }
      processedCount++;
    }

    // Traiter les clients sans adresse ET sans ville/secteur
    if (clientsWithoutAddressAndNoCitySector.length > 0) {
      if (!clientsBySector['Non assignés']) {
        clientsBySector['Non assignés'] = {};
      }
      if (!clientsBySector['Non assignés']['Sans adresse']) {
        clientsBySector['Non assignés']['Sans adresse'] = { clients: [] };
      }
      for (const client of clientsWithoutAddressAndNoCitySector) {
        clientsBySector['Non assignés']['Sans adresse'].clients.push(client);
        processedCount++;
      }
    }

    // Traiter les clients avec adresse mais sans ville/secteur
    if (clientsWithAddressButNoCitySector.length > 0) {
      if (!clientsBySector['Non assignés']) {
        clientsBySector['Non assignés'] = {};
      }
      if (!clientsBySector['Non assignés']['Non localisé']) {
        clientsBySector['Non assignés']['Non localisé'] = { clients: [] };
      }
      for (const client of clientsWithAddressButNoCitySector) {
        clientsBySector['Non assignés']['Non localisé'].clients.push(client);
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

    console.log('📊 Résultats de la structure:');
    console.log(`   Clients traités: ${processedCount}`);
    console.log(`   Clients dans la structure: ${totalInStructure}`);
    console.log(`   Différence: ${allClients.length - totalInStructure}\n`);

    // Afficher les statistiques par secteur
    console.log('📊 Statistiques par secteur:');
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

debugTotalClients();

