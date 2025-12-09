import { Router, Request, Response } from 'express';
import Client from '../models/Client';
import { ClientByCityCache } from '../models/ClientCache';
import {
  MONTREAL_AGGLO_CITIES,
  LAVAL_DISTRICTS_SEARCH_LIST,
  MONTREAL_DISTRICTS_SEARCH_LIST,
  LAVAL_NORMALIZED_CITIES,
  RIVE_NORD_CITIES,
  RIVE_SUD_CITIES,
  validateLavalDistrict,
  getLavalDistrictFromPostalCode
} from '../config/districts';
import { getSector } from '../utils/geocodeAndExtractLocation';

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
  sector?: string;
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
  }> | Record<string, Record<string, {
    clients: ClientWithLocation[];
    districts?: Record<string, ClientWithLocation[]>;
  }>> | Record<string, {
    districts?: Record<string, ClientWithLocation[]>;
    clients: ClientWithLocation[];
  }>;
  sectors?: Record<string, Record<string, {
    clients: ClientWithLocation[];
    districts?: Record<string, ClientWithLocation[]>;
  }>>;
  totalClients?: number;
  totalTime?: string;
  error?: string;
}

// Les listes de districts sont maintenant importées depuis ../config/districts.ts

// Fonction pour extraire le préfixe du code postal (3 premiers caractères)
function extractPostalCodePrefix(postalCode: string | undefined | null): string | null {
  if (!postalCode) return null;
  // Nettoyer le code postal (enlever espaces, tirets)
  const cleaned = postalCode.replace(/[\s-]/g, '').toUpperCase();
  // Extraire les 3 premiers caractères (ex: H7W de H7W5G2)
  if (cleaned.length >= 3) {
    return cleaned.substring(0, 3);
  }
  return null;
}

// Fonction pour obtenir le quartier depuis le code postal
// Pour les codes postaux partagés, on privilégie Sainte-Dorothée si c'est une option
function getDistrictFromPostalCode(postalCode: string | undefined | null): string | undefined {
  return getLavalDistrictFromPostalCode(postalCode || '');
}

// Les listes et fonctions sont maintenant importées depuis ../config/districts.ts et ../utils/geocodeAndExtractLocation.ts

// Fonction pour extraire le nom de rue d'une adresse (avec ville pour éviter les ambiguïtés)
function extractStreetName(address: string, city?: string): string | null {
  if (!address || address.trim() === '') {
    return null;
  }
  
  // Enlever les numéros au début
  const cleaned = address.trim().replace(/^\d+[\s-]*/, '');
  
  // Extraire le nom de rue (avant les mots comme "rue", "avenue", "boulevard", etc.)
  const streetPattern = /^(rue|avenue|av|boulevard|boul|chemin|ch|route|rte|impasse|place|pl|drive|dr|court|ct|circle|cir|lane|ln|street|st|road|rd)\s+(.+?)(?:\s*,\s*|$)/i;
  const match = cleaned.match(streetPattern);
  
  let streetName: string | null = null;
  
  if (match && match[2]) {
    // Enlever les informations après la virgule (ville, code postal, etc.)
    streetName = match[2].split(',')[0].trim();
  } else {
    // Si pas de pattern trouvé, prendre les premiers mots (sans le numéro)
    const words = cleaned.split(/\s+/);
    if (words.length >= 2) {
      streetName = words.slice(0, 2).join(' ');
    }
  }
  
  if (!streetName) {
    return null;
  }
  
  // Si on a la ville, l'inclure dans la clé pour éviter les ambiguïtés entre villes différentes
  // Ex: "rue Notre Dame" à Mirabel vs "rue Notre Dame" à Laval
  if (city) {
    const cityNormalized = city.toLowerCase().trim();
    return `${streetName.toLowerCase()}|${cityNormalized}`;
  }
  
  return streetName.toLowerCase();
}

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
  const lavalCitiesArray = Array.from(LAVAL_NORMALIZED_CITIES);
  
  if (lavalCitiesArray.includes(cityNormalized as any) ||
      lavalCitiesArray.includes(cityNoSpaces as any) ||
      lavalCitiesArray.includes(cityNoDashes as any)) {
    return 'Laval';
  }
  
  // Vérification partielle pour "Le val-st-françois"
  for (const lavalCity of lavalCitiesArray) {
    const lavalCityClean = lavalCity.toLowerCase().replace(/[-\s]/g, '');
    const cityClean = cityNormalized.replace(/[-\s]/g, '');
    if (lavalCityClean === cityClean) {
      return 'Laval';
    }
  }
  
  // Vérifier si c'est une ville de l'agglomération de Montréal (comparaison flexible)
  const agglCitiesArray = Array.from(MONTREAL_AGGLO_CITIES);
  if (agglCitiesArray.includes(cityNormalized as any) ||
      agglCitiesArray.includes(cityNoSpaces as any) ||
      agglCitiesArray.includes(cityNoDashes as any)) {
    return 'Montréal';
  }
  
  // Vérification partielle pour les cas comme "Dollard-des-Ormeaux" vs "dollard-des-ormeaux"
  for (const agglCity of agglCitiesArray) {
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

// Fonction pour extraire la ville depuis les coordonnées GPS (reverse geocoding)
// Avec retry et gestion des rate limits
async function extractCityFromCoordinates(lng: number, lat: number, retryCount: number = 0): Promise<{ city: string; district?: string } | null> {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 1000; // 1 seconde
  
  try {
    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      return null;
    }

    // Reverse geocoding avec HERE API
    const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apiKey=${HERE_API_KEY}&limit=1`;
    const response = await fetch(url);

    // Gérer les erreurs 429 (Too Many Requests) avec retry
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount); // Backoff exponentiel
        console.warn(`⚠️ Rate limit atteint pour reverse geocoding (${lat}, ${lng}). Retry ${retryCount + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractCityFromCoordinates(lng, lat, retryCount + 1);
      } else {
        console.error(`❌ Rate limit persistant après ${MAX_RETRIES} tentatives pour reverse geocoding (${lat}, ${lng})`);
        return null;
      }
    }

    if (!response.ok) {
      // Pour les autres erreurs, retry aussi
      if (retryCount < MAX_RETRIES && (response.status >= 500 || response.status === 408)) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount);
        console.warn(`⚠️ Erreur ${response.status} pour reverse geocoding (${lat}, ${lng}). Retry ${retryCount + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractCityFromCoordinates(lng, lat, retryCount + 1);
      }
      return null;
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const addressData = item.address;
      const rawCity = addressData.city || addressData.county || '';
      const city = normalizeCity(rawCity);
      
      let district: string | undefined;
      if ((city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval')) {
        const rawDistrict = addressData.district || addressData.subdistrict || undefined;
        // Pour Laval, valider que le quartier est dans la liste des quartiers valides
        if (city.toLowerCase() === 'laval' && rawDistrict) {
          district = validateLavalDistrict(rawDistrict);
          if (!district) {
            console.log(`[DEBUG LAVAL GPS] ⚠️  District de GPS non valide (pas dans les codes postaux): "${rawDistrict}" - sera ignoré`);
          }
        } else {
          district = rawDistrict;
        }
      }
      
      return { city, district };
    }
    
    return null;
  } catch (error) {
    console.error('Erreur reverse geocoding:', error);
    return null;
  }
}

// Fonction pour extraire la ville et le quartier depuis l'adresse avec HERE API
// Avec retry et gestion des rate limits
async function extractCityAndDistrict(address: string, retryCount: number = 0): Promise<{ city: string; district?: string }> {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 1000; // 1 seconde
  
  try {
    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      throw new Error('HERE_API_KEY non configuré dans les variables d\'environnement');
    }

    // Appel à l'API HERE Geocoding
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
    const response = await fetch(url);

    // Gérer les erreurs 429 (Too Many Requests) avec retry
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount); // Backoff exponentiel
        console.warn(`⚠️ Rate limit atteint pour "${address.substring(0, 50)}...". Retry ${retryCount + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractCityAndDistrict(address, retryCount + 1);
      } else {
        console.error(`❌ Rate limit persistant après ${MAX_RETRIES} tentatives pour "${address.substring(0, 50)}..."`);
        throw new Error(`Rate limit: trop de requêtes (429)`);
      }
    }

    if (!response.ok) {
      // Pour les autres erreurs, retry aussi
      if (retryCount < MAX_RETRIES && (response.status >= 500 || response.status === 408)) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount);
        console.warn(`⚠️ Erreur ${response.status} pour "${address.substring(0, 50)}...". Retry ${retryCount + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractCityAndDistrict(address, retryCount + 1);
      }
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
            // Pour Laval, valider que le quartier est dans la liste des quartiers valides
            if (city.toLowerCase() === 'laval') {
              const validatedDistrict = validateLavalDistrict(rawDistrict);
              if (validatedDistrict) {
                district = validatedDistrict;
                console.log(`[DEBUG LAVAL] ✅ District validé depuis HERE: "${rawDistrict}" -> "${district}"`);
              } else {
                console.log(`[DEBUG LAVAL] ⚠️  District de HERE non valide (pas dans les codes postaux): "${rawDistrict}" - sera ignoré`);
                district = undefined; // Ignorer les quartiers non valides
              }
            } else {
              // Pour Montréal, accepter le district tel quel
            district = rawDistrict;
            console.log(`[DEBUG VAL-ST-FRANÇOIS] ⚠️  District non normalisé: "${rawDistrict}"`);
            }
          }
        }

        // Si pas trouvé, essayer de l'extraire depuis l'adresse complète
        if (!district) {
          const fullAddress = item.title?.toLowerCase() || '';
          const addressLabel = addressData.label?.toLowerCase() || '';
          // Utiliser l'adresse originale AVANT normalisation par HERE pour ne pas perdre les quartiers
          const originalAddress = address.toLowerCase();
          const searchText = `${fullAddress} ${addressLabel} ${originalAddress}`;
          
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
            // Utiliser le nom de la ville comme quartier (formater correctement)
            // Gérer les cas spéciaux comme "Ste-anne-de-bellevue" -> "Sainte-Anne-de-Bellevue"
            const words = rawCity.split(/[- ]/);
            district = words.map((word: string) => {
              const wordLower = word.toLowerCase();
              // Gérer les abréviations courantes
              if (wordLower === 'st' || wordLower === 'ste') {
                return wordLower === 'st' ? 'Saint' : 'Sainte';
              }
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join('-');
            console.log(`[DEBUG] Ville agglo détectée: "${rawCity}" -> Quartier: "${district}" sous Montréal`);
          } else {
            // Liste de quartiers connus pour Montréal et Laval
            // Utiliser les listes centralisées depuis ../config/districts.ts
            const allDistricts = [...MONTREAL_DISTRICTS_SEARCH_LIST, ...LAVAL_DISTRICTS_SEARCH_LIST];
            
            // Si district n'a pas encore été défini, chercher dans la liste
            if (!district) {
              // Normaliser le searchText pour la recherche (enlever accents, normaliser espaces/tirets)
              const normalizedSearchText = searchText
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
                .toLowerCase()
                .replace(/[-\s]+/g, ' '); // Normaliser tirets et espaces
              
              for (const knownDistrict of allDistricts) {
                // Normaliser aussi le quartier connu pour la comparaison
                const normalizedDistrict = knownDistrict
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
                  .toLowerCase()
                  .replace(/[-\s]+/g, ' '); // Normaliser tirets et espaces
                
                // Recherche flexible : avec ou sans tirets/espaces
                if (normalizedSearchText.includes(normalizedDistrict) || searchText.includes(knownDistrict)) {
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
                    console.log(`[DEBUG LAVAL] ✅ District trouvé dans adresse: "${knownDistrict}" -> "Saint-François"`);
                  } else if (knownDistrict.includes('st-françois') || 
                            knownDistrict.includes('st-francois') ||
                            knownDistrict.includes('st françois') ||
                            knownDistrict.includes('st francois') ||
                            knownDistrict.includes('saint-françois') ||
                            knownDistrict.includes('saint-francois') ||
                            knownDistrict.includes('saint françois') ||
                            knownDistrict.includes('saint francois')) {
                    district = 'Saint-François';
                    console.log(`[DEBUG LAVAL] ✅ District trouvé dans adresse: "${knownDistrict}" -> "Saint-François"`);
                  } else if (knownDistrict.includes('dorothée') || knownDistrict.includes('dorothee')) {
                    // Normaliser toutes les variations de Sainte-Dorothée (y compris St-Dorothée-Station) vers Sainte-Dorothée
                    district = 'Sainte-Dorothée';
                    console.log(`[DEBUG LAVAL] ✅ District trouvé dans adresse: "${knownDistrict}" -> "${district}" (St-Dorothée-Station fusionné)`);
                  } else if (knownDistrict.includes('rose')) {
                    // Normaliser Sainte-Rose / Saint-Rose
                    district = 'Sainte-Rose';
                    console.log(`[DEBUG LAVAL] ✅ District trouvé dans adresse: "${knownDistrict}" -> "${district}"`);
                  } else {
                    // Formater le nom du quartier (première lettre en majuscule)
                    const formattedDistrict = knownDistrict.split(/[- ]/).map(word => {
                      const wordLower = word.toLowerCase();
                      // Gérer les abréviations
                      if (wordLower === 'st' || wordLower === 'ste') {
                        return wordLower === 'st' ? 'Saint' : 'Sainte';
                      }
                      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    }).join('-');
                    
                    // Pour Laval, valider que le quartier formaté est dans la liste des quartiers valides
                    if (city.toLowerCase() === 'laval') {
                      const validatedDistrict = validateLavalDistrict(formattedDistrict);
                      if (validatedDistrict) {
                        district = validatedDistrict;
                        console.log(`[DEBUG LAVAL] ✅ District trouvé dans adresse: "${knownDistrict}" -> "${district}"`);
                      } else {
                        console.log(`[DEBUG LAVAL] ⚠️  District trouvé dans adresse non valide (pas dans les codes postaux): "${formattedDistrict}" - sera ignoré`);
                        district = undefined; // Ignorer les quartiers non valides
                      }
                    } else {
                      district = formattedDistrict;
                    }
                  }
                  break;
                }
              }
              
              // Si toujours pas de district pour Laval, essayer avec le code postal
              if (!district && city.toLowerCase() === 'laval') {
                // Extraire le code postal depuis l'API HERE
                const postalCode = addressData.postalCode;
                if (postalCode) {
                  const districtFromPostal = getDistrictFromPostalCode(postalCode);
                  if (districtFromPostal) {
                    district = districtFromPostal;
                    console.log(`[DEBUG LAVAL] ✅ District trouvé via code postal: "${postalCode}" -> "${district}"`);
                  } else {
                    console.log(`[DEBUG LAVAL] ⚠️  Code postal "${postalCode}" non mappé vers un quartier`);
                  }
                }
                
                // Si toujours pas de district, logger pour debug
                if (!district) {
                  console.log(`[DEBUG LAVAL] ⚠️  Aucun district trouvé dans l'adresse: ${address.substring(0, 100)}`);
                  console.log(`[DEBUG LAVAL]    searchText: ${searchText.substring(0, 200)}`);
                  if (postalCode) {
                    console.log(`[DEBUG LAVAL]    Code postal: ${postalCode} (préfixe: ${extractPostalCodePrefix(postalCode) || 'N/A'})`);
                  }
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

    // Récupérer TOUS les clients
    const allClients = await Client.find({});
    const clientsWithAddress = allClients.filter(c => c.addressLine1 && c.addressLine1.trim() !== '');
    const clientsWithoutAddress = allClients.filter(c => !c.addressLine1 || c.addressLine1.trim() === '');

    console.log(`\n========================================`);
    console.log(`🚀 DÉBUT DU TRAITEMENT`);
    console.log(`📊 Total de clients: ${allClients.length}`);
    console.log(`📊 Clients avec adresse: ${clientsWithAddress.length}`);
    console.log(`📊 Clients sans adresse: ${clientsWithoutAddress.length}`);
    console.log(`========================================\n`);

    sendProgress({ type: 'start', total: allClients.length, message: `Début du traitement de ${allClients.length} clients...` });

    // Organiser les clients par secteur, puis par ville et quartier
    const clientsBySector: Record<string, Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }>> = {};

    // Section spéciale pour les clients non assignés
    const unassignedClients: {
      noAddress: ClientWithLocation[];
      unknownCity: ClientWithLocation[];
      ambiguousAddress: ClientWithLocation[];
    } = {
      noAddress: [],
      unknownCity: [],
      ambiguousAddress: []
    };

    // Map pour détecter les adresses ambiguës (même nom de rue dans plusieurs secteurs)
    const streetNameToSectors = new Map<string, Set<string>>();
    // Map pour stocker les informations des clients (pour éviter de refaire les appels API)
    const clientInfoMap = new Map<string, { city: string; sector: string; streetName: string | null; location: { sector: string; city?: string; district?: string } }>();
    
    // Set pour tracker tous les clients qui ont été traités avec succès (ajoutés dans un secteur)
    const processedClientIds = new Set<string>();
    // Set pour tracker tous les clients qui ont été ajoutés dans "Non assignés"
    const unassignedClientIds = new Set<string>();

    // Ajouter les clients sans adresse
    clientsWithoutAddress.forEach(client => {
      const clientId = client._id.toString();
      unassignedClients.noAddress.push({
        _id: clientId,
        givenName: client.givenName || '',
        familyName: client.familyName || '',
        phoneNumber: client.phoneNumber ?? undefined,
        addressLine1: '',
        coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
          ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
          : undefined,
        city: 'Sans adresse'
      });
      unassignedClientIds.add(clientId);
    });

    let processedCount = 0;
    const startTime = Date.now();

    // Traiter les clients avec un délai pour éviter de surcharger l'API
    for (let i = 0; i < clientsWithAddress.length; i++) {
      const client = clientsWithAddress[i];
      
      if (!client.addressLine1) {
        processedCount++;
        continue;
      }

      // Délai progressif pour éviter les rate limits (50ms tous les 10 clients)
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      try {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
        console.log(`[${i + 1}/${clientsWithAddress.length}] Traitement: ${clientName} - ${client.addressLine1}`);
        
        // Extraire la ville depuis l'adresse textuelle d'abord (plus fiable)
        let addressResult: { city: string; district?: string };
        try {
          addressResult = await extractCityAndDistrict(client.addressLine1);
        } catch (error) {
          // Si l'API échoue après tous les retries, utiliser le fallback textuel
          console.warn(`⚠️  Erreur HERE API pour ${clientName} (${client.addressLine1}):`, error);
          
          // Fallback : chercher la ville directement dans l'adresse textuelle
          const addressLower = client.addressLine1.toLowerCase();
          let fallbackCity = 'Inconnu';
          
          // Chercher les villes connues dans l'adresse
          if (addressLower.includes('montréal') || addressLower.includes('montreal')) {
            fallbackCity = 'Montréal';
          } else if (addressLower.includes('laval')) {
            fallbackCity = 'Laval';
          } else {
            // Chercher dans les listes de villes
            for (const riveNordCity of RIVE_NORD_CITIES) {
              if (addressLower.includes(riveNordCity.toLowerCase())) {
                fallbackCity = riveNordCity;
                break;
              }
            }
            if (fallbackCity === 'Inconnu') {
              for (const riveSudCity of RIVE_SUD_CITIES) {
                if (addressLower.includes(riveSudCity.toLowerCase())) {
                  fallbackCity = riveSudCity;
                  break;
                }
              }
            }
            if (fallbackCity === 'Inconnu') {
              for (const agglCity of MONTREAL_AGGLO_CITIES) {
                if (addressLower.includes(agglCity.toLowerCase())) {
                  fallbackCity = 'Montréal'; // Normaliser vers Montréal
                  break;
                }
              }
            }
          }
          
          addressResult = { city: fallbackCity };
        }
        
        const city: string = addressResult.city;
        let district: string | undefined = addressResult.district;
        
        // Log pour les clients de Laval sans district
        if (city.toLowerCase() === 'laval' && !district) {
          console.log(`  ⚠️  [LAVAL SANS QUARTIER] ${clientName}`);
          console.log(`      Adresse: ${client.addressLine1}`);
          console.log(`      Ville détectée: ${city}, District depuis adresse: ${district || 'NON DÉTECTÉ'}`);
        }
        
        // Si le client a des coordonnées GPS, les utiliser pour valider/améliorer la détection
        if (client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null) {
          const coordsResult = await extractCityFromCoordinates(client.coordinates.lng, client.coordinates.lat);
          if (coordsResult) {
            // Vérifier si les coordonnées GPS donnent une ville différente de l'adresse
            // Si l'adresse contient explicitement une ville (ex: "Montréal, QC"), on la privilégie
            const addressLower = client.addressLine1.toLowerCase();
            const hasExplicitCity = addressLower.includes('montréal') || 
                                   addressLower.includes('montreal') ||
                                   addressLower.includes('laval') ||
                                   addressLower.includes('saskatoon') ||
                                   addressLower.includes('terrebonne') ||
                                   addressLower.includes('mirabel');
            
            if (hasExplicitCity) {
              // Si l'adresse contient explicitement une ville, on la privilégie
              console.log(`  📍 Ville de l'adresse privilégiée: ${city} (GPS suggérait: ${coordsResult.city})`);
              // Mais essayer quand même d'obtenir le district depuis les coordonnées si pas déjà trouvé
              if (coordsResult.district && !district && city.toLowerCase() === 'laval') {
                district = coordsResult.district;
                console.log(`  ✅ [LAVAL] District trouvé via GPS: ${district} pour ${clientName}`);
              }
            } else if (coordsResult.city.toLowerCase() !== city.toLowerCase()) {
              // Si les coordonnées GPS donnent une ville différente et que l'adresse n'est pas explicite,
              // utiliser les coordonnées GPS mais logger un avertissement
              console.log(`  ⚠️  Conflit détecté: Adresse → ${city}, GPS → ${coordsResult.city}. Utilisation de l'adresse.`);
            } else {
              // Les deux concordent, utiliser le district des coordonnées si disponible
              if (coordsResult.district && !district) {
                district = coordsResult.district;
                if (city.toLowerCase() === 'laval') {
                  console.log(`  ✅ [LAVAL] District trouvé via GPS: ${district} pour ${clientName}`);
                } else {
                  console.log(`  📍 Quartier déterminé via GPS: ${district}`);
                }
              } else if (city.toLowerCase() === 'laval' && !district) {
                console.log(`  ⚠️  [LAVAL] GPS ne fournit pas de district non plus pour ${clientName}`);
                console.log(`      Coordonnées: ${client.coordinates.lat}, ${client.coordinates.lng}`);
                console.log(`      Résultat GPS: ville=${coordsResult.city}, district=${coordsResult.district || 'NON DÉTECTÉ'}`);
              }
            }
          } else if (city.toLowerCase() === 'laval' && !district) {
            console.log(`  ⚠️  [LAVAL] Erreur lors du reverse geocoding pour ${clientName}`);
          }
        } else if (city.toLowerCase() === 'laval' && !district) {
          console.log(`  ⚠️  [LAVAL] Pas de coordonnées GPS disponibles pour ${clientName}`);
        }
        
        // Dernière tentative : essayer d'extraire le code postal depuis l'adresse originale
        // et l'utiliser pour trouver le quartier (si pas déjà fait dans extractCityAndDistrict)
        if (city.toLowerCase() === 'laval' && !district) {
          // Extraire le code postal depuis l'adresse (format canadien: H#A #A#)
          const postalCodeMatch = client.addressLine1.match(/\b([A-Z]\d[A-Z])\s*\d[A-Z]\d\b/i);
          if (postalCodeMatch) {
            const postalCode = postalCodeMatch[1].toUpperCase();
            const districtFromPostal = getDistrictFromPostalCode(postalCode);
            if (districtFromPostal) {
              district = districtFromPostal;
              console.log(`  ✅ [LAVAL] District trouvé via code postal extrait de l'adresse: "${postalCode}" -> "${district}" pour ${clientName}`);
            } else {
              console.log(`  ⚠️  [LAVAL] Code postal "${postalCode}" extrait mais non mappé vers un quartier pour ${clientName}`);
            }
          }
        }
        
        // Détecter les adresses ambiguës (extraire le nom de rue avec la ville pour éviter les ambiguïtés)
        const streetName = extractStreetName(client.addressLine1, city);
        const sector = getSector(city);
        
        // Stocker temporairement où le client sera ajouté (sera mis à jour après l'ajout)
        const clientLocation = { sector, city: undefined as string | undefined, district: undefined as string | undefined };
        
        if (streetName) {
          if (!streetNameToSectors.has(streetName)) {
            streetNameToSectors.set(streetName, new Set());
          }
          streetNameToSectors.get(streetName)!.add(sector);
        }
        
        // Log spécial pour Sainte-Anne-de-Bellevue
        if (client.addressLine1.toLowerCase().includes('bellevue') || 
            client.addressLine1.toLowerCase().includes('ste-anne') ||
            client.addressLine1.toLowerCase().includes('sainte-anne')) {
          console.log(`  🔍 [DEBUG STE-ANNE] Adresse: ${client.addressLine1}`);
          console.log(`  🔍 [DEBUG STE-ANNE] Ville: "${city}", Quartier: "${district || 'N/A'}"`);
        }
        
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

        // Initialiser le secteur s'il n'existe pas (sector déjà calculé plus haut)
        if (!clientsBySector[sector]) {
          clientsBySector[sector] = {};
        }
        
        // Pour Montréal et Laval, mettre directement les quartiers au niveau du secteur (pas de sous-niveau ville)
        if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
            (sector === 'Laval' && city.toLowerCase() === 'laval')) {
          // Utiliser le nom du secteur comme clé (pas la ville)
          const sectorKey = sector;
          
          if (!clientsBySector[sector][sectorKey]) {
            clientsBySector[sector][sectorKey] = {
              clients: [],
              districts: {}
            };
          }
          
          // Organiser par quartier
          if (district) {
            if (!clientsBySector[sector][sectorKey].districts) {
              clientsBySector[sector][sectorKey].districts = {};
            }
            
            if (!clientsBySector[sector][sectorKey].districts![district]) {
              clientsBySector[sector][sectorKey].districts![district] = [];
              console.log(`  🏘️  Nouveau quartier ajouté: ${district} (${sector})`);
            }
            
            clientsBySector[sector][sectorKey].districts![district].push(clientWithLocation);
            clientLocation.district = district;
          } else {
            // Si pas de quartier, ajouter directement aux clients
            clientsBySector[sector][sectorKey].clients.push(clientWithLocation);
          }
        } else {
          // Pour les autres villes (pas Montréal/Laval dans leur secteur), créer une entrée ville normale
          if (!clientsBySector[sector][city]) {
            clientsBySector[sector][city] = {
              clients: []
              // Pas de districts pour les autres villes
            };
          }
          console.log(`  📍 Nouvelle ville ajoutée: ${city} (Secteur: ${sector})`);
          
          // Ajouter directement à la liste des clients de la ville
          clientsBySector[sector][city].clients.push(clientWithLocation);
          clientLocation.city = city;
        }
        
        // Stocker les informations du client pour éviter de refaire les appels API
        const clientId = client._id.toString();
        clientInfoMap.set(clientId, { city, sector, streetName, location: clientLocation });
        processedClientIds.add(clientId); // Marquer ce client comme traité avec succès

        processedCount++;
        const progress = Math.round((processedCount / allClients.length) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const estimated = processedCount > 0 ? ((Date.now() - startTime) / processedCount * (allClients.length - processedCount) / 1000).toFixed(1) : '0';

        // Envoyer la progression toutes les 5 clients ou à chaque ville/quartier ajouté
        if (processedCount % 5 === 0 || i === clientsWithAddress.length - 1) {
          sendProgress({
            type: 'progress',
            processed: processedCount,
          total: allClients.length,
            progress: progress,
            elapsed: `${elapsed}s`,
            estimated: `${estimated}s`,
            currentClient: clientName,
            city: city,
            district: district
          });
        }

        // Envoyer les données mises à jour avec la structure par secteur
        sendProgress({
          type: 'update',
          data: clientsBySector // Envoyer la structure par secteur
        });

        // Petit délai pour éviter de surcharger l'API HERE
        if (i < clientsWithAddress.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour le client ${client._id}:`, error);
        // Ajouter le client avec ville inconnue dans la section non assignée
        const clientId = client._id.toString();
        unassignedClients.unknownCity.push({
          _id: clientId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1 || '',
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: 'Inconnu'
        });
        unassignedClientIds.add(clientId);
        processedCount++;
      }
    }
    
    // Identifier les clients avec adresses ambiguës (même nom de rue dans plusieurs secteurs)
    // Utiliser les informations déjà stockées pour éviter de refaire les appels API
    const ambiguousClientIds = new Set<string>();
    
    for (let i = 0; i < clientsWithAddress.length; i++) {
      const client = clientsWithAddress[i];
      if (!client.addressLine1) continue;
      
      const clientInfo = clientInfoMap.get(client._id.toString());
      if (!clientInfo) continue;
      
      const { streetName, city, location } = clientInfo;
      
      if (streetName && streetNameToSectors.has(streetName)) {
        const sectors = streetNameToSectors.get(streetName)!;
        if (sectors.size > 1) {
          // Cette adresse existe dans plusieurs secteurs
          ambiguousClientIds.add(client._id.toString());
          
          // Retirer le client de son secteur actuel en utilisant les informations de localisation
          const { sector, city: clientCity, district } = location;
          
          if (clientsBySector[sector]) {
            // Pour Montréal et Laval
            if ((sector === 'Montréal' || sector === 'Laval') && clientsBySector[sector][sector]) {
              const sectorData = clientsBySector[sector][sector];
              if (district && sectorData.districts && sectorData.districts[district]) {
                // Retirer du district spécifique
                sectorData.districts[district] = sectorData.districts[district].filter(
                  c => c._id !== client._id.toString()
                );
                // Si le district est vide, on peut le supprimer (optionnel)
                if (sectorData.districts[district].length === 0) {
                  delete sectorData.districts[district];
                }
              } else {
                // Retirer des clients sans district
                sectorData.clients = sectorData.clients.filter(
                  c => c._id !== client._id.toString()
                );
              }
            } else if (clientCity && clientsBySector[sector][clientCity]) {
              // Pour les autres secteurs, retirer de la ville spécifique
              const cityData = clientsBySector[sector][clientCity];
              if (cityData.clients) {
                cityData.clients = cityData.clients.filter(
                  c => c._id !== client._id.toString()
                );
                // Si la ville est vide, on peut la supprimer (optionnel)
                if (cityData.clients.length === 0) {
                  delete clientsBySector[sector][clientCity];
                }
              }
            }
          }
          
          // Ajouter aux non assignés
          const clientId = client._id.toString();
          unassignedClients.ambiguousAddress.push({
            _id: clientId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1,
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
            city: city,
            district: `Ambiguë (${Array.from(sectors).join(', ')})`
          });
          unassignedClientIds.add(clientId);
          // Retirer de processedClientIds car on le déplace vers non assignés
          processedClientIds.delete(clientId);
        }
      }
    }
    
    // Identifier les clients qui n'ont pas été traités du tout
    const notProcessedClients: ClientWithLocation[] = [];
    for (const client of clientsWithAddress) {
      const clientId = client._id.toString();
      // Si le client n'est ni dans processedClientIds ni dans unassignedClientIds, il n'a pas été traité
      if (!processedClientIds.has(clientId) && !unassignedClientIds.has(clientId)) {
        console.log(`  ⚠️  Client non traité détecté: ${client.givenName} ${client.familyName} - ${client.addressLine1}`);
        notProcessedClients.push({
          _id: clientId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1 || '',
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: 'Non traité'
        });
      }
    }
    
    // Ajouter les clients non traités dans "Non assignés"
    if (notProcessedClients.length > 0) {
      console.log(`  ⚠️  ${notProcessedClients.length} client(s) non traité(s) ajouté(s) dans "Non assignés"`);
      // Ajouter dans unknownCity pour qu'ils soient dans "Non assignés"
      notProcessedClients.forEach(client => {
        unassignedClients.unknownCity.push(client);
      });
    }
    
    // Nettoyer la map pour libérer la mémoire
    clientInfoMap.clear();
    
    // Ajouter la section "Non assignés" au résultat
    // Séparer les clients "Ville inconnue" des clients "Non traité"
    const unknownCityClients = unassignedClients.unknownCity.filter(c => c.city === 'Inconnu');
    const notProcessedClientsList = unassignedClients.unknownCity.filter(c => c.city === 'Non traité');
    
    if (unassignedClients.noAddress.length > 0 || 
        unknownCityClients.length > 0 || 
        notProcessedClientsList.length > 0 ||
        unassignedClients.ambiguousAddress.length > 0) {
      if (!clientsBySector['Non assignés']) {
        clientsBySector['Non assignés'] = {};
      }
      
      if (unassignedClients.noAddress.length > 0) {
        clientsBySector['Non assignés']['Sans adresse'] = {
          clients: unassignedClients.noAddress
        };
      }
      
      if (unknownCityClients.length > 0) {
        clientsBySector['Non assignés']['Ville inconnue'] = {
          clients: unknownCityClients
        };
      }
      
      if (notProcessedClientsList.length > 0) {
        clientsBySector['Non assignés']['Non traité'] = {
          clients: notProcessedClientsList
        };
      }
      
      if (unassignedClients.ambiguousAddress.length > 0) {
        clientsBySector['Non assignés']['Adresse ambiguë'] = {
          clients: unassignedClients.ambiguousAddress
        };
      }
    }

    // Fonction helper pour compter les clients d'un secteur
    function getSectorClientCount(sector: string, sectorData: Record<string, any>): number {
      if (sector === 'Montréal' || sector === 'Laval') {
        const sectorKey = Object.keys(sectorData).find(key => 
          key.toLowerCase() === sector.toLowerCase()
        );
        if (sectorKey) {
          const data = sectorData[sectorKey];
          let count = 0;
          if (data.districts && Object.keys(data.districts).length > 0) {
            count += Object.values(data.districts).reduce((sum: number, clients: any) => sum + (Array.isArray(clients) ? clients.length : 0), 0);
          }
          count += Array.isArray(data.clients) ? data.clients.length : 0;
          return count;
        }
        return 0;
      }
      // Pour les autres secteurs, compter les clients dans toutes les villes
      return Object.values(sectorData).reduce((sum: number, cityData: any) => {
        if (cityData && typeof cityData === 'object') {
          if (cityData.districts && Object.keys(cityData.districts).length > 0) {
            return sum + Object.values(cityData.districts).reduce((dSum: number, clients: any) => {
              return dSum + (Array.isArray(clients) ? clients.length : 0);
            }, 0);
          }
          return sum + (Array.isArray(cityData.clients) ? cityData.clients.length : 0);
        }
        return sum;
      }, 0);
    }

    // Organiser les données par secteur avec tri
    const result: Record<string, Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> | {
      districts?: Record<string, ClientWithLocation[]>;
      clients: ClientWithLocation[];
    }> = {};
    
    // Trier les secteurs par nombre de clients (décroissant), mais garder "Non assignés" en dernier
    const sectors = Object.keys(clientsBySector);
    const sortedSectors = sectors.sort((sectorA, sectorB) => {
      // "Non assignés" toujours en dernier
      if (sectorA === 'Non assignés') return 1;
      if (sectorB === 'Non assignés') return -1;
      
      const countA = getSectorClientCount(sectorA, clientsBySector[sectorA]);
      const countB = getSectorClientCount(sectorB, clientsBySector[sectorB]);
      
      // Trier par nombre de clients (décroissant)
      return countB - countA;
    });
    
    // Traiter les secteurs dans l'ordre trié
    for (const sector of sortedSectors) {
      if (clientsBySector[sector]) {
        // Pour Montréal et Laval, mettre directement les districts au niveau du secteur (pas de niveau ville)
        if (sector === 'Montréal' || sector === 'Laval') {
          // Chercher la clé qui correspond au secteur (devrait être "Montréal" ou "Laval")
          const sectorKey = Object.keys(clientsBySector[sector]).find(key => 
            key.toLowerCase() === sector.toLowerCase()
          );
          
          if (sectorKey) {
            const sectorData = clientsBySector[sector][sectorKey];
            // Mettre directement les districts au niveau du secteur
            result[sector] = {
              districts: sectorData.districts || {},
              clients: sectorData.clients || []
            };
            
            // Trier les quartiers par nombre de clients décroissant
            const sectorResult = result[sector] as { districts?: Record<string, ClientWithLocation[]>; clients: ClientWithLocation[] };
            if (sectorResult.districts && Object.keys(sectorResult.districts).length > 0) {
              const sortedDistricts: Record<string, ClientWithLocation[]> = {};
              const districtKeys = Object.keys(sectorResult.districts).sort((a, b) => {
                const countA = sectorResult.districts![a].length;
                const countB = sectorResult.districts![b].length;
                if (countA !== countB) {
                  return countB - countA;
                }
                return a.localeCompare(b);
              });
              for (const districtKey of districtKeys) {
                sortedDistricts[districtKey] = sectorResult.districts![districtKey];
              }
              sectorResult.districts = sortedDistricts;
            }
          }
        } else {
          // Pour les autres secteurs, structure normale avec villes
          result[sector] = {};
          const cityKeys = Object.keys(clientsBySector[sector]);
          const sortedCities = cityKeys.sort((a, b) => {
            // Trier par nombre de clients décroissant, puis alphabétique
            const countA = getClientCountForCity(clientsBySector[sector][a]);
            const countB = getClientCountForCity(clientsBySector[sector][b]);
            if (countA !== countB) {
              return countB - countA;
            }
            return a.localeCompare(b);
          });
          
          for (const city of sortedCities) {
            result[sector][city] = clientsBySector[sector][city];
          }
        }
      }
    }
    
    // Fonction helper pour compter les clients d'une ville
    function getClientCountForCity(cityData: { clients: ClientWithLocation[]; districts?: Record<string, ClientWithLocation[]> }): number {
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        return Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      }
      return cityData.clients?.length || 0;
    }

    // Log final pour vérifier que tous les clients sont comptés (APRÈS avoir organisé les données dans result)
    let totalInSectors = 0;
    Object.values(result).forEach(sector => {
      if (typeof sector === 'object' && sector !== null) {
        // Pour Montréal et Laval, la structure est différente
        if ('districts' in sector && sector.districts) {
          const districts = sector.districts as Record<string, ClientWithLocation[]>;
          totalInSectors += Object.values(districts).reduce((sum: number, clients: ClientWithLocation[]) => sum + clients.length, 0);
        }
        if ('clients' in sector && Array.isArray(sector.clients)) {
          totalInSectors += sector.clients.length;
        }
        // Pour les autres secteurs, structure normale avec villes
        if (!('districts' in sector) && !('clients' in sector)) {
          Object.values(sector).forEach(cityData => {
            if (cityData && typeof cityData === 'object') {
              if ('districts' in cityData && cityData.districts) {
                const districts = cityData.districts as Record<string, ClientWithLocation[]>;
                totalInSectors += Object.values(districts).reduce((sum: number, clients: ClientWithLocation[]) => sum + clients.length, 0);
              }
              if ('clients' in cityData && Array.isArray(cityData.clients)) {
                totalInSectors += cityData.clients.length;
              }
            }
          });
        }
      }
    });

    // Compter le total de villes
    let totalCities = 0;
    Object.values(result).forEach(sector => {
      if (typeof sector === 'object' && sector !== null) {
        if ('districts' in sector || 'clients' in sector) {
          // Montréal/Laval compte comme 1 ville
          totalCities += 1;
        } else {
          // Autres secteurs: compter les villes
      totalCities += Object.keys(sector).length;
        }
      }
    });
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`✅ TRAITEMENT TERMINÉ`);
    console.log(`⏱️  Temps total: ${totalTime}s`);
    console.log(`📊 Clients traités: ${processedCount}/${clientsWithAddress.length} (sur ${allClients.length} total)`);
    console.log(`📊 VÉRIFICATION FINALE:`);
    console.log(`   Total clients dans la base: ${allClients.length}`);
    console.log(`   Total clients dans les secteurs: ${totalInSectors}`);
    console.log(`   Différence: ${allClients.length - totalInSectors} client(s)`);
    if (allClients.length !== totalInSectors) {
      console.log(`   ⚠️  ATTENTION: ${allClients.length - totalInSectors} client(s) non compté(s) dans les secteurs`);
      console.log(`   📋 Répartition Non assignés:`);
      console.log(`      - Sans adresse: ${unassignedClients.noAddress.length}`);
      console.log(`      - Ville inconnue: ${unknownCityClients.length}`);
      console.log(`      - Non traité: ${notProcessedClientsList.length}`);
      console.log(`      - Adresse ambiguë: ${unassignedClients.ambiguousAddress.length}`);
      const totalUnassigned = unassignedClients.noAddress.length + unknownCityClients.length + notProcessedClientsList.length + unassignedClients.ambiguousAddress.length;
      console.log(`      - Total Non assignés: ${totalUnassigned}`);
      console.log(`   📊 Vérification: ${totalInSectors} (secteurs) + ${totalUnassigned} (non assignés) = ${totalInSectors + totalUnassigned} (devrait être ${allClients.length})`);
    }
    console.log(`🏙️  Secteurs trouvés: ${Object.keys(result).length}`);
    console.log(`🏙️  Villes trouvées: ${totalCities}`);
    console.log(`========================================\n`);

    // Sauvegarder dans le cache MongoDB avant d'envoyer la réponse finale
    try {
      await ClientByCityCache.findOneAndUpdate(
        { cacheType: 'by-city' },
        {
          cacheType: 'by-city',
          data: result,
          totalClients: allClients.length,
          lastUpdate: new Date()
        },
        { upsert: true, new: true }
      );
      console.log('✅ Cache MongoDB by-city mis à jour après streaming');
    } catch (cacheError) {
      console.error('❌ Erreur lors de la sauvegarde du cache MongoDB:', cacheError);
      // Ne pas bloquer si la sauvegarde du cache échoue
    }

    sendProgress({
      type: 'complete',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: result as any, // Structure par secteur (type union pour Montréal/Laval vs autres)
      totalClients: allClients.length, // Envoyer le total de TOUS les clients, pas seulement ceux traités
      totalTime: `${totalTime}s`
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

// Fonction pour traiter un seul client et retourner ses données formatées
async function processSingleClient(client: any): Promise<{
  clientWithLocation: ClientWithLocation;
  sector: string;
  city: string;
  district?: string;
}> {
  if (!client.addressLine1 || client.addressLine1.trim() === '') {
    throw new Error('Client sans adresse');
  }

  const { city, district } = await extractCityAndDistrict(client.addressLine1);
  const sector = getSector(city);

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

  return { clientWithLocation, sector, city, district };
}

// Fonction pour ajouter un client au cache "by-city" de manière incrémentale
export async function addClientToByCityCache(clientId: string): Promise<void> {
  try {
    const client = await Client.findById(clientId).lean();
    if (!client || !client.addressLine1 || client.addressLine1.trim() === '') {
      console.log(`⚠️ Client ${clientId} sans adresse, ignoré pour le cache by-city`);
      return;
    }

    // Récupérer le cache existant
    const cached = await ClientByCityCache.findOne({ cacheType: 'by-city' });
    if (!cached || !cached.data) {
      console.log('⚠️ Pas de cache by-city existant, création complète nécessaire');
      return;
    }

    // Utiliser directement city, district, sector depuis MongoDB (si disponibles)
    // Sinon, fallback vers processSingleClient pour les anciens clients
    let city: string;
    let district: string | undefined;
    let sector: string;
    
    if (client.city && client.sector) {
      // Utiliser les champs directement depuis MongoDB
      city = client.city;
      district = client.district || undefined;
      sector = client.sector;
      console.log(`✅ Utilisation des champs MongoDB: ${city}${district ? ` (${district})` : ''} [${sector}]`);
    } else {
      // Fallback pour les anciens clients qui n'ont pas encore city/district/sector
      const processed = await processSingleClient(client);
      city = processed.city;
      district = processed.district;
      sector = processed.sector;
      console.log(`⚠️ Client sans city/sector dans MongoDB, extraction depuis adresse`);
    }
    
    // Créer le client formaté pour le cache
    const clientWithLocation = {
      _id: client._id.toString(),
      givenName: client.givenName || '',
      familyName: client.familyName || '',
      phoneNumber: client.phoneNumber || undefined,
      addressLine1: client.addressLine1 || '',
      coordinates: client.coordinates ? {
        lng: (client.coordinates as any).lng,
        lat: (client.coordinates as any).lat
      } : undefined,
      city: city,
      district: district,
      sector: sector
    };
    
    // Mettre à jour le cache
    const cacheData = cached.data as any;
    
    // Initialiser le secteur s'il n'existe pas
    if (!cacheData[sector]) {
      cacheData[sector] = {};
    }

    // Pour Montréal et Laval
    if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
        (sector === 'Laval' && city.toLowerCase() === 'laval')) {
      const sectorKey = sector;
      
      if (!cacheData[sector][sectorKey]) {
        cacheData[sector][sectorKey] = {
          clients: [],
          districts: {}
        };
      }
      
      if (district) {
        if (!cacheData[sector][sectorKey].districts) {
          cacheData[sector][sectorKey].districts = {};
        }
        if (!cacheData[sector][sectorKey].districts[district]) {
          cacheData[sector][sectorKey].districts[district] = [];
        }
        cacheData[sector][sectorKey].districts[district].push(clientWithLocation);
      } else {
        cacheData[sector][sectorKey].clients.push(clientWithLocation);
      }
    } else {
      // Pour les autres villes
      if (!cacheData[sector][city]) {
        cacheData[sector][city] = { clients: [] };
      }
      cacheData[sector][city].clients.push(clientWithLocation);
    }

    // Sauvegarder le cache mis à jour
    await ClientByCityCache.findOneAndUpdate(
      { cacheType: 'by-city' },
      {
        data: cacheData,
        totalClients: cached.totalClients + 1,
        lastUpdate: new Date()
      }
    );

    console.log(`✅ Client ${clientId} ajouté au cache by-city (${sector} - ${city}${district ? ` - ${district}` : ''})`);
  } catch (error) {
    console.error(`❌ Erreur lors de l'ajout du client ${clientId} au cache by-city:`, error);
    // En cas d'erreur, invalider le cache pour forcer un recalcul
    await ClientByCityCache.deleteMany({ cacheType: 'by-city' });
  }
}

// Fonction pour retirer un client du cache "by-city"
export async function removeClientFromByCityCache(clientId: string): Promise<void> {
  try {
    const cached = await ClientByCityCache.findOne({ cacheType: 'by-city' });
    if (!cached || !cached.data) {
      console.log(`⚠️ Pas de cache by-city trouvé pour retirer le client ${clientId}`);
      return;
    }

    const cacheData = cached.data as any;
    let found = false;

    console.log(`🔍 Recherche du client ${clientId} dans le cache by-city...`);

    // Parcourir tous les secteurs (Montréal, Laval, Rive Nord, etc.)
    for (const sector of Object.keys(cacheData)) {
      const sectorData = cacheData[sector];
      
      if (!sectorData || typeof sectorData !== 'object') {
        console.log(`  ⚠️ Secteur ${sector} n'est pas un objet valide`);
        continue;
      }
      
      // Pour Montréal et Laval : structure { districts: {...}, clients: [...] }
      if (sector === 'Montréal' || sector === 'Laval') {
        console.log(`  🔍 Recherche dans ${sector}...`);
        
        // Chercher dans les districts
        if (sectorData.districts && typeof sectorData.districts === 'object') {
          const districtKeys = Object.keys(sectorData.districts);
          console.log(`    📍 Districts disponibles: ${districtKeys.join(', ')}`);
          
          for (const district of districtKeys) {
            if (Array.isArray(sectorData.districts[district])) {
              const clientsInDistrict = sectorData.districts[district];
              console.log(`    🔍 Vérification du district ${district} (${clientsInDistrict.length} clients)`);
              
              // Vérifier tous les IDs pour le débogage
              const clientIds = clientsInDistrict.map((c: any) => c?._id).filter(Boolean);
              if (clientIds.includes(clientId)) {
                const index = clientsInDistrict.findIndex((c: any) => c && String(c._id) === String(clientId));
                if (index >= 0) {
                  sectorData.districts[district].splice(index, 1);
                  found = true;
                  console.log(`    ✅ Client ${clientId} retiré du district ${district} (${sector})`);
                  break;
                }
              }
            }
          }
        }
        
        // Chercher dans les clients sans district
        if (!found && sectorData.clients && Array.isArray(sectorData.clients)) {
          console.log(`    🔍 Vérification des clients sans district (${sectorData.clients.length} clients)`);
          const clientIds = sectorData.clients.map((c: any) => c?._id).filter(Boolean);
          if (clientIds.includes(clientId)) {
            const index = sectorData.clients.findIndex((c: any) => c && String(c._id) === String(clientId));
            if (index >= 0) {
              sectorData.clients.splice(index, 1);
              found = true;
              console.log(`    ✅ Client ${clientId} retiré des clients sans district (${sector})`);
            }
          }
        }
      } else {
        // Pour les autres secteurs : structure { "Ville": { clients: [...], districts: {...} } }
        console.log(`  🔍 Recherche dans ${sector} (autres secteurs)...`);
        for (const city of Object.keys(sectorData)) {
          const cityData = sectorData[city];
          if (!cityData || typeof cityData !== 'object') continue;
          
          // Chercher dans les districts de la ville
          if (cityData.districts && typeof cityData.districts === 'object') {
            for (const district of Object.keys(cityData.districts)) {
              if (Array.isArray(cityData.districts[district])) {
                const index = cityData.districts[district].findIndex((c: any) => c && String(c._id) === String(clientId));
                if (index >= 0) {
                  cityData.districts[district].splice(index, 1);
                  found = true;
                  console.log(`    ✅ Client ${clientId} retiré du district ${district} de ${city} (${sector})`);
                  break;
                }
              }
            }
          }
          
          // Chercher dans les clients de la ville
          if (!found && cityData.clients && Array.isArray(cityData.clients)) {
            const index = cityData.clients.findIndex((c: any) => c && String(c._id) === String(clientId));
            if (index >= 0) {
              cityData.clients.splice(index, 1);
              found = true;
              console.log(`    ✅ Client ${clientId} retiré de ${city} (${sector})`);
              break;
            }
          }
          
          if (found) break;
        }
      }
      
      if (found) break;
    }

    if (found) {
      await ClientByCityCache.findOneAndUpdate(
        { cacheType: 'by-city' },
        {
          data: cacheData,
          totalClients: Math.max(0, cached.totalClients - 1),
          lastUpdate: new Date()
        }
      );
      console.log(`✅ Client ${clientId} retiré du cache by-city et cache mis à jour`);
    } else {
      console.log(`⚠️ Client ${clientId} non trouvé dans le cache by-city`);
      console.log(`   Structure du cache: ${JSON.stringify(Object.keys(cacheData))}`);
    }
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression du client ${clientId} du cache by-city:`, error);
  }
}

// Fonction pour mettre à jour un client dans le cache "by-city"
export async function updateClientInByCityCache(clientId: string): Promise<void> {
  try {
    // Retirer l'ancien client
    await removeClientFromByCityCache(clientId);
    // Ajouter le client mis à jour
    await addClientToByCityCache(clientId);
    console.log(`✅ Client ${clientId} mis à jour dans le cache by-city`);
  } catch (error) {
    console.error(`❌ Erreur lors de la mise à jour du client ${clientId} dans le cache by-city:`, error);
    // En cas d'erreur, invalider le cache
    await ClientByCityCache.deleteMany({ cacheType: 'by-city' });
  }
}

// Fonction utilitaire pour mettre à jour le cache "by-city"
async function updateByCityCache(): Promise<{ data: any; totalClients: number }> {
  // Récupérer TOUS les clients
  const allClients = await Client.find({});
  const clients = allClients.filter(c => c.addressLine1 && c.addressLine1.trim() !== '');

  try {
    console.log(`\n========================================`);
    console.log(`🚀 DÉBUT DU TRAITEMENT (mode classique)`);
    console.log(`📊 Total de clients: ${allClients.length}`);
    console.log(`📊 Clients avec adresse: ${clients.length}`);
    console.log(`========================================\n`);

    // Organiser les clients par secteur, puis par ville et quartier
    const clientsBySector: Record<string, Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }>> = {};

    let processedCount = 0;
    const startTime = Date.now();

    // Traiter les clients avec un délai pour éviter de surcharger l'API
    for (let i = 0; i < clients.length; i++) {
      // Note: clients est le filtre de allClients, donc on utilise clients.length ici
      const client = clients[i];
      
      if (!client.addressLine1) {
        processedCount++;
        continue;
      }

      try {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
        const progress = Math.round(((i + 1) / clients.length) * 100); // clients.length est correct ici
        
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

        // Déterminer le secteur de la ville
        const sector = getSector(city);
        
        // Initialiser le secteur s'il n'existe pas
        if (!clientsBySector[sector]) {
          clientsBySector[sector] = {};
        }
        
        // Pour Montréal et Laval, mettre directement les quartiers au niveau du secteur (pas de sous-niveau ville)
        if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
            (sector === 'Laval' && city.toLowerCase() === 'laval')) {
          // Utiliser le nom du secteur comme clé (pas la ville)
          const sectorKey = sector;
          
          if (!clientsBySector[sector][sectorKey]) {
            clientsBySector[sector][sectorKey] = {
              clients: [],
              districts: {}
            };
          }
          
          // Organiser par quartier
          if (district) {
            if (!clientsBySector[sector][sectorKey].districts) {
              clientsBySector[sector][sectorKey].districts = {};
            }
            
            if (!clientsBySector[sector][sectorKey].districts![district]) {
              clientsBySector[sector][sectorKey].districts![district] = [];
            }
            
            clientsBySector[sector][sectorKey].districts![district].push(clientWithLocation);
          } else {
            // Si pas de quartier, ajouter directement aux clients
            clientsBySector[sector][sectorKey].clients.push(clientWithLocation);
          }
        } else {
          // Pour les autres villes (pas Montréal/Laval dans leur secteur), créer une entrée ville normale
          if (!clientsBySector[sector][city]) {
            clientsBySector[sector][city] = {
              clients: []
              // Pas de districts pour les autres villes
            };
          }
          
          // Ajouter directement à la liste des clients de la ville
          clientsBySector[sector][city].clients.push(clientWithLocation);
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
        const sector = 'Autres';
        
        if (!clientsBySector[sector]) {
          clientsBySector[sector] = {};
        }
        
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        
        clientsBySector[sector][city].clients.push({
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

    // Fonction helper pour compter les clients d'une ville
    function getClientCountForCity(cityData: { clients: ClientWithLocation[]; districts?: Record<string, ClientWithLocation[]> }): number {
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        return Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      }
      return cityData.clients?.length || 0;
    }

    // Fonction helper pour compter les clients d'un secteur
    function getSectorClientCountForStream(sector: string, sectorData: Record<string, any>): number {
      if (sector === 'Montréal' || sector === 'Laval') {
        const sectorKey = Object.keys(sectorData).find(key => 
          key.toLowerCase() === sector.toLowerCase()
        );
        if (sectorKey) {
          const data = sectorData[sectorKey];
          let count = 0;
          if (data.districts && Object.keys(data.districts).length > 0) {
            count += Object.values(data.districts).reduce((sum: number, clients: any) => sum + (Array.isArray(clients) ? clients.length : 0), 0);
          }
          count += Array.isArray(data.clients) ? data.clients.length : 0;
          return count;
        }
        return 0;
      }
      // Pour les autres secteurs, compter les clients dans toutes les villes
      return Object.values(sectorData).reduce((sum: number, cityData: any) => {
        if (cityData && typeof cityData === 'object') {
          if (cityData.districts && Object.keys(cityData.districts).length > 0) {
            return sum + Object.values(cityData.districts).reduce((dSum: number, clients: any) => {
              return dSum + (Array.isArray(clients) ? clients.length : 0);
            }, 0);
          }
          return sum + (Array.isArray(cityData.clients) ? cityData.clients.length : 0);
        }
        return sum;
      }, 0);
    }

    // Organiser les données par secteur avec tri
    const result: Record<string, Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }> | {
      districts?: Record<string, ClientWithLocation[]>;
      clients: ClientWithLocation[];
    }> = {};
    
    // Trier les secteurs par nombre de clients (décroissant), mais garder "Non assignés" en dernier
    const sectors = Object.keys(clientsBySector);
    const sortedSectors = sectors.sort((sectorA, sectorB) => {
      // "Non assignés" toujours en dernier
      if (sectorA === 'Non assignés') return 1;
      if (sectorB === 'Non assignés') return -1;
      
      const countA = getSectorClientCountForStream(sectorA, clientsBySector[sectorA]);
      const countB = getSectorClientCountForStream(sectorB, clientsBySector[sectorB]);
      
      // Trier par nombre de clients (décroissant)
      return countB - countA;
    });
    
    // Traiter les secteurs dans l'ordre trié
    for (const sector of sortedSectors) {
      if (clientsBySector[sector]) {
        // Pour Montréal et Laval, mettre directement les districts au niveau du secteur (pas de niveau ville)
        if (sector === 'Montréal' || sector === 'Laval') {
          // Chercher la clé qui correspond au secteur (devrait être "Montréal" ou "Laval")
          const sectorKey = Object.keys(clientsBySector[sector]).find(key => 
            key.toLowerCase() === sector.toLowerCase()
          );
          
          if (sectorKey) {
            const sectorData = clientsBySector[sector][sectorKey];
            // Mettre directement les districts au niveau du secteur
            result[sector] = {
              districts: sectorData.districts || {},
              clients: sectorData.clients || []
            };
            
            // Trier les quartiers par nombre de clients décroissant
            const sectorResult = result[sector] as { districts?: Record<string, ClientWithLocation[]>; clients: ClientWithLocation[] };
            if (sectorResult.districts && Object.keys(sectorResult.districts).length > 0) {
              const sortedDistricts: Record<string, ClientWithLocation[]> = {};
              const districtKeys = Object.keys(sectorResult.districts).sort((a, b) => {
                const countA = sectorResult.districts![a].length;
                const countB = sectorResult.districts![b].length;
                if (countA !== countB) {
                  return countB - countA;
                }
                return a.localeCompare(b);
              });
              for (const districtKey of districtKeys) {
                sortedDistricts[districtKey] = sectorResult.districts![districtKey];
              }
              sectorResult.districts = sortedDistricts;
            }
          }
        } else {
          // Pour les autres secteurs, structure normale avec villes
          result[sector] = {};
          const cityKeys = Object.keys(clientsBySector[sector]);
          const sortedCities = cityKeys.sort((a, b) => {
            // Trier par nombre de clients décroissant, puis alphabétique
            const countA = getClientCountForCity(clientsBySector[sector][a]);
            const countB = getClientCountForCity(clientsBySector[sector][b]);
            if (countA !== countB) {
              return countB - countA;
            }
            return a.localeCompare(b);
          });
          
          for (const city of sortedCities) {
            result[sector][city] = clientsBySector[sector][city];
          }
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`✅ TRAITEMENT TERMINÉ`);
    console.log(`⏱️  Temps total: ${totalTime}s`);
    // Pour la route classique, on compte tous les clients (avec et sans adresse)
    const totalAllClients = allClients.length;
    console.log(`📊 Clients traités: ${processedCount}/${clients.length} (sur ${totalAllClients} total)`);
    // Compter le total de villes
    let totalCities = 0;
    Object.values(result).forEach(sector => {
      totalCities += Object.keys(sector).length;
    });
    console.log(`🏙️  Secteurs trouvés: ${Object.keys(result).length}`);
    console.log(`🏙️  Villes trouvées: ${totalCities}`);
    console.log(`========================================\n`);

    return { data: result, totalClients: totalAllClients };
  } catch (error) {
    console.error('❌ Erreur lors du calcul des clients par ville:', error);
    throw error;
  }
}

// Route optimisée - Utilise directement MongoDB avec aggregate() (sans cache)
router.get('/by-city', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Calcul direct depuis MongoDB (optimisé avec aggregate)...');
    const startTime = Date.now();

    // Récupérer TOUS les clients (pas seulement ceux avec ville/secteur)
    const allClients = await Client.find({}).lean();

    // Séparer les clients selon leurs caractéristiques
    const clientsWithAddressAndCitySector = allClients.filter(c => 
      c.addressLine1 && c.addressLine1.trim() !== '' &&
      c.city && c.city.trim() !== '' &&
      c.sector && c.sector.trim() !== ''
    );

    const clientsWithoutAddress = allClients.filter(c => 
      !c.addressLine1 || c.addressLine1.trim() === ''
    );

    // Clients avec adresse mais sans ville/secteur (non localisés)
    const clientsWithAddressButNoCitySector = allClients.filter(c => 
      c.addressLine1 && c.addressLine1.trim() !== '' &&
      (!c.city || c.city.trim() === '' || !c.sector || c.sector.trim() === '')
    );

    console.log(`📊 Clients avec adresse + ville/secteur: ${clientsWithAddressAndCitySector.length}`);
    console.log(`📊 Clients sans adresse: ${clientsWithoutAddress.length}`);
    console.log(`📊 Clients non localisés (avec adresse mais sans ville/secteur): ${clientsWithAddressButNoCitySector.length}`);

    // Construire la structure hiérarchique directement en mémoire (très rapide)
    const clientsBySector: Record<string, Record<string, {
      clients: ClientWithLocation[];
      districts?: Record<string, ClientWithLocation[]>;
    }>> = {};

    // Traiter les clients avec adresse ET ville/secteur
    for (const client of clientsWithAddressAndCitySector) {
      const sector = client.sector || 'Non assignés';
      const city = client.city || 'Inconnu';
      const district = client.district || undefined;

      const clientWithLocation: ClientWithLocation = {
        _id: client._id.toString(),
        givenName: client.givenName || '',
        familyName: client.familyName || '',
        phoneNumber: client.phoneNumber ?? undefined,
        addressLine1: client.addressLine1 || '',
        coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
          ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
          : undefined,
        city: city,
        district: district
      };

      // Initialiser le secteur
      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }

      // Pour Montréal et Laval
      if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
          (sector === 'Laval' && city.toLowerCase() === 'laval')) {
        const sectorKey = sector;
        
        if (!clientsBySector[sector][sectorKey]) {
          clientsBySector[sector][sectorKey] = {
            clients: [],
            districts: {}
          };
        }
        
        if (district) {
          if (!clientsBySector[sector][sectorKey].districts) {
            clientsBySector[sector][sectorKey].districts = {};
          }
          if (!clientsBySector[sector][sectorKey].districts![district]) {
            clientsBySector[sector][sectorKey].districts![district] = [];
          }
          clientsBySector[sector][sectorKey].districts![district].push(clientWithLocation);
        } else {
          clientsBySector[sector][sectorKey].clients.push(clientWithLocation);
        }
      } else {
        // Pour les autres villes
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [] };
        }
        clientsBySector[sector][city].clients.push(clientWithLocation);
      }
    }

    // Traiter les clients sans adresse
    if (clientsWithoutAddress.length > 0) {
      // Séparer les clients sans adresse qui ont une ville/secteur de ceux qui n'en ont pas
      const clientsWithoutAddressButWithCitySector = clientsWithoutAddress.filter(c => 
        c.city && c.city.trim() !== '' && c.sector && c.sector.trim() !== ''
      );
      // Clients sans adresse ET sans ville/secteur (à mettre dans "Sans adresse")
      const clientsWithoutAddressAndNoCitySector = clientsWithoutAddress.filter(c => 
        !c.city || c.city.trim() === '' || !c.sector || c.sector.trim() === ''
      );

      // Traiter les clients sans adresse MAIS avec ville/secteur (les classer dans leur secteur/ville)
      for (const client of clientsWithoutAddressButWithCitySector) {
        const sector = client.sector || 'Non assignés';
        const city = client.city || 'Inconnu';
        const district = client.district || undefined;

        const clientWithLocation: ClientWithLocation = {
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: '',
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: city,
          district: district
        };

        // Initialiser le secteur
        if (!clientsBySector[sector]) {
          clientsBySector[sector] = {};
        }

        // Pour Montréal et Laval
        if ((sector === 'Montréal' && city.toLowerCase() === 'montréal') || 
            (sector === 'Laval' && city.toLowerCase() === 'laval')) {
          const sectorKey = sector;
          
          if (!clientsBySector[sector][sectorKey]) {
            clientsBySector[sector][sectorKey] = {
              clients: [],
              districts: {}
            };
          }
          
          if (district) {
            if (!clientsBySector[sector][sectorKey].districts) {
              clientsBySector[sector][sectorKey].districts = {};
            }
            if (!clientsBySector[sector][sectorKey].districts![district]) {
              clientsBySector[sector][sectorKey].districts![district] = [];
            }
            clientsBySector[sector][sectorKey].districts![district].push(clientWithLocation);
          } else {
            clientsBySector[sector][sectorKey].clients.push(clientWithLocation);
          }
        } else {
          // Pour les autres villes
          if (!clientsBySector[sector][city]) {
            clientsBySector[sector][city] = { clients: [] };
          }
          clientsBySector[sector][city].clients.push(clientWithLocation);
        }
      }

      // Traiter les clients sans adresse ET sans ville/secteur (les mettre dans "Sans adresse")
      if (clientsWithoutAddressAndNoCitySector.length > 0) {
        // Initialiser "Non assignés" si nécessaire
        if (!clientsBySector['Non assignés']) {
          clientsBySector['Non assignés'] = {};
        }
        
        // Initialiser "Sans adresse" si nécessaire
        if (!clientsBySector['Non assignés']['Sans adresse']) {
          clientsBySector['Non assignés']['Sans adresse'] = { clients: [] };
        }

        for (const client of clientsWithoutAddressAndNoCitySector) {
          const clientWithLocation: ClientWithLocation = {
            _id: client._id.toString(),
            givenName: client.givenName || '',
            familyName: client.familyName || '',
            phoneNumber: client.phoneNumber ?? undefined,
            addressLine1: '',
            coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
              ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
              : undefined,
            city: 'Sans adresse',
            district: undefined
          };

          clientsBySector['Non assignés']['Sans adresse'].clients.push(clientWithLocation);
        }
      }
    }

    // Traiter les clients non localisés (avec adresse mais sans ville/secteur)
    if (clientsWithAddressButNoCitySector.length > 0) {
      // Initialiser "Non assignés" si nécessaire
      if (!clientsBySector['Non assignés']) {
        clientsBySector['Non assignés'] = {};
      }
      
      // Initialiser "Non localisé" si nécessaire
      if (!clientsBySector['Non assignés']['Non localisé']) {
        clientsBySector['Non assignés']['Non localisé'] = { clients: [] };
      }

      for (const client of clientsWithAddressButNoCitySector) {
        const clientWithLocation: ClientWithLocation = {
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: client.addressLine1 || '',
          coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
            ? { lng: client.coordinates.lng, lat: client.coordinates.lat }
            : undefined,
          city: 'Non localisé',
          district: undefined
        };

        clientsBySector['Non assignés']['Non localisé'].clients.push(clientWithLocation);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const totalClients = allClients.length;
    console.log(`✅ Calcul terminé en ${totalTime}s (${totalClients} clients)`);
    
    res.json({
      success: true,
      data: clientsBySector,
      totalClients: totalClients
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients par ville:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour forcer la mise à jour du cache "by-city"
router.post('/by-city/update-cache', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Mise à jour forcée du cache by-city...');
    const result = await updateByCityCache();
    
    // Sauvegarder dans le cache
    await ClientByCityCache.findOneAndUpdate(
      { cacheType: 'by-city' },
      {
        cacheType: 'by-city',
        data: result.data,
        totalClients: result.totalClients,
        lastUpdate: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Cache by-city mis à jour avec succès');
    
    res.json({
      success: true,
      message: 'Cache mis à jour avec succès',
      totalClients: result.totalClients
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du cache:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour corriger manuellement une adresse ambiguë
router.post('/fix-ambiguous-address', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId, correctedAddress } = req.body;

    if (!clientId) {
      res.status(400).json({
        success: false,
        error: 'ID client requis'
      });
      return;
    }

    const client = await Client.findById(clientId);
    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client non trouvé'
      });
      return;
    }

    // Si une adresse corrigée est fournie, la mettre à jour
    if (correctedAddress) {
      client.addressLine1 = correctedAddress;
      
      // Re-géocoder l'adresse pour obtenir les nouvelles coordonnées
      try {
        await extractCityAndDistrict(correctedAddress);
        // Optionnel: mettre à jour les coordonnées si nécessaire
        // Les coordonnées seront mises à jour lors du prochain traitement
      } catch (error) {
        console.error('Erreur lors du re-géocodage:', error);
      }
    }

    // Si un secteur/ville/quartier est fourni directement, on peut l'enregistrer dans un champ personnalisé
    // Pour l'instant, on sauvegarde juste l'adresse corrigée
    await client.save();

    // Géocoder automatiquement le client après correction de l'adresse
    const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
    geocodeAndExtractLocation(client._id.toString())
      .then((result) => {
        // Plus besoin de mettre à jour le cache - city/district/sector sont déjà dans MongoDB
        console.log(`✅ Client géocodé et localisé: ${result.city}${result.district ? ` (${result.district})` : ''} [${result.sector}]`);
      })
      .catch(err => {
        console.error('Erreur lors du géocodage automatique après correction:', err);
      });

    res.json({
      success: true,
      message: 'Adresse corrigée avec succès',
      client: {
        _id: client._id,
        givenName: client.givenName,
        familyName: client.familyName,
        addressLine1: client.addressLine1
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la correction de l\'adresse:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour récupérer seulement les changements depuis une date donnée
router.get('/by-city-changes', async (req: Request, res: Response): Promise<void> => {
  try {
    const since = req.query.since as string; // Timestamp ISO de la dernière mise à jour
    
    if (!since) {
      res.status(400).json({
        success: false,
        error: 'Paramètre "since" requis (timestamp ISO)'
      });
      return;
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Format de date invalide. Utilisez un timestamp ISO.'
      });
      return;
    }

    // Ajouter une petite marge (1 seconde) pour éviter les problèmes de précision des timestamps
    const sinceDateWithMargin = new Date(sinceDate.getTime() - 1000);

    console.log(`📋 Récupération des changements depuis: ${sinceDate.toISOString()} (avec marge: ${sinceDateWithMargin.toISOString()})`);

    // Récupérer seulement les clients modifiés ou créés depuis cette date (avec marge)
    const changedClients = await Client.find({
      $or: [
        { createdAt: { $gte: sinceDateWithMargin } },
        { updatedAt: { $gte: sinceDateWithMargin } }
      ]
    });
    
    console.log(`🔍 Clients trouvés avec createdAt >= ${sinceDateWithMargin.toISOString()}: ${changedClients.filter(c => c.createdAt && new Date(c.createdAt) >= sinceDateWithMargin).length}`);
    console.log(`🔍 Clients trouvés avec updatedAt >= ${sinceDateWithMargin.toISOString()}: ${changedClients.filter(c => c.updatedAt && new Date(c.updatedAt) >= sinceDateWithMargin).length}`);

    // Récupérer aussi les clients supprimés (on ne peut pas vraiment le tracker sans un système de soft delete)
    // Pour l'instant, on retourne seulement les clients modifiés/créés

    if (changedClients.length === 0) {
      res.json({
        success: true,
        hasChanges: false,
        message: 'Aucun changement depuis cette date',
        data: {},
        totalClients: 0,
        lastUpdate: new Date().toISOString()
      });
      return;
    }

    console.log(`📊 ${changedClients.length} client(s) modifié(s) depuis ${sinceDate.toISOString()}`);

    if (changedClients.length === 0) {
      res.json({
        success: true,
        hasChanges: false,
        message: 'Aucun changement depuis cette date',
        changedClients: [],
        clientsForMap: [],
        clientsForByCity: [],
        lastUpdate: new Date().toISOString()
      });
      return;
    }

    // Traiter seulement les clients modifiés pour retourner leurs données formatées pour la carte
    const clientsForMap: Array<{
      _id: string;
      name: string;
      phoneNumber?: string;
      address: string;
      coordinates: { lng: number; lat: number } | null;
      sector?: string;
      city?: string;
      district?: string;
    }> = [];

    for (const client of changedClients) {
      // Vérifier si le client a des coordonnées
      const hasCoordinates = client.coordinates && 
        typeof client.coordinates === 'object' &&
        client.coordinates !== null &&
        'lng' in client.coordinates &&
        'lat' in client.coordinates &&
        client.coordinates.lng != null &&
        client.coordinates.lat != null;

      if (hasCoordinates) {
        // Utiliser directement les champs city, district, sector depuis MongoDB
        // (plus besoin de recalculer avec extractCityAndDistrict qui génère des logs de debug)
        const city = client.city || 'Inconnu';
        const district = client.district || undefined;
        const sector = client.sector || 'Non assignés';

        const coords = client.coordinates as { lng: number; lat: number } | null;
        if (coords && coords.lng != null && coords.lat != null) {
          clientsForMap.push({
            _id: client._id.toString(),
            name: `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom',
            phoneNumber: client.phoneNumber || undefined,
            address: client.addressLine1 || '',
            coordinates: {
              lng: coords.lng,
              lat: coords.lat
            },
            sector,
            city,
            district: district || undefined
          });
        }
      }
    }

    console.log(`✅ ${clientsForMap.length} client(s) avec coordonnées formaté(s) pour la carte`);

    // Formater aussi les clients pour ClientsByCity (tous les clients avec adresse, pas seulement ceux avec coordonnées)
    const clientsForByCity: Array<{
      _id: string;
      givenName: string;
      familyName: string;
      phoneNumber?: string;
      addressLine1: string;
      coordinates?: { lng: number; lat: number };
      city: string;
      district?: string;
      sector: string;
    }> = [];

    for (const client of changedClients) {
      if (client.addressLine1 && client.addressLine1.trim() !== '') {
        // Utiliser directement les champs city, district, sector depuis MongoDB
        // (plus besoin de recalculer avec extractCityAndDistrict qui génère des logs de debug)
        const city = client.city || 'Inconnu';
        const district = client.district || undefined;
        const sector = client.sector || 'Non assignés';

        const coords = client.coordinates as { lng: number; lat: number } | null;
        clientsForByCity.push({
          _id: client._id.toString(),
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber || undefined,
          addressLine1: client.addressLine1 || '',
          coordinates: (coords && coords.lng != null && coords.lat != null) ? coords : undefined,
          city,
          district: district || undefined,
          sector
        });
      }
    }

    console.log(`✅ ${clientsForByCity.length} client(s) formaté(s) pour ClientsByCity`);

    // Mettre à jour les caches MongoDB pour chaque client modifié
    // Plus besoin de mettre à jour le cache - city/district/sector sont déjà dans MongoDB
    // Les routes lisent directement depuis MongoDB maintenant

    // Toujours retourner clientsForByCity, même s'il est vide (pour éviter les rechargements complets inutiles)
    res.json({
      success: true,
      hasChanges: true,
      changedClientsCount: changedClients.length,
      clientsForMap: clientsForMap,
      clientsForByCity: clientsForByCity, // Peut être vide si aucun client n'a d'adresse
      message: `${changedClients.length} client(s) modifié(s), ${clientsForMap.length} avec coordonnées, ${clientsForByCity.length} avec adresse.`,
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des changements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour mettre à jour un seul client après modification d'adresse
router.post('/update-single-client', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId, newAddress } = req.body;

    if (!clientId || !newAddress) {
      res.status(400).json({
        success: false,
        error: 'Client ID et nouvelle adresse sont requis.'
      });
      return;
    }

    const client = await Client.findById(clientId);
    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client non trouvé.'
      });
      return;
    }

    // Mettre à jour l'adresse
    client.addressLine1 = newAddress;
    // Réinitialiser les coordonnées pour qu'elles soient recalculées
    client.coordinates = undefined;
    await client.save();

    // Géocoder automatiquement le client après mise à jour de l'adresse (ATTENDRE que ce soit terminé)
    const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
    try {
      await geocodeAndExtractLocation(client._id.toString());
      
      // Attendre un peu pour s'assurer que la base de données est à jour
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Recharger le client depuis la base pour avoir les nouvelles coordonnées
      const updatedClient = await Client.findById(clientId);
      if (updatedClient) {
        // Mettre à jour la référence du client avec les nouvelles données
        client.set(updatedClient.toObject());
        await client.save();
      }
    } catch (err) {
      console.error('❌ Erreur lors du géocodage automatique après mise à jour:', err);
    }

    // Traiter ce client pour obtenir sa nouvelle localisation
    const addressResult = await extractCityAndDistrict(newAddress);
    const city = addressResult.city;
    let district = addressResult.district;
    
    // Si le client a des coordonnées GPS, les utiliser pour valider/améliorer la détection
    const clientCoords = client.coordinates as { lng?: number; lat?: number } | undefined;
    if (clientCoords && clientCoords.lng != null && clientCoords.lat != null) {
      const coordsResult = await extractCityFromCoordinates(clientCoords.lng, clientCoords.lat);
      if (coordsResult && coordsResult.district && !district) {
        district = coordsResult.district;
      }
    }

    // Essayer d'obtenir le district depuis le code postal si pas encore trouvé
    if (city.toLowerCase() === 'laval' && !district) {
      const postalCodeMatch = newAddress.match(/\b([A-Z]\d[A-Z])\s*\d[A-Z]\d\b/i);
      if (postalCodeMatch) {
        const postalCode = postalCodeMatch[1].toUpperCase();
        const districtFromPostal = getDistrictFromPostalCode(postalCode);
        if (districtFromPostal) {
          district = districtFromPostal;
        }
      }
    }

    const sector = getSector(city);

    // Extraire les coordonnées de manière sécurisée
    let coordinates: { lng: number; lat: number } | undefined = undefined;
    if (client.coordinates) {
      const coords = client.coordinates as { lng?: number; lat?: number };
      if (coords.lng != null && coords.lat != null) {
        coordinates = { lng: coords.lng, lat: coords.lat };
      }
    }

    const clientWithLocation: ClientWithLocation = {
      _id: client._id.toString(),
      givenName: client.givenName || '',
      familyName: client.familyName || '',
      phoneNumber: client.phoneNumber ?? undefined,
      addressLine1: newAddress,
      coordinates: coordinates,
      city: city,
      district: district
    };

    // Plus besoin de mettre à jour le cache - city/district/sector sont déjà dans MongoDB
    // Les routes lisent directement depuis MongoDB maintenant

    console.log('📤 Envoi de la réponse au client...');
    res.json({
      success: true,
      message: 'Client mis à jour avec succès.',
      client: clientWithLocation,
      location: {
        sector,
        city,
        district
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour obtenir le timestamp de la dernière mise à jour de la base de données
router.get('/last-update', async (req: Request, res: Response): Promise<void> => {
  try {
    // Trouver le client avec le updatedAt le plus récent
    const lastUpdatedClient = await Client.findOne().sort({ updatedAt: -1 });
    
    if (!lastUpdatedClient) {
      res.json({
        success: true,
        lastUpdate: null,
        message: 'Aucun client dans la base de données'
      });
      return;
    }

    const lastUpdate = lastUpdatedClient.updatedAt || lastUpdatedClient.createdAt;
    
    res.json({
      success: true,
      lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : null,
      totalClients: await Client.countDocuments()
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération de la dernière mise à jour:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Fonction helper pour extraire tous les clients depuis la structure clientsBySector
// Retourne les clients avec coordonnées ET les statistiques sur ceux sans coordonnées
function extractClientsFromSectorData(clientsBySector: Record<string, Record<string, {
  districts?: Record<string, ClientWithLocation[]>;
  clients: ClientWithLocation[];
}>>): { clients: ClientWithLocation[]; withoutCoordinates: number } {
  const clients: ClientWithLocation[] = [];
  let withoutCoordinates = 0;
  
  for (const [sector, sectorData] of Object.entries(clientsBySector)) {
    if (!sectorData || typeof sectorData !== 'object') continue;
    
    // Pour Montréal et Laval (structure spéciale)
    if ((sector === 'Montréal' || sector === 'Laval') && sectorData[sector]) {
      const cityData = sectorData[sector];
      
      // Clients dans les districts
      if (cityData.districts) {
        for (const districtClients of Object.values(cityData.districts)) {
          for (const client of districtClients) {
            if (client.coordinates && client.coordinates.lng && client.coordinates.lat) {
              clients.push({
                ...client,
                sector: sector
              });
            } else {
              withoutCoordinates++;
            }
          }
        }
      }
      
      // Clients sans district
      if (Array.isArray(cityData.clients)) {
        for (const client of cityData.clients) {
          if (client.coordinates && client.coordinates.lng && client.coordinates.lat) {
            clients.push({
              ...client,
              sector: sector
            });
          } else {
            withoutCoordinates++;
          }
        }
      }
    } else {
      // Pour les autres secteurs (structure normale : secteur -> ville -> clients)
      for (const [, cityData] of Object.entries(sectorData)) {
        if (!cityData || typeof cityData !== 'object') continue;
        
        // Clients directs dans la ville
        if (Array.isArray(cityData.clients)) {
          for (const client of cityData.clients) {
            if (client.coordinates && client.coordinates.lng && client.coordinates.lat) {
              clients.push({
                ...client,
                sector: sector
              });
            } else {
              withoutCoordinates++;
            }
          }
        }
        
        // Clients dans les districts de la ville
        if (cityData.districts) {
          for (const districtClients of Object.values(cityData.districts)) {
            for (const client of districtClients) {
              if (client.coordinates && client.coordinates.lng && client.coordinates.lat) {
                clients.push({
                  ...client,
                  sector: sector
                });
              } else {
                withoutCoordinates++;
              }
            }
          }
        }
      }
    }
  }
  
  return { clients, withoutCoordinates };
}

// Route pour récupérer tous les clients avec leurs coordonnées pour la carte
// Réutilise la même logique que /by-city-stream pour garantir la cohérence
// Fonction pour ajouter un client au cache "for-map" de manière incrémentale
export async function addClientToForMapCache(clientId: string): Promise<void> {
  try {
    const client = await Client.findById(clientId).lean();
    
    if (!client) {
      return;
    }

    // Vérifier si le client a des coordonnées
    const hasCoordinates = client.coordinates && 
      typeof client.coordinates === 'object' &&
      client.coordinates !== null &&
      'lng' in client.coordinates &&
      'lat' in client.coordinates &&
      client.coordinates.lng != null &&
      client.coordinates.lat != null;

    if (!hasCoordinates) {
      console.log(`⚠️ Client ${clientId} (${client.givenName || ''} ${client.familyName || ''}) sans coordonnées, ignoré pour le cache for-map`);
      console.log(`   - addressLine1: ${client.addressLine1 || 'null'}`);
      console.log(`   - coordinates: ${JSON.stringify(client.coordinates)}`);
      return;
    }
    
    const coords = client.coordinates as { lng: number; lat: number };
    console.log(`📍 Ajout du client ${clientId} au cache for-map avec coordonnées: ${coords.lng}, ${coords.lat}`);

    // Récupérer le cache existant
    const cached = await ClientByCityCache.findOne({ cacheType: 'for-map' });
    if (!cached || !cached.data) {
      return;
    }

    // Utiliser directement city, district, sector depuis MongoDB (si disponibles)
    // Sinon, fallback vers extraction depuis adresse
    let city: string;
    let district: string | undefined;
    let sector: string;

    if (client.city && client.sector) {
      // Utiliser les champs directement depuis MongoDB
      city = client.city;
      district = client.district || undefined;
      sector = client.sector;
      console.log(`✅ Utilisation des champs MongoDB: ${city}${district ? ` (${district})` : ''} [${sector}]`);
    } else {
      // Fallback pour les anciens clients
      if (client.addressLine1) {
        try {
          const addressResult = await extractCityAndDistrict(client.addressLine1);
          city = addressResult.city;
          district = addressResult.district;
          sector = getSector(city);
        } catch (error) {
          console.warn(`Erreur lors de l'extraction de la ville pour ${client.givenName}:`, error);
          if (client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null) {
            const coordsResult = await extractCityFromCoordinates(client.coordinates.lng, client.coordinates.lat);
            if (coordsResult) {
              city = coordsResult.city;
              district = coordsResult.district;
              sector = getSector(city);
            } else {
              city = 'Inconnu';
              sector = 'Non assignés';
            }
          } else {
            city = 'Inconnu';
            sector = 'Non assignés';
          }
        }
      } else {
        city = 'Inconnu';
        sector = 'Non assignés';
      }
    }

    const cacheData = cached.data as any;
    const formattedClient = {
      _id: client._id.toString(),
      name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
      phoneNumber: client.phoneNumber || undefined,
      address: client.addressLine1 || '',
      city: city,
      district: district || undefined,
      sector: sector,
      coordinates: {
        lng: (client.coordinates as any).lng,
        lat: (client.coordinates as any).lat
      }
    };

    // Vérifier si le client existe déjà dans le cache (éviter les doublons)
    if (!cacheData.clients) {
      cacheData.clients = [];
    }
    
    // Retirer l'ancienne entrée si elle existe (au cas où)
    const existingIndex = cacheData.clients.findIndex((c: any) => c._id === clientId);
    if (existingIndex >= 0) {
      cacheData.clients.splice(existingIndex, 1);
    }
    
    // Ajouter le client à la liste
    cacheData.clients.push(formattedClient);

    // Mettre à jour les statistiques (ne pas incrémenter si le client existait déjà)
    const wasNew = existingIndex < 0;
    cacheData.total = cacheData.clients.length;
    if (wasNew) {
      cacheData.totalInDatabase = (cacheData.totalInDatabase || 0) + 1;
      cacheData.totalWithCoordinates = (cacheData.totalWithCoordinates || 0) + 1;
    }

    // Sauvegarder
    const updateResult = await ClientByCityCache.findOneAndUpdate(
      { cacheType: 'for-map' },
      {
        data: cacheData,
        totalClients: cacheData.totalInDatabase,
        lastUpdate: new Date()
      },
      { new: true }
    );
    
    if (!updateResult) {
      throw new Error('Échec de la sauvegarde du cache for-map');
    }
  } catch (error) {
    console.error(`❌ Erreur lors de l'ajout du client ${clientId} au cache for-map:`, error);
    await ClientByCityCache.deleteMany({ cacheType: 'for-map' });
  }
}

// Fonction pour retirer un client du cache "for-map"
export async function removeClientFromForMapCache(clientId: string): Promise<void> {
  try {
    const cached = await ClientByCityCache.findOne({ cacheType: 'for-map' });
    if (!cached || !cached.data) {
      return;
    }

    const cacheData = cached.data as any;
    if (cacheData.clients) {
      const index = cacheData.clients.findIndex((c: any) => c._id === clientId);
      if (index >= 0) {
        cacheData.clients.splice(index, 1);
        cacheData.total = cacheData.clients.length;
        cacheData.totalInDatabase = Math.max(0, cacheData.totalInDatabase - 1);
        cacheData.totalWithCoordinates = Math.max(0, cacheData.totalWithCoordinates - 1);

        await ClientByCityCache.findOneAndUpdate(
          { cacheType: 'for-map' },
          {
            data: cacheData,
            totalClients: cacheData.totalInDatabase,
            lastUpdate: new Date()
          }
        );
      }
    }
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression du client ${clientId} du cache for-map:`, error);
  }
}

// Fonction pour mettre à jour un client dans le cache "for-map"
export async function updateClientInForMapCache(clientId: string): Promise<void> {
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Vérifier que le client a bien des coordonnées avant de continuer
    const clientCheck = await Client.findById(clientId).lean();
    if (!clientCheck) {
      await removeClientFromForMapCache(clientId);
      return;
    }
    
    const hasCoords = clientCheck.coordinates && 
      typeof clientCheck.coordinates === 'object' &&
      clientCheck.coordinates !== null &&
      'lng' in clientCheck.coordinates &&
      'lat' in clientCheck.coordinates &&
      clientCheck.coordinates.lng != null &&
      clientCheck.coordinates.lat != null;
    
    if (!hasCoords) {
      await removeClientFromForMapCache(clientId);
      return;
    }
    
    // Retirer puis ajouter
    await removeClientFromForMapCache(clientId);
    await addClientToForMapCache(clientId);
  } catch (error) {
    console.error(`❌ Erreur lors de la mise à jour du client ${clientId} dans le cache for-map:`, error);
    throw error;
  }
}

// Fonction utilitaire pour mettre à jour le cache "for-map"
async function updateForMapCache(): Promise<{
  clients: any[];
  total: number;
  totalInDatabase: number;
  totalWithCoordinates: number;
  withoutCoordinates: number;
  missingClients: Array<{_id: string, name: string, address: string, reason: string}>;
}> {
  try {
    // Utiliser la même logique que /by-city pour obtenir les données traitées
    // On va appeler la logique interne sans streaming
    const allClients = await Client.find({});
    const clientsWithAddress = allClients.filter(c => c.addressLine1 && c.addressLine1.trim() !== '');
    const clientsWithoutAddress = allClients.filter(c => !c.addressLine1 || c.addressLine1.trim() === '');
    
    // Compter les clients avec coordonnées
    const clientsWithCoordinates = allClients.filter(c => 
      c.coordinates && 
      typeof c.coordinates === 'object' &&
      c.coordinates !== null &&
      'lng' in c.coordinates &&
      'lat' in c.coordinates &&
      c.coordinates.lng != null &&
      c.coordinates.lat != null
    );
    
    console.log(`\n========================================`);
    console.log(`🗺️  DÉBUT TRAITEMENT POUR LA CARTE`);
    console.log(`📊 Total clients dans la BD: ${allClients.length}`);
    console.log(`📊 Clients avec adresse: ${clientsWithAddress.length}`);
    console.log(`📊 Clients sans adresse: ${clientsWithoutAddress.length}`);
    console.log(`📊 Clients avec coordonnées GPS: ${clientsWithCoordinates.length}`);
    console.log(`========================================\n`);
    
    // Structures pour organiser les clients (même logique que /by-city-stream)
    const clientsBySector: Record<string, Record<string, {
      districts?: Record<string, ClientWithLocation[]>;
      clients: ClientWithLocation[];
    }>> = {};
    const processedClientIds = new Set<string>();
    
    // Traiter les clients avec adresse (même logique que /by-city-stream)
    const clientsInAutres: Array<{name: string, address: string, city: string, reason: string}> = [];
    
    for (let i = 0; i < clientsWithAddress.length; i++) {
      const client = clientsWithAddress[i];
      
      if (!client.addressLine1) continue;
      
      // Délai progressif pour éviter les rate limits (50ms tous les 10 clients)
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Extraire la ville depuis l'adresse textuelle d'abord
      let addressResult: { city: string; district?: string };
      try {
        addressResult = await extractCityAndDistrict(client.addressLine1);
      } catch (error) {
        // Si l'API HERE échoue, utiliser un fallback basé sur l'adresse textuelle
        console.warn(`⚠️  Erreur HERE API pour ${client.givenName} (${client.addressLine1}):`, error);
        
        // Fallback : chercher la ville directement dans l'adresse textuelle
        const addressLower = client.addressLine1.toLowerCase();
        let fallbackCity = 'Inconnu';
        
        // Chercher les villes connues dans l'adresse
        if (addressLower.includes('montréal') || addressLower.includes('montreal')) {
          fallbackCity = 'Montréal';
        } else if (addressLower.includes('laval')) {
          fallbackCity = 'Laval';
        } else {
          // Chercher dans les listes de villes
          for (const riveNordCity of RIVE_NORD_CITIES) {
            if (addressLower.includes(riveNordCity.toLowerCase())) {
              fallbackCity = riveNordCity;
              break;
            }
          }
          if (fallbackCity === 'Inconnu') {
            for (const riveSudCity of RIVE_SUD_CITIES) {
              if (addressLower.includes(riveSudCity.toLowerCase())) {
                fallbackCity = riveSudCity;
                break;
              }
            }
          }
          if (fallbackCity === 'Inconnu') {
            for (const agglCity of MONTREAL_AGGLO_CITIES) {
              if (addressLower.includes(agglCity.toLowerCase())) {
                fallbackCity = 'Montréal'; // Normaliser vers Montréal
                break;
              }
            }
          }
        }
        
        addressResult = { city: fallbackCity };
      }
      
      const city: string = addressResult.city;
      let district: string | undefined = addressResult.district;
      
      // Si le client a des coordonnées GPS, les utiliser pour valider/améliorer
      if (client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null) {
        const coordsResult = await extractCityFromCoordinates(client.coordinates.lng, client.coordinates.lat);
        if (coordsResult) {
          const addressLower = client.addressLine1.toLowerCase();
          const hasExplicitCity = addressLower.includes('montréal') || 
                                 addressLower.includes('montreal') ||
                                 addressLower.includes('laval') ||
                                 addressLower.includes('terrebonne') ||
                                 addressLower.includes('mirabel');
          
          if (hasExplicitCity) {
            if (coordsResult.district && !district && city.toLowerCase() === 'laval') {
              district = coordsResult.district;
            }
          } else if (coordsResult.city.toLowerCase() === city.toLowerCase()) {
            if (coordsResult.district && !district) {
              district = coordsResult.district;
            }
          }
        }
      }
      
      // Code postal pour Laval
      if (city.toLowerCase() === 'laval' && !district && client.addressLine1) {
        const postalCodeMatch = client.addressLine1.match(/\b([A-Z]\d[A-Z])\s*\d[A-Z]\d\b/i);
        if (postalCodeMatch) {
          const postalCode = postalCodeMatch[1].toUpperCase();
          const districtFromPostal = getDistrictFromPostalCode(postalCode);
          if (districtFromPostal) {
            district = districtFromPostal;
          }
        }
      }
      
      const sector = getSector(city);
      const clientId = client._id.toString();
      
      // Logger les clients qui vont dans "Autres" pour debug
      if (sector === 'Autres') {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim() || 'Sans nom';
        let reason = `Ville détectée: "${city}"`;
        if (city === 'Inconnu') {
          reason = 'Erreur API HERE ou ville non détectée';
        } else if (!city || city.trim() === '') {
          reason = 'Ville vide après traitement';
        }
        clientsInAutres.push({
          name: clientName,
          address: client.addressLine1,
          city: city,
          reason: reason
        });
      }
      
      // Stocker dans la structure (même logique que /by-city-stream)
      // On traite TOUS les clients, même ceux sans coordonnées
      if (!clientsBySector[sector]) {
        clientsBySector[sector] = {};
      }
      
      const clientData: ClientWithLocation = {
        _id: clientId,
        givenName: client.givenName || '',
        familyName: client.familyName || '',
        phoneNumber: client.phoneNumber ?? undefined,
        addressLine1: client.addressLine1,
        coordinates: client.coordinates && client.coordinates.lng != null && client.coordinates.lat != null
          ? { lng: client.coordinates.lng as number, lat: client.coordinates.lat as number }
          : undefined,
        city: city,
        district: district,
        sector: sector
      };
      
      if (sector === 'Montréal' || sector === 'Laval') {
        if (!clientsBySector[sector][sector]) {
          clientsBySector[sector][sector] = { districts: {}, clients: [] };
        }
        const sectorData = clientsBySector[sector][sector];
        
        if (district) {
          if (!sectorData.districts) {
            sectorData.districts = {};
          }
          if (!sectorData.districts[district]) {
            sectorData.districts[district] = [];
          }
          sectorData.districts[district].push(clientData);
        } else {
          sectorData.clients.push(clientData);
        }
      } else {
        if (!clientsBySector[sector][city]) {
          clientsBySector[sector][city] = { clients: [], districts: {} };
        }
        const cityData = clientsBySector[sector][city];
        
        if (district) {
          if (!cityData.districts) {
            cityData.districts = {};
          }
          if (!cityData.districts[district]) {
            cityData.districts[district] = [];
          }
          cityData.districts[district].push(clientData);
        } else {
          cityData.clients.push(clientData);
        }
      }
      
      processedClientIds.add(clientId);
      
      // Vérifier si le client a des coordonnées mais n'a pas été ajouté
      if (client.coordinates && 
          typeof client.coordinates === 'object' &&
          client.coordinates !== null &&
          'lng' in client.coordinates &&
          'lat' in client.coordinates &&
          client.coordinates.lng != null &&
          client.coordinates.lat != null) {
        // Le client a des coordonnées, il devrait être dans clientsBySector
        // On vérifiera après l'extraction
      }
    }
    
    // Traiter aussi les clients sans adresse qui ont des coordonnées
    // (Ils sont dans "Non assignés" mais peuvent être affichés sur la carte)
    for (const client of clientsWithoutAddress) {
      const clientId = client._id.toString();
      
      // Vérifier que le client a des coordonnées
      if (client.coordinates && 
          typeof client.coordinates === 'object' &&
          client.coordinates !== null &&
          'lng' in client.coordinates &&
          'lat' in client.coordinates &&
          client.coordinates.lng != null &&
          client.coordinates.lat != null) {
        
        // Ajouter dans "Non assignés" -> "Sans adresse"
        if (!clientsBySector['Non assignés']) {
          clientsBySector['Non assignés'] = {};
        }
        if (!clientsBySector['Non assignés']['Sans adresse']) {
          clientsBySector['Non assignés']['Sans adresse'] = { clients: [] };
        }
        
        const clientData: ClientWithLocation = {
          _id: clientId,
          givenName: client.givenName || '',
          familyName: client.familyName || '',
          phoneNumber: client.phoneNumber ?? undefined,
          addressLine1: '',
          coordinates: { lng: client.coordinates.lng as number, lat: client.coordinates.lat as number },
          city: 'Sans adresse',
          sector: 'Non assignés'
        };
        
        clientsBySector['Non assignés']['Sans adresse'].clients.push(clientData);
        processedClientIds.add(clientId);
      }
    }
    
    // Extraire tous les clients avec coordonnées depuis la structure
    const { clients: clientsWithLocation } = extractClientsFromSectorData(clientsBySector);
    
    // Identifier les clients avec coordonnées qui n'ont pas été ajoutés
    const addedClientIds = new Set(clientsWithLocation.map(c => c._id));
    const missingClients: Array<{_id: string, name: string, address: string, reason: string}> = [];
    
    for (const client of clientsWithCoordinates) {
      const clientId = client._id.toString();
      if (!addedClientIds.has(clientId)) {
        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim();
        let reason = 'Non traité';
        
        if (!client.addressLine1 || client.addressLine1.trim() === '') {
          reason = 'Sans adresse (non ajouté à la structure)';
        } else if (!processedClientIds.has(clientId)) {
          reason = 'Non traité dans la boucle (erreur lors du traitement)';
        } else {
          reason = 'Traités mais non extraits de la structure (erreur d\'extraction)';
        }
        
        missingClients.push({
          _id: clientId,
          name: clientName || 'Sans nom',
          address: client.addressLine1 || 'Sans adresse',
          reason: reason
        });
      }
    }
    
    // Compter les clients sans coordonnées (ceux qui n'ont vraiment pas de coordonnées)
    const clientsWithoutCoords = allClients.filter(c => 
      !c.coordinates || 
      typeof c.coordinates !== 'object' ||
      c.coordinates === null ||
      !('lng' in c.coordinates) ||
      !('lat' in c.coordinates) ||
      c.coordinates.lng == null ||
      c.coordinates.lat == null
    );
    const totalWithoutCoordinates = clientsWithoutCoords.length;
    
    // Compter les clients dans chaque secteur pour debug
    const sectorCounts: Record<string, number> = {};
    for (const [sector, sectorData] of Object.entries(clientsBySector)) {
      let count = 0;
      if (sector === 'Montréal' || sector === 'Laval') {
        if (sectorData[sector]) {
          const cityData = sectorData[sector];
          if (cityData.districts) {
            for (const districtClients of Object.values(cityData.districts)) {
              count += districtClients.length;
            }
          }
          if (Array.isArray(cityData.clients)) {
            count += cityData.clients.length;
          }
        }
      } else {
        for (const cityData of Object.values(sectorData)) {
          if (Array.isArray(cityData.clients)) {
            count += cityData.clients.length;
          }
          if (cityData.districts) {
            for (const districtClients of Object.values(cityData.districts)) {
              count += districtClients.length;
            }
          }
        }
      }
      sectorCounts[sector] = count;
    }
    
    console.log(`\n========================================`);
    console.log(`📊 RÉSULTATS FINAUX POUR LA CARTE`);
    console.log(`✅ Clients affichés sur la carte: ${clientsWithLocation.length}`);
    console.log(`📊 Clients avec coordonnées dans la BD: ${clientsWithCoordinates.length}`);
    console.log(`⚠️  Clients avec coordonnées mais non affichés: ${missingClients.length}`);
    console.log(`\n📊 Répartition dans clientsBySector:`);
    for (const [sector, count] of Object.entries(sectorCounts)) {
      console.log(`   ${sector}: ${count} clients`);
    }
    if (missingClients.length > 0) {
      console.log(`\n📋 Liste des clients manquants (premiers 30):`);
      missingClients.slice(0, 30).forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.name} - ${c.address || 'Sans adresse'} (${c.reason})`);
      });
      if (missingClients.length > 30) {
        console.log(`   ... et ${missingClients.length - 30} autres`);
      }
    }
    console.log(`📊 Clients sans coordonnées: ${totalWithoutCoordinates}`);
    console.log(`📊 Total dans la BD: ${allClients.length}`);
    console.log(`📊 Calcul attendu: ${allClients.length} - ${totalWithoutCoordinates} = ${allClients.length - totalWithoutCoordinates} clients avec coordonnées`);
    console.log(`📊 Différence: ${clientsWithCoordinates.length - clientsWithLocation.length} clients manquants`);
    
    // Afficher les clients dans "Autres" pour debug
    if (clientsInAutres.length > 0) {
      console.log(`\n⚠️  ${clientsInAutres.length} client(s) classé(s) dans "Autres":`);
      clientsInAutres.slice(0, 20).forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.name} - ${c.address.substring(0, 50)}... (${c.reason})`);
      });
      if (clientsInAutres.length > 20) {
        console.log(`   ... et ${clientsInAutres.length - 20} autres`);
      }
    }
    
    console.log(`========================================\n`);
    
    // Formater pour la réponse (ajouter name et address)
    const formattedClients = clientsWithLocation.map(client => ({
      _id: client._id,
      name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
      phoneNumber: client.phoneNumber,
      address: client.addressLine1,
      city: client.city,
      district: client.district,
      sector: client.sector,
      coordinates: client.coordinates
    }));

    return {
      clients: formattedClients,
      total: formattedClients.length,
      totalInDatabase: allClients.length,
      totalWithCoordinates: clientsWithCoordinates.length,
      withoutCoordinates: totalWithoutCoordinates,
      missingClients: missingClients
    };
  } catch (error) {
    console.error('❌ Erreur lors du calcul des clients pour la carte:', error);
    throw error;
  }
}

// Route pour la carte - Utilise directement MongoDB (sans cache)
router.get('/for-map', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📍 Calcul direct depuis MongoDB pour la map (optimisé)...');
    const startTime = Date.now();

    // Récupérer tous les clients avec coordonnées et city/sector depuis MongoDB
    const clients = await Client.find({
      coordinates: { $exists: true },
      'coordinates.lng': { $exists: true },
      'coordinates.lat': { $exists: true },
      city: { $exists: true, $ne: null },
      sector: { $exists: true, $ne: null }
    }).lean();

    // Formater pour la map
    const formattedClients = clients.map(client => ({
      _id: client._id.toString(),
      name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
      phoneNumber: client.phoneNumber || undefined,
      address: client.addressLine1 || '',
      city: client.city || 'Inconnu',
      district: client.district || undefined,
      sector: client.sector || 'Non assignés',
      coordinates: {
        lng: (client.coordinates as any).lng,
        lat: (client.coordinates as any).lat
      }
    }));

    // Statistiques
    const totalInDatabase = await Client.countDocuments();
    const totalWithCoordinates = formattedClients.length;
    const withoutCoordinates = await Client.countDocuments({ 
      $or: [
        { coordinates: { $exists: false } },
        { 'coordinates.lng': { $exists: false } },
        { 'coordinates.lat': { $exists: false } }
      ]
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Calcul terminé en ${totalTime}s (${formattedClients.length} clients)`);

    res.json({
      success: true,
      clients: formattedClients,
      total: formattedClients.length,
      totalInDatabase: totalInDatabase,
      totalWithCoordinates: totalWithCoordinates,
      withoutCoordinates: withoutCoordinates,
      missingClients: [],
      message: withoutCoordinates > 0 
        ? `${withoutCoordinates} client(s) ne peuvent pas être affichés sur la carte (sans coordonnées GPS)`
        : 'Tous les clients sont affichés sur la carte'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients pour la carte:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour forcer la mise à jour du cache "for-map"
router.post('/for-map/update-cache', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Mise à jour forcée du cache for-map...');
    const result = await updateForMapCache();
    
    // Sauvegarder dans le cache
    await ClientByCityCache.findOneAndUpdate(
      { cacheType: 'for-map' },
      {
        cacheType: 'for-map',
        data: result,
        totalClients: result.totalInDatabase,
        lastUpdate: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Cache for-map mis à jour avec succès');
    
    res.json({
      success: true,
      message: 'Cache mis à jour avec succès',
      total: result.total,
      totalInDatabase: result.totalInDatabase
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du cache:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour récupérer les clients sans coordonnées GPS
router.get('/without-coordinates', async (req: Request, res: Response): Promise<void> => {
  try {
    const allClients = await Client.find({});
    
    const clientsWithoutCoords = allClients
      .filter(client => {
        // Vérifier si le client n'a pas de coordonnées
        return !client.coordinates || 
               typeof client.coordinates !== 'object' ||
               client.coordinates === null ||
               !('lng' in client.coordinates) ||
               !('lat' in client.coordinates) ||
               client.coordinates.lng == null ||
               client.coordinates.lat == null;
      })
      .map(client => {
        const hasAddress = client.addressLine1 && client.addressLine1.trim() !== '';
        return {
          _id: client._id.toString(),
          name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
          phoneNumber: client.phoneNumber,
          address: client.addressLine1 || 'Sans adresse',
          hasAddress: hasAddress,
          reason: hasAddress 
            ? 'Adresse présente mais coordonnées GPS non géocodées' 
            : 'Aucune adresse disponible'
        };
      });

    const withAddress = clientsWithoutCoords.filter(c => c.hasAddress).length;
    const withoutAddress = clientsWithoutCoords.filter(c => !c.hasAddress).length;

    res.json({
      success: true,
      clients: clientsWithoutCoords,
      total: clientsWithoutCoords.length,
      withAddress: withAddress,
      withoutAddress: withoutAddress
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients sans coordonnées:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

// Route pour géocoder les clients sans coordonnées qui ont une adresse
router.post('/geocode-missing', async (req: Request, res: Response): Promise<void> => {
  try {
    const HERE_API_KEY = process.env.HERE_API_KEY;
    if (!HERE_API_KEY) {
      res.status(500).json({
        success: false,
        error: 'HERE_API_KEY non configuré'
      });
      return;
    }

    // Récupérer tous les clients sans coordonnées mais avec adresse
    const clientsToGeocode = await Client.find({
      addressLine1: { $exists: true, $ne: '' },
      $or: [
        { coordinates: { $exists: false } },
        { 'coordinates.lng': { $exists: false } },
        { 'coordinates.lat': { $exists: false } },
        { 'coordinates.lng': null },
        { 'coordinates.lat': null }
      ]
    });

    console.log(`📍 Géocodage de ${clientsToGeocode.length} clients...`);

    let successCount = 0;
    let failCount = 0;
    const failedClients: Array<{name: string, address: string, reason: string}> = [];

    for (let i = 0; i < clientsToGeocode.length; i++) {
      const client = clientsToGeocode[i];
      if (!client.addressLine1) continue;

      try {
        // Géocodage avec HERE API
        const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(client.addressLine1)}&apiKey=${HERE_API_KEY}&in=countryCode:CAN&limit=1`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HERE API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.items && data.items.length > 0) {
          const position = data.items[0].position;
          
          await Client.updateOne(
            { _id: client._id },
            {
              $set: {
                coordinates: {
                  lng: position.lng,
                  lat: position.lat
                }
              }
            }
          );

          successCount++;
          console.log(`✅ ${client.givenName} (${client.addressLine1}) -> ${position.lat}, ${position.lng}`);
        } else {
          failCount++;
          failedClients.push({
            name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
            address: client.addressLine1,
            reason: 'Adresse non trouvée par HERE API'
          });
          console.log(`❌ Aucun résultat pour ${client.givenName} (${client.addressLine1})`);
        }

        // Délai pour éviter de surcharger l'API (50ms tous les 10 clients)
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        failCount++;
        failedClients.push({
          name: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
          address: client.addressLine1 || 'Sans adresse',
          reason: error instanceof Error ? error.message : 'Erreur inconnue'
        });
        console.error(`❌ Erreur pour ${client.givenName}:`, error);
      }
    }

    res.json({
      success: true,
      total: clientsToGeocode.length,
      successCount: successCount,
      failCount: failCount,
      failedClients: failedClients.slice(0, 20), // Limiter à 20 pour la réponse
      message: `${successCount} client(s) géocodés avec succès, ${failCount} échec(s)`
    });
  } catch (error) {
    console.error('❌ Erreur lors du géocodage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    });
  }
});

export default router;

