import { MONTREAL_DISTRICTS, LAVAL_DISTRICTS, COMMON_CITIES } from '../config/districts';
import { findDistrictByPostalCode, extractPostalCode } from '../config/postalDistricts';

export function normalize(str: string): string {
    return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function findOfficialDistrict(text: string, city: 'Montréal' | 'Laval'): string | null {
    const districts = city === 'Montréal' ? MONTREAL_DISTRICTS : LAVAL_DISTRICTS;
    const normalizedText = normalize(text);

    // Recherche exacte d'abord
    for (const district of districts) {
        if (normalizedText === normalize(district)) {
            return district;
        }
    }

    // Recherche partielle ensuite
    for (const district of districts) {
        if (normalizedText.includes(normalize(district)) || 
            normalize(district).includes(normalizedText)) {
            return district;
        }
    }

    return null;
}

export function extractCityFromAddress(address: string): string | null {
    const addressLower = normalize(address);
    
    for (const city of COMMON_CITIES) {
        if (addressLower.includes(normalize(city))) {
            if (normalize(city).includes('montreal')) {
                return 'Montréal';
            }
            return city;
        }
    }
    return null;
}

interface DistrictInfo {
    city: string;
    neighborhood: string;
    confidence: number;
    source: 'postal' | 'mapbox' | 'address';
}

export function findDistrictInfo(client: any): DistrictInfo | null {
    // 1. Essayer d'abord avec le code postal
    if (client.addressLine1) {
        const postalCode = extractPostalCode(client.addressLine1);
        if (postalCode) {
            const districtInfo = findDistrictByPostalCode(postalCode);
            if (districtInfo) {
                return {
                    ...districtInfo,
                    confidence: 0.9,
                    source: 'postal'
                };
            }
        }

        // 2. Essayer d'extraire la ville de l'adresse
        const extractedCity = extractCityFromAddress(client.addressLine1);
        if (extractedCity) {
            if (extractedCity === 'Montréal' || extractedCity === 'Laval') {
                const officialDistrict = findOfficialDistrict(client.addressLine1, extractedCity);
                if (officialDistrict) {
                    return {
                        city: extractedCity,
                        neighborhood: officialDistrict,
                        confidence: 0.8,
                        source: 'address'
                    };
                }
            } else {
                // Pour les autres villes, utiliser la ville comme quartier
                return {
                    city: extractedCity,
                    neighborhood: extractedCity,
                    confidence: 0.7,
                    source: 'address'
                };
            }
        }
    }

    return null;
}

export function shouldHaveDetailedDistricts(city: string): boolean {
    return city === 'Montréal' || city === 'Laval';
}