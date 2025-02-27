interface Bounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

interface QuarterBounds {
    [key: string]: Bounds;
}

// Définition approximative des limites des quartiers de Laval
const LAVAL_QUARTERS: QuarterBounds = {
    'Duvernay': {
        north: 45.62,
        south: 45.57,
        east: -73.68,
        west: -73.72
    },
    'Saint-François': {
        north: 45.63,
        south: 45.58,
        east: -73.65,
        west: -73.68
    },
    'Saint-Vincent-de-Paul': {
        north: 45.57,
        south: 45.54,
        east: -73.68,
        west: -73.71
    },
    'Vimont': {
        north: 45.61,
        south: 45.57,
        east: -73.71,
        west: -73.74
    },
    'Auteuil': {
        north: 45.62,
        south: 45.58,
        east: -73.74,
        west: -73.78
    },
    'Laval-des-Rapides': {
        north: 45.57,
        south: 45.53,
        east: -73.71,
        west: -73.75
    },
    'Pont-Viau': {
        north: 45.57,
        south: 45.53,
        east: -73.68,
        west: -73.71
    },
    'Chomedey': {
        north: 45.57,
        south: 45.52,
        east: -73.75,
        west: -73.79
    },
    'Sainte-Rose': {
        north: 45.63,
        south: 45.58,
        east: -73.78,
        west: -73.82
    },
    'Fabreville': {
        north: 45.61,
        south: 45.57,
        east: -73.82,
        west: -73.86
    },
    'Sainte-Dorothée': {
        north: 45.57,
        south: 45.52,
        east: -73.79,
        west: -73.83
    }
};

export function findLavalQuarter(lat: number, lng: number): string | null {
    for (const [quarter, bounds] of Object.entries(LAVAL_QUARTERS)) {
        if (lat <= bounds.north && 
            lat >= bounds.south && 
            lng >= bounds.west && 
            lng <= bounds.east) {
            return quarter;
        }
    }
    return null;
}

export function findQuarterFromSector(sectorName: string): string | null {
    // Format attendu: "Secteur 45.52,-73.82"
    const match = sectorName.match(/Secteur (\d+\.\d+),(-\d+\.\d+)/);
    if (!match) return null;

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);

    return findLavalQuarter(lat, lng);
}

// Fonction pour améliorer le nom du quartier si c'est un secteur
export function improveQuarterName(district: { city: string, neighborhood: string }): { city: string, neighborhood: string } {
    if (district.city === 'Laval' && district.neighborhood.startsWith('Secteur')) {
        const betterName = findQuarterFromSector(district.neighborhood);
        if (betterName) {
            return {
                city: district.city,
                neighborhood: betterName
            };
        }
    }
    return district;
}