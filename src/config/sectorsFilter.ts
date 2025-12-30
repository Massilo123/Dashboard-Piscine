/**
 * Fonction pour filtrer les secteurs/villes qui correspondent à la recherche
 */

// Tous les secteurs et villes combinés
export const ALL_LOCATIONS = [
  // Rive Nord
  'Terrebonne',
  'Blainville',
  'Repentigny',
  'Saint-Eustache',
  'Mirabel',
  'Mascouche',
  'Saint-Jérôme',
  'Rosemère',
  "L'Assomption",
  'Lorraine',
  'Bois-des-Filion',
  'Saint-Joseph-du-Lac',
  'Sainte-Thérèse',
  'Oka',
  'Prévost',
  'Sainte-Marthe-sur-le-Lac',
  'Lanoraie',
  'Saint-Sauveur',
  'Boisbriand',
  'Brownsburg-Chatham',
  'Charlemagne',
  'Lavaltrie',
  // Rive Sud
  'Longueuil',
  'Brossard',
  'Candiac',
  'Saint-Constant',
  'Châteauguay',
  'Mercier',
  'Vaudreuil-Dorion',
  'Sorel-Tracy',
  'Saint-Rémi',
  // Laval
  'Chomedey',
  'Sainte-Dorothée',
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
  // Montréal
  'Ahuntsic',
  'Anjou',
  'Baie-d\'Urfé',
  'Beaconsfield',
  'Côte-des-Neiges',
  'Côte-Saint-Luc',
  'Dorval',
  'Dollard-des-Ormeaux',
  'Hampstead',
  'Île-Bizard',
  'Kirkland',
  'Lachine',
  'LaSalle',
  'Mont-Royal',
  'Montréal-Est',
  'Montréal-Nord',
  'Montréal-Ouest',
  'Outremont',
  'Pierrefonds',
  'Pointe-Claire',
  'Rosemont',
  'Saint-Laurent',
  'Saint-Léonard',
  'Sainte-Anne-de-Bellevue',
  'Sainte-Geneviève',
  'Sainte-Marie',
  'Verdun',
  'Ville-Marie',
  'Westmount',
  'Plateau-Mont-Royal',
  'Villeray',
  'Rosemont-La-Petite-Patrie',
  'Mercier',
  'Hochelaga-Maisonneuve',
  'Rivière-des-Prairies',
  'Ahuntsic-Cartierville',
  'Côte-des-Neiges–Notre-Dame-de-Grâce',
  'Notre-Dame-de-Grâce',
  'Petite-Patrie',
  'Cartierville',
  'Hochelaga',
  'Maisonneuve',
  'Roxboro',
  'Senneville',
  'Saint-Michel',
  'Pointe-aux-Trembles',
  'Rivière-des-Prairies-Pointe-aux-Trembles',
  'Villeray-Saint-Michel-Parc-Extension',
  'Mercier-Hochelaga-Maisonneuve',
] as const;

/**
 * Normalise un texte pour la recherche (enlève les accents, met en minuscules)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlève les accents
    .trim();
}

/**
 * Filtre les secteurs/villes qui correspondent à la recherche
 */
export function filterLocations(query: string): string[] {
  if (!query || query.length < 1) {
    return [];
  }

  const normalizedQuery = normalizeText(query);
  // Enlever les espaces et tirets pour permettre des correspondances comme "pointe au" -> "Pointe-aux-Trembles"
  const normalizedQueryNoSeparators = normalizedQuery.replace(/[- ]/g, '');
  
  // Si la requête contient des séparateurs, comparer sans séparateurs
  const hasSeparators = /[- ]/.test(normalizedQuery);
  
  return ALL_LOCATIONS.filter(location => {
    const normalizedLocation = normalizeText(location);
    const normalizedLocationNoSeparators = normalizedLocation.replace(/[- ]/g, '');
    
    // Si la requête contient des séparateurs, comparer sans séparateurs
    if (hasSeparators) {
      return normalizedLocationNoSeparators.includes(normalizedQueryNoSeparators);
    }
    
    // Sinon, correspondance exacte ou partielle (en ignorant les séparateurs)
    return normalizedLocation.includes(normalizedQuery) || 
           normalizedLocationNoSeparators.includes(normalizedQueryNoSeparators);
  }).slice(0, 10); // Limiter à 10 résultats
}

