// Fonction utilitaire pour géocoder un client et extraire city, district, sector
// Cette fonction remplace geocodeClient et ajoute l'extraction de city/district/sector
import Client from '../models/Client';

// Liste des villes de l'agglomération de Montréal
const MONTREAL_AGGLO_CITIES = [
  'dollard-des-ormeaux',
  'dollard des ormeaux',
  'dollard-des ormeaux',
  'dollard des-ormeaux',
  'kirkland',
  'dorval',
  'pointe-claire',
  'pointe claire',
  'beaconsfield',
  'baie-d\'urfé',
  'baie d\'urfé',
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
  'ste-anne-de-bellevue',
  'ste anne de bellevue',
  'saint anne de bellevue',
  'st-anne-de-bellevue',
  'st anne de bellevue',
  'ile-bizard',
  'île-bizard',
  'pierrefonds-roxboro',
  'pierrefonds',
  'roxboro',
  'sainte-geneviève',
  'sainte geneviève',
  'senneville'
];

// Classification des villes par secteur géographique
const RIVE_NORD_CITIES = [
  'terrebonne', 'blainville', 'repentigny', 'st-eustache', 'saint-eustache',
  'mirabel', 'mascouche', 'st-jérôme', 'saint-jérôme', 'rosemère', 'rosemere',
  'l\'assomption', 'lassomption', 'lorraine', 'bois-des-filion', 'bois des filion',
  'st-joseph-du-lac', 'saint-joseph-du-lac', 'st-lin--laurentides', 'saint-lin--laurentides',
  'ste-thérèse', 'sainte-thérèse', 'oka', 'prévost', 'prevost',
  'ste-marthe-sur-le-lac', 'sainte-marthe-sur-le-lac', 'lanoraie',
  'saint-sauveur', 'st-sauveur', 'boisbriand', 'bois-briand',
  'brownsburg-chatham', 'brownsburg chatham', 'brownsburg', 'charlemagne', 'lavaltrie'
];

const RIVE_SUD_CITIES = [
  'longueuil', 'brossard', 'candiac', 'st-constant', 'saint-constant',
  'châteauguay', 'chateauguay', 'mercier', 'vaudreuil-dorion', 'vaudreuil dorion',
  'sorel-tracy', 'sorel tracy',
  'saint-rémi', 'st-rémi', 'saint remi', 'st remi'
];

// Fonction pour déterminer le secteur d'une ville
export function getSector(city: string): string {
  const cityLower = city.toLowerCase().trim();
  
  // D'abord vérifier si c'est Montréal ou une ville de l'agglomération de Montréal
  if (cityLower === 'montréal' || cityLower === 'montreal') {
    return 'Montréal';
  }
  
  // Vérifier si c'est une ville de l'agglomération de Montréal
  const cityNormalized = cityLower.replace(/\s+/g, ' ');
  for (const agglCity of MONTREAL_AGGLO_CITIES) {
    const agglCityLower = agglCity.toLowerCase();
    if (cityNormalized === agglCityLower || 
        cityNormalized.includes(agglCityLower) || 
        agglCityLower.includes(cityNormalized)) {
      // Vérification flexible (sans espaces/tirets)
      const cityClean = cityNormalized.replace(/[-\s]/g, '');
      const agglCityClean = agglCityLower.replace(/[-\s]/g, '');
      if (cityClean === agglCityClean || 
          cityClean.includes(agglCityClean) || 
          agglCityClean.includes(cityClean)) {
        return 'Montréal';
      }
    }
  }
  
  if (cityLower === 'laval') {
    return 'Laval';
  }
  
  // Vérifier si c'est une ville de la Rive Nord
  for (const riveNordCity of RIVE_NORD_CITIES) {
    if (cityLower === riveNordCity || cityLower.includes(riveNordCity) || riveNordCity.includes(cityLower)) {
      return 'Rive Nord';
    }
  }
  
  // Vérification flexible pour Rive Nord
  const cityClean = cityLower.replace(/[-\s]/g, '');
  for (const riveNordCity of RIVE_NORD_CITIES) {
    const riveNordCityClean = riveNordCity.replace(/[-\s]/g, '');
    if (cityClean === riveNordCityClean || cityClean.includes(riveNordCityClean) || riveNordCityClean.includes(cityClean)) {
      return 'Rive Nord';
    }
  }
  
  // Vérifier si c'est une ville de la Rive Sud
  for (const riveSudCity of RIVE_SUD_CITIES) {
    if (cityLower === riveSudCity || cityLower.includes(riveSudCity) || riveSudCity.includes(cityLower)) {
      return 'Rive Sud';
    }
  }
  
  // Vérification flexible pour Rive Sud
  for (const riveSudCity of RIVE_SUD_CITIES) {
    const riveSudCityClean = riveSudCity.replace(/[-\s]/g, '');
    if (cityClean === riveSudCityClean || cityClean.includes(riveSudCityClean) || riveSudCityClean.includes(cityClean)) {
      return 'Rive Sud';
    }
  }
  
  return 'Autres';
}

// Normaliser la ville (simplifié - regrouper les villes de l'agglomération sous Montréal)
function normalizeCity(rawCity: string): string {
  const cityLower = rawCity.toLowerCase().trim();
  
  // Villes de l'agglomération de Montréal
  const montrealAgglo = ['dollard-des-ormeaux', 'dollard des ormeaux', 'kirkland', 'dorval', 'pointe-claire', 'beaconsfield', 'baie-d\'urfé', 'hampstead', 'côte-saint-luc', 'mont-royal', 'mont royal', 'westmount', 'outremont'];
  if (montrealAgglo.some(c => cityLower.includes(c))) {
    return 'Montréal';
  }
  
  // Normaliser les variations de Montréal
  if (cityLower === 'montréal' || cityLower === 'montreal') {
    return 'Montréal';
  }
  
  // Normaliser Laval
  if (cityLower === 'laval') {
    return 'Laval';
  }
  
  // Retourner la ville telle quelle (sera classée dans Rive Nord, Rive Sud ou Autres)
  return rawCity;
}

export async function geocodeAndExtractLocation(clientId: string): Promise<{ 
  success: boolean; 
  coordinates?: { lng: number; lat: number };
  city?: string;
  district?: string;
  sector?: string;
  error?: string;
}> {
  try {
    const client = await Client.findById(clientId);
    
    if (!client) {
      return { success: false, error: 'Client non trouvé' };
    }

    if (!client.addressLine1 || client.addressLine1.trim() === '') {
      return { success: false, error: 'Client sans adresse' };
    }

    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      console.error('HERE_API_KEY non configuré');
      return { success: false, error: 'HERE_API_KEY non configuré' };
    }

    // Géocodage avec HERE API
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(client.addressLine1)}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HERE API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const position = data.items[0].position;
      const coordinates = { lng: position.lng, lat: position.lat };
      const addressData = data.items[0].address;
      
      // Extraire city depuis la réponse HERE
      const rawCity = addressData.city || addressData.county || '';
      const city = normalizeCity(rawCity);
      
      // Extraire district (pour Montréal et Laval)
      let district: string | undefined;
      if ((city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval')) {
        district = addressData.district || addressData.subdistrict || undefined;
      }
      
      // Déterminer le secteur
      const sector = getSector(city);
      
      // Mettre à jour le client avec toutes les informations
      await Client.updateOne(
        { _id: clientId },
        {
          $set: {
            coordinates: coordinates,
            city: city,
            district: district,
            sector: sector
          }
        }
      );

      console.log(`✅ Client géocodé et localisé: ${client.givenName} -> ${city}${district ? ` (${district})` : ''} [${sector}]`);
      
      return { 
        success: true, 
        coordinates: coordinates,
        city: city,
        district: district,
        sector: sector
      };
    } else {
      console.log(`❌ Aucun résultat HERE API pour ${client.givenName} (${client.addressLine1})`);
      return { success: false, error: 'Adresse non trouvée par HERE API' };
    }
  } catch (error) {
    console.error(`❌ Erreur lors du géocodage du client ${clientId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur inconnue' 
    };
  }
}

