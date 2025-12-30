/**
 * Script pour initialiser les compteurs de rendez-vous pour tous les clients
 * 
 * Usage:
 *   ts-node server/src/scripts/initBookingCounts.ts
 * 
 * Ou depuis le répertoire server:
 *   npx ts-node src/scripts/initBookingCounts.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { updateAllBookingCounts } from '../utils/updateBookingCounts';

dotenv.config();

async function main() {
  try {
    console.log('🚀 Démarrage de l\'initialisation des compteurs de rendez-vous...\n');
    
    // Connexion à MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI n\'est pas défini dans les variables d\'environnement');
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');
    
    // Mettre à jour tous les compteurs
    const result = await updateAllBookingCounts();
    
    if (result.success) {
      console.log('\n✅ Initialisation terminée avec succès!');
      console.log(`   - ${result.updated} clients mis à jour`);
      if (result.errors > 0) {
        console.log(`   - ${result.errors} erreurs`);
      }
    } else {
      console.error('\n❌ Erreur lors de l\'initialisation:', result.message);
      process.exit(1);
    }
    
    // Fermer la connexion
    await mongoose.disconnect();
    console.log('\n✅ Déconnecté de MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

main();






