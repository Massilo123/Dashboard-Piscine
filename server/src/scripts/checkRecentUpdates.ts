// Script pour vérifier quels clients ont été modifiés récemment
import mongoose from 'mongoose';
import Client from '../models/Client';
import dotenv from 'dotenv';

dotenv.config();

async function checkRecentUpdates() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI non défini dans .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Vérifier les clients modifiés dans les dernières 24 heures
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClients = await Client.find({
      updatedAt: { $gte: oneDayAgo }
    })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select('givenName familyName city sector updatedAt');

    console.log(`📊 Clients modifiés dans les dernières 24h: ${recentClients.length}\n`);

    if (recentClients.length > 0) {
      console.log('Derniers clients modifiés:');
      recentClients.forEach((c, i) => {
        console.log(`${i + 1}. ${c.givenName} ${c.familyName || ''} - ${c.city || 'N/A'} [${c.sector || 'N/A'}]`);
        console.log(`   Modifié le: ${c.updatedAt}`);
      });
    }

    // Vérifier spécifiquement les clients modifiés il y a environ 1-2 heures (probablement par le script fixClientSectors)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const scriptClients = await Client.find({
      updatedAt: { $gte: twoHoursAgo, $lte: oneHourAgo }
    })
    .sort({ updatedAt: -1 })
    .select('givenName familyName city sector updatedAt');

    console.log(`\n📊 Clients modifiés il y a 1-2h (probablement par fixClientSectors): ${scriptClients.length}`);

    await mongoose.disconnect();
    console.log('\n✅ Script terminé');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkRecentUpdates();

