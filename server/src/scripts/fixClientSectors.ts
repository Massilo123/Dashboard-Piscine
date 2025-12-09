// Script pour corriger les secteurs des clients existants
// Ce script recalcule le secteur pour tous les clients qui ont une ville mais un secteur incorrect
import mongoose from 'mongoose';
import Client from '../models/Client';
import { getSector } from '../utils/geocodeAndExtractLocation';
import dotenv from 'dotenv';

dotenv.config();

async function fixClientSectors() {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    // Récupérer tous les clients qui ont une ville
    const clients = await Client.find({ 
      city: { $exists: true, $nin: [null, ''] } 
    });

    console.log(`\n📊 ${clients.length} clients trouvés avec une ville\n`);

    let corrected = 0;
    let unchanged = 0;
    const corrections: Array<{ name: string; city: string; oldSector: string; newSector: string }> = [];

    for (const client of clients) {
      if (!client.city) continue;

      const correctSector = getSector(client.city);
      const currentSector = client.sector || 'Non défini';

      if (correctSector !== currentSector) {
        await Client.updateOne(
          { _id: client._id },
          { $set: { sector: correctSector } }
        );

        corrections.push({
          name: `${client.givenName} ${client.familyName || ''}`.trim(),
          city: client.city,
          oldSector: currentSector,
          newSector: correctSector
        });

        corrected++;
        console.log(`✅ ${client.givenName}: ${client.city} -> ${currentSector} → ${correctSector}`);
      } else {
        unchanged++;
      }
    }

    console.log(`\n📈 Résumé:`);
    console.log(`   - Clients corrigés: ${corrected}`);
    console.log(`   - Clients inchangés: ${unchanged}`);

    if (corrections.length > 0) {
      console.log(`\n📋 Détail des corrections:`);
      const bySector = corrections.reduce((acc, c) => {
        if (!acc[c.newSector]) acc[c.newSector] = [];
        acc[c.newSector].push(c);
        return acc;
      }, {} as Record<string, typeof corrections>);

      for (const [sector, clients] of Object.entries(bySector)) {
        console.log(`\n   ${sector} (${clients.length} clients):`);
        clients.slice(0, 10).forEach(c => {
          console.log(`     - ${c.name} (${c.city}): ${c.oldSector} → ${c.newSector}`);
        });
        if (clients.length > 10) {
          console.log(`     ... et ${clients.length - 10} autres`);
        }
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Script terminé');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixClientSectors();

