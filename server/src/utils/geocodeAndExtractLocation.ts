// Fonction utilitaire pour géocoder un client et extraire city, district, sector
// Cette fonction remplace geocodeClient et ajoute l'extraction de city/district/sector
import Client from '../models/Client';
import { 
  MONTREAL_AGGLO_CITIES,
  RIVE_NORD_CITIES,
  RIVE_SUD_CITIES,
  getLavalDistrictFromPostalCode
} from '../config/districts';

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
  
  // Normaliser la ville en enlevant les tirets et espaces pour la comparaison
  const cityNormalized = cityLower.replace(/[-\s]/g, '');
  
  // Villes de l'agglomération de Montréal (normalisées pour comparaison)
  const montrealAggloNormalized = [
    'dollarddesormeaux', 'dollarddesormeaux',
    'kirkland',
    'dorval',
    'pointeclaire',
    'beaconsfield',
    'baiedurfé', 'baiedurfé',
    'hampstead',
    'côtesaintluc', 'cotesaintluc',
    'montroyal',
    'westmount',
    'outremont',
    'pierrefonds', 'pierrefondsroxboro', 'roxboro',
    'sainteannedebellevue', 'steannedebellevue', 'saintannedebellevue',
    'ilebizard', 'îlebizard'
  ];
  
  // Vérifier si la ville normalisée correspond à une ville de l'agglomération
  if (montrealAggloNormalized.some(c => cityNormalized.includes(c) || c.includes(cityNormalized))) {
    return 'Montréal';
  }
  
  // Vérification supplémentaire avec les variations originales (pour compatibilité)
  const montrealAgglo = ['dollard-des-ormeaux', 'dollard des ormeaux', 'dollard-des ormeaux', 'dollard des-ormeaux', 'kirkland', 'dorval', 'pointe-claire', 'pointe claire', 'beaconsfield', 'baie-d\'urfé', 'baie d\'urfé', 'hampstead', 'côte-saint-luc', 'côte saint-luc', 'mont-royal', 'mont royal', 'westmount', 'outremont', 'pierrefonds', 'pierrefonds-roxboro', 'roxboro', 'sainte-anne-de-bellevue', 'ste-anne-de-bellevue', 'saint anne de bellevue', 'ile-bizard', 'île-bizard'];
  if (montrealAgglo.some(c => cityLower.includes(c) || c.includes(cityLower))) {
    return 'Montréal';
  }
  
  // Normaliser les variations de Montréal
  if (cityLower === 'montréal' || cityLower === 'montreal') {
    return 'Montréal';
  }
  
  // Normaliser Laval et ses districts/quartiers
  if (cityLower === 'laval') {
    return 'Laval';
  }
  
  // Reconnaître les districts/quartiers de Laval et les normaliser vers "Laval"
  const lavalDistricts = [
    'le val-st-françois', 'le val-st-francois', 'le val st-françois', 'le val st-francois',
    'val-st-françois', 'val-st-francois', 'val st-françois', 'val st-francois',
    'saint-françois', 'saint françois', 'saint-francois', 'saint francois',
    'st-françois', 'st françois', 'st-francois', 'st francois',
    'auteuil', 'chomedey', 'duvernay', 'fabreville', 'iles-laval', 'laval-des-rapides',
    'laval-ouest', 'pont-viau', 'sainte-dorothée', 'sainte-rose', 'vimont'
  ];
  
  for (const district of lavalDistricts) {
    if (cityLower === district || cityLower.includes(district) || district.includes(cityLower)) {
      return 'Laval';
    }
  }
  
  // Retourner la ville telle quelle (sera classée dans Rive Nord, Rive Sud ou Autres)
  return rawCity;
}

// Fonction pour extraire le code postal d'une chaîne (ex: "123 Main St, Laval, QC H7W 5G2")
function extractPostalCodeFromLabel(label: string): string | undefined {
  // Pattern pour code postal canadien: A1A 1A1 ou A1A1A1
  const postalCodePattern = /\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i;
  const match = label.match(postalCodePattern);
  if (match) {
    return match[1].replace(/\s+/g, '').toUpperCase();
  }
  return undefined;
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
      let city = normalizeCity(rawCity);
      
      // Extraire district (pour Montréal et Laval)
      let district: string | undefined;
      
      // Si la ville a été normalisée vers Montréal (ville de l'agglomération),
      // utiliser la ville originale comme district
      if (city.toLowerCase() === 'montréal' && rawCity.toLowerCase() !== 'montréal' && rawCity.toLowerCase() !== 'montreal') {
        // Fonction pour normaliser les variations d'écriture
        const normalizeCityName = (cityName: string): string => {
          return cityName.toLowerCase()
            .replace(/\s+/g, ' ') // Normaliser les espaces multiples
            .replace(/-/g, ' ') // Remplacer les tirets par des espaces
            .trim();
        };
        
        const normalizedRawCity = normalizeCityName(rawCity);
        
        const agglomerationDistricts: Array<{patterns: string[], district: string}> = [
          { patterns: ['kirkland'], district: 'Kirkland' },
          { patterns: ['dollard', 'ormeaux'], district: 'Dollard-des-Ormeaux' },
          { patterns: ['pierrefonds', 'roxboro'], district: 'Pierrefonds' },
          { patterns: ['dorval'], district: 'Dorval' },
          { patterns: ['pointe', 'claire'], district: 'Pointe-Claire' },
          { patterns: ['beaconsfield'], district: 'Beaconsfield' },
          { patterns: ['westmount'], district: 'Westmount' },
          { patterns: ['outremont'], district: 'Outremont' },
          { patterns: ['côte', 'saint', 'luc'], district: 'Côte-Saint-Luc' },
          { patterns: ['hampstead'], district: 'Hampstead' },
          { patterns: ['mont', 'royal'], district: 'Mont-Royal' },
          { patterns: ['baie', 'urfé'], district: 'Baie-d\'Urfé' },
          { patterns: ['ile', 'bizard', 'île', 'bizard'], district: 'Île-Bizard' },
          { patterns: ['sainte', 'anne', 'bellevue'], district: 'Sainte-Anne-de-Bellevue' },
          { patterns: ['ste', 'anne', 'bellevue'], district: 'Sainte-Anne-de-Bellevue' },
          { patterns: ['saint', 'anne', 'bellevue'], district: 'Sainte-Anne-de-Bellevue' }
        ];
        
        // Chercher la ville originale dans le mapping
        for (const { patterns, district: districtName } of agglomerationDistricts) {
          // Vérifier si tous les mots-clés du pattern sont présents dans la ville normalisée
          const allPatternsMatch = patterns.every(pattern => normalizedRawCity.includes(pattern));
          if (allPatternsMatch) {
            district = districtName;
            console.log(`📍 District trouvé depuis ville normalisée: "${rawCity}" -> "${district}"`);
            break;
          }
        }
      }
      
      // Si la ville normalisée est Laval, extraire le district
      if (city.toLowerCase() === 'laval') {
        district = addressData.district || addressData.subdistrict || undefined;
        
        // Si la ville brute était "Le Val-St-François" ou ses variations, définir le district
        const rawCityLower = rawCity.toLowerCase();
        if (rawCityLower.includes('val-st-françois') || 
            rawCityLower.includes('val-st-francois') ||
            rawCityLower.includes('le val-st-françois') ||
            rawCityLower.includes('le val-st-francois')) {
          district = 'Saint-François';
        }
        
        // Si le district n'a pas été trouvé, utiliser le code postal comme fallback
        if (!district) {
          // HERE API peut retourner le code postal dans postalCode ou dans label
          let postalCode = addressData.postalCode;
          if (!postalCode && addressData.label) {
            postalCode = extractPostalCodeFromLabel(addressData.label);
          }
          // Aussi essayer d'extraire depuis l'adresse originale du client
          if (!postalCode && client.addressLine1) {
            postalCode = extractPostalCodeFromLabel(client.addressLine1);
          }
          
          if (postalCode) {
            district = getLavalDistrictFromPostalCode(postalCode);
            if (district) {
              console.log(`📍 District trouvé via code postal: ${postalCode} -> ${district}`);
            }
          }
        }
      } else if ((city.toLowerCase() === 'montréal')) {
        // Ne définir le district depuis HERE API que s'il n'a pas déjà été défini
        if (!district) {
          district = addressData.district || addressData.subdistrict || undefined;
        }
        
        // Si le district n'a pas été trouvé, chercher dans l'adresse originale
        // pour détecter les villes de l'agglomération (Kirkland, Dollard-des-Ormeaux, etc.)
        if (!district && client.addressLine1) {
          // Fonction pour normaliser les variations d'écriture
          const normalizeAddress = (addr: string): string => {
            return addr.toLowerCase()
              .replace(/\s+/g, ' ') // Normaliser les espaces multiples
              .replace(/-/g, ' ') // Remplacer les tirets par des espaces
              .trim();
          };
          
          const normalizedAddress = normalizeAddress(client.addressLine1);
          
          const agglomerationDistricts: Array<{patterns: string[], district: string}> = [
            { patterns: ['kirkland'], district: 'Kirkland' },
            { patterns: ['dollard', 'ormeaux'], district: 'Dollard-des-Ormeaux' },
            { patterns: ['pierrefonds', 'roxboro'], district: 'Pierrefonds' },
            { patterns: ['dorval'], district: 'Dorval' },
            { patterns: ['pointe', 'claire'], district: 'Pointe-Claire' },
            { patterns: ['beaconsfield'], district: 'Beaconsfield' },
            { patterns: ['westmount'], district: 'Westmount' },
            { patterns: ['outremont'], district: 'Outremont' },
            { patterns: ['côte', 'saint', 'luc'], district: 'Côte-Saint-Luc' },
            { patterns: ['hampstead'], district: 'Hampstead' },
            { patterns: ['mont', 'royal'], district: 'Mont-Royal' },
            { patterns: ['baie', 'urfé'], district: 'Baie-d\'Urfé' },
            { patterns: ['ile', 'bizard', 'île', 'bizard'], district: 'Île-Bizard' },
            { patterns: ['sainte', 'anne', 'bellevue', 'ste', 'anne', 'bellevue'], district: 'Sainte-Anne-de-Bellevue' }
          ];
          
          // Chercher dans l'adresse
          for (const { patterns, district: districtName } of agglomerationDistricts) {
            // Vérifier si tous les mots-clés du pattern sont présents dans l'adresse normalisée
            const allPatternsMatch = patterns.every(pattern => normalizedAddress.includes(pattern));
            if (allPatternsMatch) {
              district = districtName;
              console.log(`📍 District trouvé dans l'adresse: "${patterns.join(' ')}" -> "${district}"`);
              break;
            }
          }
        }
      }
      
      // Si la ville brute était un district de Laval mais n'a pas été normalisée, corriger
      const rawCityLower = rawCity.toLowerCase();
      const lavalDistricts = [
        'le val-st-françois', 'le val-st-francois', 'val-st-françois', 'val-st-francois',
        'saint-françois', 'saint françois', 'saint-francois', 'saint francois',
        'st-françois', 'st françois', 'st-francois', 'st francois'
      ];
      
      for (const lavalDistrict of lavalDistricts) {
        if (rawCityLower.includes(lavalDistrict)) {
          city = 'Laval';
          if (lavalDistrict.includes('val-st-françois') || lavalDistrict.includes('val-st-francois') ||
              lavalDistrict.includes('saint-françois') || lavalDistrict.includes('saint-francois') ||
              lavalDistrict.includes('st-françois') || lavalDistrict.includes('st-francois')) {
            district = 'Saint-François';
          }
          break;
        }
      }
      
      // Si c'est Laval et qu'on n'a toujours pas de district, essayer le code postal une dernière fois
      if (city.toLowerCase() === 'laval' && !district) {
        const postalCode = addressData.postalCode || 
                          (addressData.label ? extractPostalCodeFromLabel(addressData.label) : undefined);
        if (postalCode) {
          district = getLavalDistrictFromPostalCode(postalCode);
          if (district) {
            console.log(`📍 District trouvé via code postal (2e tentative): ${postalCode} -> ${district}`);
          }
        }
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

