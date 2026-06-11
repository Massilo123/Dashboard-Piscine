/**
 * Test manuel : crée un client Square avec différents formats de téléphone
 * Usage : cd server && npx ts-node src/scripts/testSquareCreateClient.ts
 * Supprime le client créé à la fin du test.
 */

import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-01-18',
};

async function tryCreate(label: string, body: Record<string, any>) {
  console.log(`\n--- ${label} ---`);
  console.log('Body envoyé:', JSON.stringify(body, null, 2));

  const resp = await fetch('https://connect.squareup.com/v2/customers', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const data: any = await resp.json();

  if (resp.ok && data.customer) {
    console.log(`✅ SUCCÈS — Square ID: ${data.customer.id}`);
    console.log(`   Nom: ${data.customer.given_name || data.customer.givenName} ${data.customer.family_name || data.customer.familyName}`);
    console.log(`   Téléphone enregistré: ${data.customer.phone_number || data.customer.phoneNumber}`);
    return data.customer.id;
  } else {
    console.log(`❌ ÉCHEC (${resp.status}):`, JSON.stringify(data.errors || data, null, 2));
    return null;
  }
}

async function deleteCustomer(id: string) {
  const resp = await fetch(`https://connect.squareup.com/v2/customers/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (resp.ok) {
    console.log(`\n🗑️  Client ${id} supprimé.`);
  }
}

async function main() {
  const createdIds: string[] = [];

  // Test 1 : camelCase + E.164 (+1XXXXXXXXXX)
  const id1 = await tryCreate('camelCase + E.164 (+15148762345)', {
    idempotencyKey: `test-create-1-${Date.now()}`,
    givenName: 'Test',
    familyName: 'Aquarius',
    phoneNumber: '+15148762345',
  });
  if (id1) createdIds.push(id1);

  // Test 2 : camelCase + sans +1 (10 chiffres)
  const id2 = await tryCreate('camelCase + 10 chiffres (5148762345)', {
    idempotencyKey: `test-create-2-${Date.now()}`,
    givenName: 'Test',
    familyName: 'Aquarius2',
    phoneNumber: '5148762345',
  });
  if (id2) createdIds.push(id2);

  // Test 3 : snake_case + E.164 (l'ancien format bugué)
  const id3 = await tryCreate('snake_case + E.164 (ancien format)', {
    idempotency_key: `test-create-3-${Date.now()}`,
    given_name: 'Test',
    family_name: 'Aquarius3',
    phone_number: '+15148762345',
  });
  if (id3) createdIds.push(id3);

  // Nettoyage
  console.log('\n\n--- Nettoyage ---');
  for (const id of createdIds) await deleteCustomer(id);
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
