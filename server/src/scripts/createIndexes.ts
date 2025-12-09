// Script pour créer les index MongoDB optimisés pour les requêtes directes
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Client from '../models/Client';

dotenv.config();

async function createIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connecté à MongoDB');

    // Créer des index pour optimiser les requêtes
    console.log('📊 Création des index...');

    // Index pour les requêtes by-city (sector, city, district)
    await Client.collection.createIndex({ sector: 1, city: 1, district: 1 });
    console.log('✅ Index créé: sector, city, district');

    // Index pour les requêtes for-map (coordonnées + city/sector)
    await Client.collection.createIndex({ 
      'coordinates.lng': 1, 
      'coordinates.lat': 1,
      city: 1,
      sector: 1
    });
    console.log('✅ Index créé: coordinates + city + sector');

    // Index pour les requêtes avec adresse
    await Client.collection.createIndex({ addressLine1: 1 });
    console.log('✅ Index créé: addressLine1');

    // Index pour squareId (déjà unique, mais on s'assure qu'il existe)
    await Client.collection.createIndex({ squareId: 1 }, { unique: true, sparse: true });
    console.log('✅ Index créé: squareId (unique)');

    console.log('\n✅ Tous les index ont été créés avec succès !');
    console.log('📊 Les requêtes directes depuis MongoDB seront maintenant optimisées.\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la création des index:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createIndexes();

