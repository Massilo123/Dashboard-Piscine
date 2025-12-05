import { Router, Request, Response } from 'express';
import Client from '../models/Client';

const router = Router();

interface ClientWithLocation {
  _id: string;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
  addressLine1: string;
  coordinates?: {
    lng: number;
    lat: number;
  };
  city: string;
  district?: string;
}

interface ProgressData {
  type: 'start' | 'progress' | 'update' | 'complete' | 'error';
  total?: number;
  processed?: number;
  progress?: number;
  currentClient?: string;
  city?: string;
  district?: string;
  elapsed?: string;
  estimated?: string;
  message?: string;
  data?: Record<string, {
    clients: ClientWithLocation[];
    districts?: Record<string, ClientWithLocation[]>;
  }>;
  totalClients?: number;
  totalTime?: string;
  error?: string;
}

// Liste des villes de l'agglomération de Montréal qui doivent être classées sous "Montréal"
// Inclut toutes les variantes possibles (avec/sans tirets, majuscules/minuscules)
const MONTREAL_AGGLO_CITIES = [
  'dollard-des-ormeaux',
  'dollard des ormeaux',
  'dollard-des ormeaux',
  'dollard des-ormeaux',
  'dollard-des-ormeaux',
  'kirkland',
  'dorval',
  'pointe-claire',
  'pointe claire',
  'beaconsfield',
  'baie-d\'urfé',
  'baie d\'urfé',
  'baie-d\'urfé',
  'hampstead',
  'côte-saint-luc',
  'côte saint-luc',
  'côte-saint luc',
  'mont-royal',
  'mont royal',
  'montréal-est',
  'montreal-est',
  'montréal-nord',
  'montreal-nord',
  'montréal-ouest',
  'montreal-ouest',
  'westmount',
  'outremont',
  'sainte-anne-de-bellevue',
  'sainte anne de bellevue',
  'ile-bizard',
  'île-bizard',
  'pierrefonds-roxboro',
  'pierrefonds',
  'roxboro',
  'sainte-geneviève',
  'sainte geneviève',
  'senneville'
];

// Liste des villes qui doivent être normalisées vers Laval
const LAVAL_NORMALIZED_CITIES = [
  'le val-st-françois',
  'le val-st-francois',
  'le val st-françois',
  'le val st-francois',
  'val-st-françois',
  'val-st-francois',
  'val st-françois',
  'val st-francois'
];

// Fonction pour normaliser le nom de la ville (regrouper les villes de l'agglomération sous Montréal)
function normalizeCity(city: string): string {
  if (!city || city.trim() === '') {
    return 'Inconnu';
  }
  
  // Normaliser : enlever les espaces multiples, convertir en minuscules
  const cityNormalized = city.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Si c'est déjà Montréal, retourner tel quel
  if (cityNormalized === 'montréal' || cityNormalized === 'montreal') {
    return 'Montréal';
  }
  
  // Si c'est déjà Laval, retourner tel quel
  if (cityNormalized === 'laval') {
    return 'Laval';
  }
  
  // Vérifier si c'est "Le val-st-françois" ou ses variations -> normaliser vers Laval
  const cityNoSpaces = cityNormalized.replace(/\s+/g, '-');
  const cityNoDashes = cityNormalized.replace(/-/g, ' ');
  
  if (LAVAL_NORMALIZED_CITIES.includes(cityNormalized) ||
      LAVAL_NORMALIZED_CITIES.includes(cityNoSpaces) ||
      LAVAL_NORMALIZED_CITIES.includes(cityNoDashes)) {
    return 'Laval';
  }
  
  // Vérification partielle pour "Le val-st-françois"
  for (const lavalCity of LAVAL_NORMALIZED_CITIES) {
    const lavalCityClean = lavalCity.toLowerCase().replace(/[-\s]/g, '');
    const cityClean = cityNormalized.replace(/[-\s]/g, '');
    if (lavalCityClean === cityClean) {
      return 'Laval';
    }
  }
  
  // Vérifier si c'est une ville de l'agglomération de Montréal (comparaison flexible)
  if (MONTREAL_AGGLO_CITIES.includes(cityNormalized) ||
      MONTREAL_AGGLO_CITIES.includes(cityNoSpaces) ||
      MONTREAL_AGGLO_CITIES.includes(cityNoDashes)) {
    return 'Montréal';
  }
  
  // Vérification partielle pour les cas comme "Dollard-des-Ormeaux" vs "dollard-des-ormeaux"
  for (const agglCity of MONTREAL_AGGLO_CITIES) {
    const agglCityNormalized = agglCity.toLowerCase().trim();
    const cityNormalizedLower = cityNormalized.toLowerCase().trim();
    
    // Comparaison flexible : enlever tous les tirets et espaces pour comparer
    const agglCityClean = agglCityNormalized.replace(/[-\s]/g, '');
    const cityClean = cityNormalizedLower.replace(/[-\s]/g, '');
    
    if (agglCityClean === cityClean) {
      return 'Montréal';
    }
  }
  
  // Sinon, retourner la ville avec la première lettre en majuscule
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

// Fonction pour extraire la ville et le quartier depuis l'adresse avec HERE API
async function extractCityAndDistrict(address: string): Promise<{ city: string; district?: string }> {
  try {
    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      throw new Error('HERE_API_KEY non configuré dans les variables d\'environnement');
    }

    // Appel à l'API HERE Geocoding
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erreur HERE API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const addressData = item.address;
      
      let city = '';
      let district: string | undefined;

      // HERE fournit directement la ville dans address.city
      const rawCity = addressData.city || addressData.county || '';
      
      // Log pour debug (à retirer en production)
      if (rawCity.toLowerCase().includes('dollard') || 
          rawCity.toLowerCase().includes('kirkland') || 
          rawCity.toLowerCase().includes('dorval') ||
          address.toLowerCase().includes('val-st-françois') ||
          address.toLowerCase().includes('val-st-francois') ||
          address.toLowerCase().includes('val st-françois') ||
          address.toLowerCase().includes('val st-francois')) {
        console.log(`[DEBUG] Ville brute de HERE: "${rawCity}" pour adresse: ${address.substring(0, 50)}...`);
      }
      
      // Normaliser la ville (regrouper les villes de l'agglomération sous Montréal)
      city = normalizeCity(rawCity);
      
      // Si la ville originale était "Le val-st-françois" ou ses variations, définir le quartier immédiatement
      const rawCityLower = rawCity.toLowerCase().trim();
      const rawCityNoSpaces = rawCityLower.replace(/\s+/g, '-');
      const rawCityNoDashes = rawCityLower.replace(/-/g, ' ');
      
      let isValStFrancois = LAVAL_NORMALIZED_CITIES.includes(rawCityLower) ||
                            LAVAL_NORMALIZED_CITIES.includes(rawCityNoSpaces) ||
                            LAVAL_NORMALIZED_CITIES.includes(rawCityNoDashes);
      
      if (!isValStFrancois) {
        for (const lavalCity of LAVAL_NORMALIZED_CITIES) {
          const lavalCityClean = lavalCity.toLowerCase().replace(/[-\s]/g, '');
          const rawCityClean = rawCityLower.replace(/[-\s]/g, '');
          if (lavalCityClean === rawCityClean) {
            isValStFrancois = true;
            break;
          }
        }
      }
      
      if (isValStFrancois && city.toLowerCase() === 'laval') {
        district = 'Saint-François';
        console.log(`[DEBUG VAL-ST-FRANÇOIS] ✅ Ville "Le val-st-françois" normalisée vers Laval avec quartier Saint-François`);
      }
      
      // Log pour debug
      if (rawCity.toLowerCase().includes('dollard') || 
          rawCity.toLowerCase().includes('kirkland') || 
          rawCity.toLowerCase().includes('dorval') ||
          address.toLowerCase().includes('val-st-françois') ||
          address.toLowerCase().includes('val-st-francois') ||
          address.toLowerCase().includes('val st-françois') ||
          address.toLowerCase().includes('val st-francois') ||
          rawCity.toLowerCase().includes('val-st-françois') ||
          rawCity.toLowerCase().includes('val-st-francois') ||
          rawCity.toLowerCase().includes('val st-françois') ||
          rawCity.toLowerCase().includes('val st-francois')) {
        console.log(`[DEBUG] Ville normalisée: "${city}" (était: "${rawCity}")`);
      }

      // Pour Montréal et Laval, chercher le quartier (NE PAS utiliser street qui donne des rues)
      if ((city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval') && !district) {
        // HERE peut fournir le quartier dans différents champs (mais pas street qui est une rue)
        const rawDistrict = addressData.district || 
                            addressData.subdistrict || 
                            undefined;
        
        // Normaliser immédiatement si le district contient "val-st-françois" ou ses variations
        if (rawDistrict) {
          const rawDistrictLower = rawDistrict.toLowerCase();
          console.log(`[DEBUG VAL-ST-FRANÇOIS] District brut de HERE: "${rawDistrict}" pour adresse: ${address.substring(0, 50)}...`);
          if (rawDistrictLower.includes('val-st-françois') || 
              rawDistrictLower.includes('val-st-francois') ||
              rawDistrictLower.includes('val st-françois') ||
              rawDistrictLower.includes('val st-francois') ||
              rawDistrictLower.includes('le val-st-françois') ||
              rawDistrictLower.includes('le val-st-francois') ||
              rawDistrictLower.includes('le val st-françois') ||
              rawDistrictLower.includes('le val st-francois')) {
            console.log(`[DEBUG VAL-ST-FRANÇOIS] ✅ Normalisation: "${rawDistrict}" -> "Saint-François"`);
            district = 'Saint-François';
          } else {
            district = rawDistrict;
            console.log(`[DEBUG VAL-ST-FRANÇOIS] ⚠️  District non normalisé: "${rawDistrict}"`);
          }
        }

        // Si pas trouvé, essayer de l'extraire depuis l'adresse complète
        if (!district) {
          const fullAddress = item.title?.toLowerCase() || '';
          const addressLabel = addressData.label?.toLowerCase() || '';
          const searchText = `${fullAddress} ${addressLabel} ${address.toLowerCase()}`;
          
          // Vérifier d'abord si "Le val-st-françois" ou ses variations sont dans le texte
          const valStFrancoisPatterns = [
            'le val-st-françois', 'le val-st-francois', 'le val st-françois', 'le val st-francois',
            'val-st-françois', 'val-st-francois', 'val st-françois', 'val st-francois',
            'valstfrançois', 'valstfrancois'
          ];
          
          for (const pattern of valStFrancoisPatterns) {
            if (searchText.includes(pattern)) {
              console.log(`[DEBUG VAL-ST-FRANÇOIS] ✅ Pattern trouvé dans searchText: "${pattern}" -> "Saint-François"`);
              console.log(`[DEBUG VAL-ST-FRANÇOIS] searchText: "${searchText.substring(0, 200)}..."`);
              district = 'Saint-François';
              break;
            }
          }

          // Si la ville originale était une ville de l'agglomération, utiliser son nom comme quartier
          const rawCityLower = rawCity.toLowerCase().trim();
          const rawCityNoSpaces = rawCityLower.replace(/\s+/g, '-');
          const rawCityNoDashes = rawCityLower.replace(/-/g, ' ');
          
          // Vérification flexible pour les villes de l'agglomération
          let isAggloCity = MONTREAL_AGGLO_CITIES.includes(rawCityLower) ||
                           MONTREAL_AGGLO_CITIES.includes(rawCityNoSpaces) ||
                           MONTREAL_AGGLO_CITIES.includes(rawCityNoDashes);
          
          // Vérification partielle (enlever tirets et espaces pour comparer)
          if (!isAggloCity) {
            for (const agglCity of MONTREAL_AGGLO_CITIES) {
              const agglCityClean = agglCity.toLowerCase().replace(/[-\s]/g, '');
              const rawCityClean = rawCityLower.replace(/[-\s]/g, '');
              if (agglCityClean === rawCityClean) {
                isAggloCity = true;
                break;
              }
            }
          }
          
          if (isAggloCity) {
            // Utiliser le nom de la ville comme quartier
            district = rawCity.split(/[- ]/).map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join('-');
          } else {
            // Liste de quartiers connus pour Montréal et Laval
            const montrealDistricts = [
              'ahuntsic', 'anjou', 'baie-d\'urfé', 'beaconsfield', 'côte-des-neiges', 
              'côte-saint-luc', 'dorval', 'dollard-des-ormeaux', 'dollard des ormeaux', 'hampstead', 'ile-bizard',
              'kirkland', 'lachine', 'lasalle', 'mont-royal', 'montréal-est', 'montréal-nord',
              'montréal-ouest', 'outremont', 'pierrefonds-roxboro', 'pierrefonds', 'pointe-claire', 
              'rosemont', 'saint-laurent', 'saint-léonard', 'sainte-anne-de-bellevue',
              'sainte-geneviève', 'sainte-marie', 'verdun', 'ville-marie', 'westmount',
              'plateau-mont-royal', 'villeray', 'rosemont-la-petite-patrie', 'mercier',
              'hochelaga-maisonneuve', 'rivière-des-prairies',
              'ahuntsic-cartierville', 'côte-des-neiges–notre-dame-de-grâce', 'notre-dame-de-grâce',
              'petite-patrie', 'cartierville', 'hochelaga', 'maisonneuve', 'roxboro', 'senneville'
            ];
            
            const lavalDistricts = [
              'chomedey', 'duvernay', 'fabreville', 'iles-laval', 'laval-des-rapides',
              'laval-ouest', 'pont-viau', 'sainte-dorothée', 'sainte-rose', 'saint-françois',
              'saint françois', 'saint-francois', 'saint francois', 'st-françois', 'st françois',
              'st-francois', 'st francois', 'le val-st-françois', 'le val-st-francois',
              'le val st-françois', 'le val st-francois', 'val-st-françois', 'val-st-francois',
              'val st-françois', 'val st-francois', 'val-st-françois', 'val-st-francois',
              'saint-vincent-de-paul', 'souvenir', 'vieux-saint-martin', 'auteuil',
              'saint-martin', 'val-des-brises'
            ];
            
            const allDistricts = [...montrealDistricts, ...lavalDistricts];
            
            // Si district n'a pas encore été défini, chercher dans la liste
            if (!district) {
              for (const knownDistrict of allDistricts) {
                if (searchText.includes(knownDistrict)) {
                  // Normaliser les variations de Saint-François
                  if (knownDistrict.includes('val-st-françois') || 
                      knownDistrict.includes('val-st-francois') ||
                      knownDistrict.includes('val st-françois') ||
                      knownDistrict.includes('val st-francois') ||
                      knownDistrict.includes('le val-st-françois') ||
                      knownDistrict.includes('le val-st-francois') ||
                      knownDistrict.includes('le val st-françois') ||
                      knownDistrict.includes('le val st-francois')) {
                    district = 'Saint-François';
                  } else if (knownDistrict.includes('st-françois') || 
                            knownDistrict.includes('st-francois') ||
                            knownDistrict.includes('st françois') ||
                            knownDistrict.includes('st francois') ||
                            knownDistrict.includes('saint-françois') ||
                            knownDistrict.includes('saint-francois') ||
                            knownDistrict.includes('saint françois') ||
                            knownDistrict.includes('saint francois')) {
                    district = 'Saint-François';
                  } else {
                    // Formater le nom du quartier (première lettre en majuscule)
                    district = knownDistrict.split('-').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join('-');
                  }
                  break;
                }
              }
            }
            
            // Vérification finale : si le district contient encore "val-st-françois" ou ses variations, le normaliser
            if (district) {
              const districtLower = district.toLowerCase();
              if (districtLower.includes('val-st-françois') || 
                  districtLower.includes('val-st-francois') ||
                  districtLower.includes('val st-françois') ||
                  districtLower.includes('val st-francois') ||
                  districtLower.includes('le val-st-françois') ||
                  districtLower.includes('le val-st-francois') ||
                  districtLower.includes('le val st-françois') ||
                  districtLower.includes('le val st-francois')) {
                console.log(`[DEBUG VAL-ST-FRANÇOIS] ✅ Vérification finale: "${district}" -> "Saint-François"`);
                district = 'Saint-François';
              }
            }
            
            // Log final pour debug
            if (address.toLowerCase().includes('val-st-françois') ||
                address.toLowerCase().includes('val-st-francois') ||
                address.toLowerCase().includes('val st-françois') ||
                address.toLowerCase().includes('val st-francois')) {
              console.log(`[DEBUG VAL-ST-FRANÇOIS] 📍 Résultat final - Ville: "${city}", District: "${district || 'N/A'}"`);
            }
          }
        }
      }
      
      return { city: city || 'Inconnu', district };
    }
  } catch (error) {
    console.error(`Erreur lors de l'extraction de la ville pour ${address}:`, error);
  }
  
  return { city: 'Inconnu' };
}

// Route avec streaming pour affichage progressif
router.get('/by-city-stream', async (req: Request, res: Response): Promise<void> => {
  // Configurer les headers pour Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendProgress = (data: ProgressData) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {

    // Récupérer tous les clients avec une adresse
    const clients = await Client.find({
      addressLine1: { $exists: true, $ne: '' }
    });

    console.log(`\n========================================`);
    console.log(`🚀 DÉBUT DU TRAITEMENT`);
    console.log(`📊 Total de clients à traiter: ${clients.length}`);
    console.log(`========================================\n`);

    sendProgress({ type: 'start', total: clients.length, message: `Début du traitement de ${clients.length} clients...` });

    // Organiser les clients par ville et quartier
    const clientsByCity: Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> = {};

    let processedCount = 0;
    const startTime = Date.now();

    // Traiter les clients avec un délai pour éviter de surcharger l'API
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      
      if (!client.addressLine1) {
        processedCount++;
        continue;
      }

      try {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
        console.log(`[${i + 1}/${clients.length}] Traitement: ${clientName} - ${client.addressLine1}`);
        
        const { city, district } = await extractCityAndDistrict(client.addressLine1);
        
        console.log(`  ✓ Ville détectée: ${city}${district ? ` | Quartier: ${district}` : ''}`);
        
        const clientWithLocation: ClientWithLocation = {
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1,
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city,
          district
        };

        // Initialiser la ville si elle n'existe pas
        if (!clientsByCity[city]) {
          // Pour Montréal et Laval, initialiser avec districts, sinon juste clients
          if (city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval') {
            clientsByCity[city] = {
              clients: [],
              districts: {}
            };
          } else {
            clientsByCity[city] = {
              clients: []
              // Pas de districts pour les autres villes
            };
          }
          console.log(`  📍 Nouvelle ville ajoutée: ${city}`);
        }

        // Pour Montréal et Laval, organiser par quartier
        if ((city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval') && district) {
          if (!clientsByCity[city].districts) {
            clientsByCity[city].districts = {};
          }
          
          if (!clientsByCity[city].districts![district]) {
            clientsByCity[city].districts![district] = [];
            console.log(`  🏘️  Nouveau quartier ajouté: ${district} (${city})`);
          }
          
          clientsByCity[city].districts![district].push(clientWithLocation);
        } else {
          // Pour les autres villes, ajouter directement à la liste
          clientsByCity[city].clients.push(clientWithLocation);
        }

        processedCount++;
        const progress = Math.round((processedCount / clients.length) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const estimated = processedCount > 0 ? ((Date.now() - startTime) / processedCount * (clients.length - processedCount) / 1000).toFixed(1) : '0';

        // Envoyer la progression toutes les 5 clients ou à chaque ville/quartier ajouté
        if (processedCount % 5 === 0 || i === clients.length - 1) {
          sendProgress({
            type: 'progress',
            processed: processedCount,
            total: clients.length,
            progress: progress,
            elapsed: `${elapsed}s`,
            estimated: `${estimated}s`,
            currentClient: clientName,
            city: city,
            district: district
          });
        }

        // Envoyer les données mises à jour
        sendProgress({
          type: 'update',
          data: clientsByCity
        });

        // Petit délai pour éviter de surcharger l'API HERE
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour le client ${client._id}:`, error);
        // Ajouter quand même le client avec ville inconnue
        const city = 'Inconnu';
        if (!clientsByCity[city]) {
          clientsByCity[city] = { clients: [] };
        }
        clientsByCity[city].clients.push({
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1,
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: 'Inconnu'
        });
        processedCount++;
      }
    }

    // Trier les villes : Montréal et Laval en premier, puis le reste par ordre alphabétique
    const cityKeys = Object.keys(clientsByCity);
    const sortedCities = cityKeys.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
      const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
      
      // Si les deux sont Montréal/Laval, trier entre eux (Montréal puis Laval)
      if (isAMontrealOrLaval && isBMontrealOrLaval) {
        if (aLower === 'montréal') return -1;
        if (bLower === 'montréal') return 1;
        return aLower.localeCompare(bLower);
      }
      
      // Si seulement A est Montréal/Laval, A vient en premier
      if (isAMontrealOrLaval) return -1;
      
      // Si seulement B est Montréal/Laval, B vient en premier
      if (isBMontrealOrLaval) return 1;
      
      // Sinon, tri alphabétique normal
      return a.localeCompare(b);
    });
    
    const result: Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> = {};
    
    for (const city of sortedCities) {
      result[city] = clientsByCity[city];
      
      // Trier les quartiers par ordre alphabétique pour Montréal et Laval
      if (result[city].districts) {
        const sortedDistricts: Record<string, ClientWithLocation[]> = {};
        const districtKeys = Object.keys(result[city].districts!).sort();
        for (const districtKey of districtKeys) {
          sortedDistricts[districtKey] = result[city].districts![districtKey];
        }
        result[city].districts = sortedDistricts;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`✅ TRAITEMENT TERMINÉ`);
    console.log(`⏱️  Temps total: ${totalTime}s`);
    console.log(`📊 Clients traités: ${processedCount}/${clients.length}`);
    console.log(`🏙️  Villes trouvées: ${sortedCities.length}`);
    console.log(`========================================\n`);

    sendProgress({
      type: 'complete',
      data: result,
      totalClients: clients.length,
      totalTime: totalTime
    });

    res.end();
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients par ville:', error);
    sendProgress({
      type: 'error',
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
    res.end();
  }
});

// Route classique (conservée pour compatibilité)
router.get('/by-city', async (req: Request, res: Response): Promise<void> => {
  try {
    // Récupérer tous les clients avec une adresse
    const clients = await Client.find({
      addressLine1: { $exists: true, $ne: '' }
    });

    console.log(`\n========================================`);
    console.log(`🚀 DÉBUT DU TRAITEMENT (mode classique)`);
    console.log(`📊 Total de clients à traiter: ${clients.length}`);
    console.log(`========================================\n`);

    // Organiser les clients par ville et quartier
    const clientsByCity: Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> = {};

    let processedCount = 0;
    const startTime = Date.now();

    // Traiter les clients avec un délai pour éviter de surcharger l'API
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      
      if (!client.addressLine1) {
        processedCount++;
        continue;
      }

      try {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
        const progress = Math.round(((i + 1) / clients.length) * 100);
        
        if ((i + 1) % 10 === 0 || i === 0) {
          console.log(`[${i + 1}/${clients.length}] Progression: ${progress}% - ${clientName}`);
        }
        
        const { city, district } = await extractCityAndDistrict(client.addressLine1);
        
        const clientWithLocation: ClientWithLocation = {
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1,
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city,
          district
        };

        // Initialiser la ville si elle n'existe pas
        if (!clientsByCity[city]) {
          // Pour Montréal et Laval, initialiser avec districts, sinon juste clients
          if (city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval') {
            clientsByCity[city] = {
              clients: [],
              districts: {}
            };
          } else {
            clientsByCity[city] = {
              clients: []
              // Pas de districts pour les autres villes
            };
          }
        }

        // Pour Montréal et Laval, organiser par quartier
        if ((city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval') && district) {
          if (!clientsByCity[city].districts) {
            clientsByCity[city].districts = {};
          }
          
          if (!clientsByCity[city].districts![district]) {
            clientsByCity[city].districts![district] = [];
          }
          
          clientsByCity[city].districts![district].push(clientWithLocation);
        } else {
          // Pour les autres villes, ajouter directement à la liste
          clientsByCity[city].clients.push(clientWithLocation);
        }

        processedCount++;

        // Petit délai pour éviter de surcharger l'API HERE
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Erreur pour le client ${client._id}:`, error);
        // Ajouter quand même le client avec ville inconnue
        const city = 'Inconnu';
        if (!clientsByCity[city]) {
          clientsByCity[city] = { clients: [] };
        }
        clientsByCity[city].clients.push({
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1,
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: 'Inconnu'
        });
        processedCount++;
      }
    }

    // Fonction pour compter les clients d'une ville
    const getCityClientCount = (cityName: string): number => {
      const cityData = clientsByCity[cityName];
      if (!cityData) return 0;
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        return Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      }
      return cityData.clients?.length || 0;
    };

    // Trier les villes : Montréal et Laval en premier, puis le reste par nombre de clients décroissant
    const cityKeys = Object.keys(clientsByCity);
    const sortedCities = cityKeys.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
      const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
      
      // Si les deux sont Montréal/Laval, trier entre eux (Montréal puis Laval)
      if (isAMontrealOrLaval && isBMontrealOrLaval) {
        if (aLower === 'montréal') return -1;
        if (bLower === 'montréal') return 1;
        // Entre Montréal et Laval, trier par nombre de clients décroissant
        const countA = getCityClientCount(a);
        const countB = getCityClientCount(b);
        return countB - countA;
      }
      
      // Si seulement A est Montréal/Laval, A vient en premier
      if (isAMontrealOrLaval) return -1;
      
      // Si seulement B est Montréal/Laval, B vient en premier
      if (isBMontrealOrLaval) return 1;
      
      // Sinon, trier par nombre de clients décroissant
      const countA = getCityClientCount(a);
      const countB = getCityClientCount(b);
      return countB - countA;
    });
    
    const result: Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> = {};
    
    for (const city of sortedCities) {
      result[city] = clientsByCity[city];
      
      // Trier les quartiers par nombre de clients décroissant pour Montréal et Laval
      if (result[city].districts) {
        const sortedDistricts: Record<string, ClientWithLocation[]> = {};
        const districtKeys = Object.keys(result[city].districts!).sort((a, b) => {
          const countA = result[city].districts![a].length;
          const countB = result[city].districts![b].length;
          return countB - countA; // Décroissant
        });
        for (const districtKey of districtKeys) {
          sortedDistricts[districtKey] = result[city].districts![districtKey];
        }
        result[city].districts = sortedDistricts;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`✅ TRAITEMENT TERMINÉ`);
    console.log(`⏱️  Temps total: ${totalTime}s`);
    console.log(`📊 Clients traités: ${processedCount}/${clients.length}`);
    console.log(`🏙️  Villes trouvées: ${sortedCities.length}`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      data: result,
      totalClients: clients.length
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients par ville:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

export default router;

