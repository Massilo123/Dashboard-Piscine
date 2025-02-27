interface PostalMapping {
    city: string;
    neighborhood: string;
}

interface PostalMappings {
    [key: string]: PostalMapping;
}

export const POSTAL_DISTRICTS: PostalMappings = {
    'H1A': { city: 'Montréal', neighborhood: 'Pointe-aux-Trembles' },
    'H1B': { city: 'Montréal', neighborhood: 'Montréal-Est' },
    'H1C': { city: 'Montréal', neighborhood: 'Rivière-des-Prairies' },
    'H1E': { city: 'Montréal', neighborhood: 'Rivière-des-Prairies' },
    'H1G': { city: 'Montréal', neighborhood: 'Montréal-Nord' },
    'H1H': { city: 'Montréal', neighborhood: 'Montréal-Nord' },
    'H1J': { city: 'Montréal', neighborhood: 'Anjou' },
    'H1K': { city: 'Montréal', neighborhood: 'Anjou' },
    'H1L': { city: 'Montréal', neighborhood: 'Mercier' },
    'H1M': { city: 'Montréal', neighborhood: 'Mercier' },
    'H1N': { city: 'Montréal', neighborhood: 'Mercier' },
    'H1P': { city: 'Montréal', neighborhood: 'Saint-Léonard' },
    'H1R': { city: 'Montréal', neighborhood: 'Saint-Léonard' },
    'H1S': { city: 'Montréal', neighborhood: 'Saint-Léonard' },
    'H1T': { city: 'Montréal', neighborhood: 'Rosemont' },
    'H1V': { city: 'Montréal', neighborhood: 'Maisonneuve' },
    'H1W': { city: 'Montréal', neighborhood: 'Hochelaga' },
    'H1X': { city: 'Montréal', neighborhood: 'Rosemont' },
    'H1Y': { city: 'Montréal', neighborhood: 'Rosemont' },
    'H1Z': { city: 'Montréal', neighborhood: 'Saint-Michel' },
    
    'H2A': { city: 'Montréal', neighborhood: 'Saint-Michel' },
    'H2B': { city: 'Montréal', neighborhood: 'Ahuntsic' },
    'H2C': { city: 'Montréal', neighborhood: 'Ahuntsic' },
    'H2E': { city: 'Montréal', neighborhood: 'Villeray' },
    'H2G': { city: 'Montréal', neighborhood: 'Petite-Patrie' },
    'H2H': { city: 'Montréal', neighborhood: 'Plateau-Mont-Royal' },
    'H2J': { city: 'Montréal', neighborhood: 'Plateau-Mont-Royal' },
    'H2K': { city: 'Montréal', neighborhood: 'Centre-Sud' },
    'H2L': { city: 'Montréal', neighborhood: 'Centre-Sud' },
    'H2M': { city: 'Montréal', neighborhood: 'Ahuntsic' },
    'H2N': { city: 'Montréal', neighborhood: 'Ahuntsic' },
    'H2P': { city: 'Montréal', neighborhood: 'Villeray' },
    'H2R': { city: 'Montréal', neighborhood: 'Villeray' },
    'H2S': { city: 'Montréal', neighborhood: 'Petite-Patrie' },
    'H2T': { city: 'Montréal', neighborhood: 'Plateau-Mont-Royal' },
    'H2V': { city: 'Montréal', neighborhood: 'Outremont' },
    'H2W': { city: 'Montréal', neighborhood: 'Plateau-Mont-Royal' },
    'H2X': { city: 'Montréal', neighborhood: 'Plateau-Mont-Royal' },
    'H2Y': { city: 'Montréal', neighborhood: 'Vieux-Montréal' },
    'H2Z': { city: 'Montréal', neighborhood: 'Centre-ville' },

    // Laval
    'H7A': { city: 'Laval', neighborhood: 'Duvernay' },
    'H7B': { city: 'Laval', neighborhood: 'Saint-François' },
    'H7C': { city: 'Laval', neighborhood: 'Saint-Vincent-de-Paul' },
    'H7E': { city: 'Laval', neighborhood: 'Duvernay' },
    'H7G': { city: 'Laval', neighborhood: 'Pont-Viau' },
    'H7H': { city: 'Laval', neighborhood: 'Auteuil' },
    'H7J': { city: 'Laval', neighborhood: 'Auteuil' },
    'H7K': { city: 'Laval', neighborhood: 'Auteuil' },
    'H7L': { city: 'Laval', neighborhood: 'Sainte-Rose' },
    'H7M': { city: 'Laval', neighborhood: 'Vimont' },
    'H7N': { city: 'Laval', neighborhood: 'Laval-des-Rapides' },
    'H7P': { city: 'Laval', neighborhood: 'Fabreville' },
    'H7R': { city: 'Laval', neighborhood: 'Laval-sur-le-Lac' },
    'H7S': { city: 'Laval', neighborhood: 'Chomedey' },
    'H7T': { city: 'Laval', neighborhood: 'Chomedey' },
    'H7V': { city: 'Laval', neighborhood: 'Chomedey' },
    'H7W': { city: 'Laval', neighborhood: 'Chomedey' },
    'H7X': { city: 'Laval', neighborhood: 'Sainte-Dorothée' },
    'H7Y': { city: 'Laval', neighborhood: 'Îles-Laval' }
};

export function findDistrictByPostalCode(postalCode: string): PostalMapping | null {
    // Prendre les 3 premiers caractères du code postal
    const prefix = postalCode.substring(0, 3).toUpperCase();
    return POSTAL_DISTRICTS[prefix] || null;
}

// Fonction pour nettoyer et normaliser un code postal
export function normalizePostalCode(postalCode: string): string {
    return postalCode.replace(/\s+/g, '').toUpperCase();
}

// Fonction pour extraire le code postal d'une adresse
export function extractPostalCode(address: string): string | null {
    // Regex pour trouver un code postal canadien (format: A1A 1A1)
    const match = address.match(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/);
    return match ? normalizePostalCode(match[0]) : null;
}