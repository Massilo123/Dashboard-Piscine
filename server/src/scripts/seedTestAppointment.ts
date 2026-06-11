/**
 * Insère un rendez-vous de test dans MongoDB pour tester le bouton "Créer client Square".
 * Usage : cd server && npx ts-node src/scripts/seedTestAppointment.ts
 * Pour supprimer le test : relancer avec --delete
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Appointment from '../models/Appointment';

dotenv.config();

const TEST_MARKER = 'TEST_BOT_RDV_SEED';

const testAppointment = {
  name: 'Jean-Philippe Tremblay',
  phone: '5141234567',
  address: '742 Evergreen Terrace, Laval, QC',
  scheduled_date: (() => {
    // Toujours demain pour qu'il apparaisse dans les RDV futurs
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })(),
  scheduled_time: '10:00',
  sector: 'Laval',
  district: 'Laval-des-Rapides',
  city: 'Laval',
  user_name: 'Bot Aquarius',
  user_id: 'bot',
  conversation_id: 'test-conversation-seed',
  listing_title: 'Ouverture de piscine creusée',
  pool_type: 'Creusée',
  important_notes: ['Client test pour valider le bouton "Créer client Square"', 'À supprimer après validation'],
  status: 'confirmed',
  square_booked: false,
  // Marqueur pour pouvoir le retrouver/supprimer facilement
  extracted_at: new Date(TEST_MARKER.split('').reduce((a, c) => a + c.charCodeAt(0), 0)),
};

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connecté à MongoDB\n');

  if (shouldDelete) {
    const result = await Appointment.deleteOne({ conversation_id: 'test-conversation-seed' });
    if (result.deletedCount > 0) {
      console.log('🗑️  Rendez-vous de test supprimé.');
    } else {
      console.log('ℹ️  Aucun rendez-vous de test trouvé (déjà supprimé ?).');
    }
  } else {
    // Vérifier si le test existe déjà
    const existing = await Appointment.findOne({ conversation_id: 'test-conversation-seed' });
    if (existing) {
      // Mettre à jour la date pour qu'il soit toujours dans le futur
      await Appointment.updateOne(
        { conversation_id: 'test-conversation-seed' },
        { $set: { scheduled_date: testAppointment.scheduled_date, updated_at: new Date() } }
      );
      console.log(`♻️  Rendez-vous de test déjà existant — date mise à jour : ${testAppointment.scheduled_date}`);
      console.log(`   ID : ${existing._id}`);
    } else {
      const doc = await Appointment.create(testAppointment);
      console.log('✅ Rendez-vous de test créé avec succès !');
      console.log(`   ID       : ${doc._id}`);
      console.log(`   Nom      : ${testAppointment.name}`);
      console.log(`   Téléphone: ${testAppointment.phone}`);
      console.log(`   Date     : ${testAppointment.scheduled_date} à ${testAppointment.scheduled_time}`);
      console.log(`   Service  : ${testAppointment.listing_title} (${testAppointment.pool_type})`);
      console.log(`   Secteur  : ${testAppointment.sector}`);
      console.log('\n👉 Va dans /appointments sur le dashboard pour voir le bouton "Créer client Square".');
      console.log('👉 Pour supprimer : npx ts-node src/scripts/seedTestAppointment.ts --delete');
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
