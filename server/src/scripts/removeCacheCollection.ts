// Script pour supprimer la collection ClientByCityCache (plus nécessaire)
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ClientByCityCache } from '../models/ClientCache';

dotenv.config();

async function removeCacheCollection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connecté à MongoDB');

    // Compter les documents avant suppression
    const count = await ClientByCityCache.countDocuments();
    console.log(`📊 ${count} document(s) dans la collection ClientByCityCache`);

    if (count === 0) {
      console.log('✅ La collection est déjà vide');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Supprimer tous les documents
    const result = await ClientByCityCache.deleteMany({});
    console.log(`✅ ${result.deletedCount} document(s) supprimé(s)`);

    // Optionnel: Supprimer la collection complètement (décommenter si vous voulez)
    // await ClientByCityCache.collection.drop();
    // console.log('✅ Collection supprimée complètement');

    console.log('\n✅ Collection ClientByCityCache nettoyée !');
    console.log('📊 Les routes utilisent maintenant directement MongoDB.\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

removeCacheCollection();

