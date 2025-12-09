/**
 * Configuration centralisée des districts pour Laval et Montréal
 * Ce fichier contient toutes les listes de districts, leurs variations et les mappings de codes postaux
 */

// ============================================================================
// VILLES DE L'AGGLOMÉRATION DE MONTRÉAL
// ============================================================================

/**
 * Liste des villes de l'agglomération de Montréal qui doivent être classées sous "Montréal"
 * Inclut toutes les variantes possibles (avec/sans tirets, majuscules/minuscules)
 */
export const MONTREAL_AGGLO_CITIES = [
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
] as const;

// ============================================================================
// DISTRICTS DE LAVAL
// ============================================================================

/**
 * Mapping des codes postaux de Laval vers les quartiers
 * Format: préfixe du code postal (3 caractères) -> quartier ou liste de quartiers possibles
 */
export const LAVAL_POSTAL_CODE_TO_DISTRICT: Record<string, string | string[]> = {
  // Chomedey
  'H7T': 'Chomedey', // Secteur nord-ouest de Chomedey
  'H7W': 'Chomedey',
  'H7S': ['Chomedey', 'Vimont'], // Partagé entre Chomedey et Vimont, priorité à Chomedey
  // Codes postaux partagés (Chomedey et Sainte-Dorothée)
  'H7X': ['Chomedey', 'Sainte-Dorothée'], // Partagé entre Chomedey et Sainte-Dorothée
  'H7Y': ['Chomedey', 'Sainte-Dorothée'], // Partagé entre Chomedey et Sainte-Dorothée
  // Duvernay
  'H7E': 'Duvernay',
  'H7G': 'Duvernay',
  // Fabreville
  'H7P': 'Fabreville',
  // Laval-des-Rapides
  'H7N': 'Laval-des-Rapides',
  'H7R': 'Laval-des-Rapides',
  // Laval-Ouest / Chomedey (partagé)
  'H7V': ['Laval-Ouest', 'Chomedey'], // Partagé entre Laval-Ouest et Chomedey, priorité à Laval-Ouest
  // Pont-Viau
  // (H7H déplacé vers Auteuil)
  // Sainte-Rose
  'H7L': 'Sainte-Rose',
  // Saint-François
  'H7A': 'Saint-François',
  'H7B': 'Saint-François',
  // Saint-Vincent-de-Paul
  'H7C': 'Saint-Vincent-de-Paul',
  // Vimont
  'H7M': 'Vimont',
  // Auteuil
  'H7H': 'Auteuil',
  'H7J': ['Auteuil', 'Saint-François'], // Partagé entre Auteuil et Saint-François, priorité à Auteuil
  'H7K': 'Auteuil',
};

/**
 * Liste des quartiers valides de Laval (basés uniquement sur les codes postaux confirmés)
 * Tous les quartiers détectés par HERE ou autres méthodes doivent être dans cette liste
 * Note: St-Dorothée-Station est fusionné avec Sainte-Dorothée
 */
export const VALID_LAVAL_DISTRICTS = new Set([
  'Chomedey',
  'Sainte-Dorothée', // Inclut St-Dorothée-Station
  'Duvernay',
  'Fabreville',
  'Laval-des-Rapides',
  'Laval-Ouest',
  'Pont-Viau',
  'Sainte-Rose',
  'Saint-François',
  'Saint-Vincent-de-Paul',
  'Vimont',
  'Auteuil',
]);

/**
 * Mappings des variations de noms de districts de Laval vers les noms normalisés
 * Utilisé pour normaliser les variations détectées par HERE API ou autres sources
 */
export const LAVAL_DISTRICT_VARIATIONS: Record<string, string> = {
  // Variations de Sainte-Dorothée (inclut St-Dorothée-Station)
  'st-dorothée-station': 'Sainte-Dorothée',
  'st dorothée station': 'Sainte-Dorothée',
  'sainte-dorothée-station': 'Sainte-Dorothée',
  'sainte dorothée station': 'Sainte-Dorothée',
  'st-dorothée': 'Sainte-Dorothée',
  'st dorothée': 'Sainte-Dorothée',
  'sainte-dorothée': 'Sainte-Dorothée',
  'sainte dorothée': 'Sainte-Dorothée',
  'ste-dorothée': 'Sainte-Dorothée',
  'ste dorothée': 'Sainte-Dorothée',
  // Variations de Saint-François
  'st-françois': 'Saint-François',
  'st françois': 'Saint-François',
  'saint-françois': 'Saint-François',
  'saint françois': 'Saint-François',
  'st-francois': 'Saint-François',
  'st francois': 'Saint-François',
  'saint-francois': 'Saint-François',
  'saint francois': 'Saint-François',
  'le val-st-françois': 'Saint-François',
  'le val-st-francois': 'Saint-François',
  'le val st-françois': 'Saint-François',
  'le val st-francois': 'Saint-François',
  'val-st-françois': 'Saint-François',
  'val-st-francois': 'Saint-François',
  'val st-françois': 'Saint-François',
  'val st-francois': 'Saint-François',
  // Variations de Sainte-Rose
  'st-rose': 'Sainte-Rose',
  'st rose': 'Sainte-Rose',
  'sainte-rose': 'Sainte-Rose',
  'sainte rose': 'Sainte-Rose',
  'ste-rose': 'Sainte-Rose',
  'ste rose': 'Sainte-Rose',
  'saint-rose': 'Sainte-Rose',
  'saint rose': 'Sainte-Rose',
  // Autres variations
  'laval-des-rapides': 'Laval-des-Rapides',
  'laval des rapides': 'Laval-des-Rapides',
  'laval-ouest': 'Laval-Ouest',
  'laval ouest': 'Laval-Ouest',
  'pont-viau': 'Pont-Viau',
  'pont viau': 'Pont-Viau',
  'saint-vincent-de-paul': 'Saint-Vincent-de-Paul',
  'saint vincent de paul': 'Saint-Vincent-de-Paul',
  'st-vincent-de-paul': 'Saint-Vincent-de-Paul',
  'st vincent de paul': 'Saint-Vincent-de-Paul',
};

/**
 * Liste des villes qui doivent être normalisées vers Laval
 * Utilisé pour détecter les variations de "Le Val-St-François" et les normaliser vers "Laval"
 */
export const LAVAL_NORMALIZED_CITIES = [
  'le val-st-françois',
  'le val-st-francois',
  'le val st-françois',
  'le val st-francois',
  'val-st-françois',
  'val-st-francois',
  'val st-françois',
  'val st-francois'
] as const;

/**
 * Liste des districts de Laval avec toutes leurs variations (pour recherche dans les adresses)
 * Utilisé dans extractCityAndDistrict pour détecter les districts dans les adresses
 */
export const LAVAL_DISTRICTS_SEARCH_LIST = [
  'chomedey',
  'duvernay',
  'fabreville',
  'iles-laval',
  'laval-des-rapides',
  'laval-ouest',
  'pont-viau',
  // Variations de Sainte-Dorothée
  'sainte-dorothée', 'sainte dorothée', 'saint-dorothée', 'saint dorothée',
  'ste-dorothée', 'ste dorothée', 'st-dorothée', 'st dorothée',
  'st-dorothée-station', 'st dorothée station', 'sainte-dorothée-station', 'sainte dorothée station',
  // Variations de Sainte-Rose
  'sainte-rose', 'sainte rose', 'saint-rose', 'saint rose',
  'ste-rose', 'ste rose', 'st-rose', 'st rose',
  // Variations de Saint-François
  'saint-françois', 'saint françois', 'saint-francois', 'saint francois',
  'st-françois', 'st françois', 'st-francois', 'st francois',
  'le val-st-françois', 'le val-st-francois', 'le val st-françois', 'le val st-francois',
  'val-st-françois', 'val-st-francois', 'val st-françois', 'val st-francois',
  // Autres quartiers principaux
  'saint-vincent-de-paul', 'auteuil',
  'vimont'
] as const;

// ============================================================================
// DISTRICTS DE MONTRÉAL
// ============================================================================

/**
 * Liste des districts de Montréal avec toutes leurs variations (pour recherche dans les adresses)
 * Utilisé dans extractCityAndDistrict pour détecter les districts dans les adresses
 */
export const MONTREAL_DISTRICTS_SEARCH_LIST = [
  'ahuntsic', 'anjou', 'baie-d\'urfé', 'beaconsfield', 'côte-des-neiges',
  'côte-saint-luc', 'dorval', 
  // Dollard-des-Ormeaux (avec toutes les variations)
  'dollard-des-ormeaux', 'dollard des ormeaux', 'dollard-des ormeaux', 'dollard des-ormeaux',
  'hampstead', 'ile-bizard',
  // Kirkland
  'kirkland',
  'lachine', 'lasalle', 'mont-royal', 'montréal-est', 'montréal-nord',
  'montréal-ouest', 'outremont', 
  // Pierrefonds (avec toutes les variations)
  'pierrefonds-roxboro', 'pierrefonds', 'roxboro',
  'pointe-claire',
  'rosemont', 'saint-laurent', 'saint-léonard', 'sainte-anne-de-bellevue',
  'sainte-geneviève', 'sainte-marie', 'verdun', 'ville-marie', 'westmount',
  'plateau-mont-royal', 'villeray', 'rosemont-la-petite-patrie', 'mercier',
  'hochelaga-maisonneuve', 'rivière-des-prairies',
  'ahuntsic-cartierville', 'côte-des-neiges–notre-dame-de-grâce', 'notre-dame-de-grâce',
  'petite-patrie', 'cartierville', 'hochelaga', 'maisonneuve', 'roxboro', 'senneville',
  'st-laurent', 'st-léonard', 'st-michel', 'montréal-nord', 'pointe-aux-trembles',
  'rivière-des-prairies-pointe-aux-trembles', 'villeray-st-michel-parc-extension',
  'mercier-hochelaga-maisonneuve', 'rosemont-la-petite-patrie'
] as const;

// ============================================================================
// CLASSIFICATION DES VILLES PAR SECTEUR GÉOGRAPHIQUE
// ============================================================================

/**
 * Liste des villes de la Rive Nord
 */
export const RIVE_NORD_CITIES = [
  'terrebonne', 'blainville', 'repentigny', 'st-eustache', 'saint-eustache',
  'mirabel', 'mascouche', 'st-jérôme', 'saint-jérôme', 'rosemère', 'rosemere',
  'l\'assomption', 'lassomption', 'lorraine', 'bois-des-filion', 'bois des filion',
  'st-joseph-du-lac', 'saint-joseph-du-lac', 'st-lin--laurentides', 'saint-lin--laurentides',
  'ste-thérèse', 'sainte-thérèse', 'oka', 'prévost', 'prevost',
  'ste-marthe-sur-le-lac', 'sainte-marthe-sur-le-lac', 'lanoraie',
  'saint-sauveur', 'st-sauveur', 'boisbriand', 'bois-briand',
  'brownsburg-chatham', 'brownsburg chatham', 'brownsburg', 'charlemagne', 'lavaltrie'
] as const;

/**
 * Liste des villes de la Rive Sud
 */
export const RIVE_SUD_CITIES = [
  'longueuil', 'brossard', 'candiac', 'st-constant', 'saint-constant',
  'châteauguay', 'chateauguay', 'mercier', 'vaudreuil-dorion', 'vaudreuil dorion',
  'sorel-tracy', 'sorel tracy',
  'saint-rémi', 'st-rémi', 'saint remi', 'st remi'
] as const;

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Fonction pour valider et normaliser un quartier de Laval
 * Retourne le quartier normalisé s'il est valide, undefined sinon
 */
export function validateLavalDistrict(district: string | undefined | null): string | undefined {
  if (!district) return undefined;
  
  const districtNormalized = district.trim();
  if (districtNormalized === '') return undefined;
  
  // Vérifier si le quartier est directement dans la liste valide
  if (VALID_LAVAL_DISTRICTS.has(districtNormalized)) {
    return districtNormalized;
  }
  
  // Normaliser les variations communes
  const districtLower = districtNormalized.toLowerCase();
  
  // Vérifier dans les mappings de variations
  if (LAVAL_DISTRICT_VARIATIONS[districtLower]) {
    return LAVAL_DISTRICT_VARIATIONS[districtLower];
  }
  
  // Si le quartier n'est pas valide, retourner undefined
  // Cela forcera le système à utiliser le code postal comme fallback
  return undefined;
}

/**
 * Fonction pour obtenir le district de Laval à partir d'un code postal
 * Retourne le district ou undefined si le code postal n'est pas reconnu
 */
export function getLavalDistrictFromPostalCode(postalCode: string): string | undefined {
  if (!postalCode || postalCode.length < 3) return undefined;
  
  const prefix = postalCode.substring(0, 3).toUpperCase();
  const districtOrDistricts = LAVAL_POSTAL_CODE_TO_DISTRICT[prefix];
  
  if (!districtOrDistricts) return undefined;
  
  // Si c'est un seul quartier, le retourner
  if (typeof districtOrDistricts === 'string') {
    return districtOrDistricts;
  }
  
  // Si c'est une liste, retourner le premier (priorité)
  if (Array.isArray(districtOrDistricts) && districtOrDistricts.length > 0) {
    // Pour H7S (Chomedey/Vimont), priorité à Chomedey
    if (prefix === 'H7S' && districtOrDistricts.includes('Chomedey')) {
      return 'Chomedey';
    }
    // Pour H7V (Laval-Ouest/Chomedey), priorité à Laval-Ouest
    if (prefix === 'H7V' && districtOrDistricts.includes('Laval-Ouest')) {
      return 'Laval-Ouest';
    }
    // Pour H7X et H7Y (Chomedey/Sainte-Dorothée), priorité à Chomedey
    if ((prefix === 'H7X' || prefix === 'H7Y') && districtOrDistricts.includes('Chomedey')) {
      return 'Chomedey';
    }
    // Pour H7J (Auteuil/Saint-François), priorité à Auteuil
    if (prefix === 'H7J' && districtOrDistricts.includes('Auteuil')) {
      return 'Auteuil';
    }
    
    return districtOrDistricts[0];
  }
  
  return undefined;
}

