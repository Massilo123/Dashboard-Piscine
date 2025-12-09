// Script pour tester l'API /by-city et vérifier le total
import fetch from 'node-fetch';

async function testByCityAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/clients/by-city');
    const result = await response.json();

    if (!result.success) {
      console.error('❌ Erreur API:', result.error);
      return;
    }

    console.log('📊 Résultats de l\'API /by-city:');
    console.log(`   Total clients déclaré: ${result.totalClients}\n`);

    // Compter les clients dans la structure
    let count = 0;
    
    function countClients(obj: any, path: string = ''): void {
      if (Array.isArray(obj)) {
        count += obj.length;
        console.log(`   ${path}: ${obj.length} clients`);
      } else if (typeof obj === 'object' && obj !== null) {
        if (obj.clients && Array.isArray(obj.clients)) {
          count += obj.clients.length;
          console.log(`   ${path}.clients: ${obj.clients.length} clients`);
        }
        if (obj.districts && typeof obj.districts === 'object') {
          Object.entries(obj.districts).forEach(([district, clients]: [string, any]) => {
            if (Array.isArray(clients)) {
              count += clients.length;
              console.log(`   ${path}.districts.${district}: ${clients.length} clients`);
            }
          });
        }
        // Parcourir récursivement
        Object.entries(obj).forEach(([key, value]) => {
          if (key !== 'clients' && key !== 'districts') {
            countClients(value, path ? `${path}.${key}` : key);
          }
        });
      }
    }

    console.log('\n📋 Détail par secteur:');
    countClients(result.data);

    console.log(`\n📊 Total clients dans la structure: ${count}`);
    console.log(`📊 Total clients déclaré: ${result.totalClients}`);
    console.log(`📊 Différence: ${result.totalClients - count}\n`);

    if (count !== result.totalClients) {
      console.log('⚠️  PROBLÈME: Le nombre de clients dans la structure ne correspond pas au total déclaré!');
    } else {
      console.log('✅ Le nombre de clients correspond!');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

testByCityAPI();

