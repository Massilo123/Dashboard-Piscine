/**
 * Configuration des villes et districts pour les menus déroulants
 */

// Capitaliser la première lettre de chaque mot
function capitalizeCity(city: string): string {
  return city
    .split(/[- ]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('-');
}

// Rive Nord - Liste des villes principales (noms normalisés pour affichage)
export const RIVE_NORD = [
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
].sort();

// Rive Sud - Liste des villes principales
export const RIVE_SUD = [
  'Longueuil',
  'Brossard',
  'Candiac',
  'Saint-Constant',
  'Châteauguay',
  'Mercier',
  'Vaudreuil-Dorion',
  'Sorel-Tracy',
  'Saint-Rémi',
].sort();

// Laval - Liste des districts
export const LAVAL_DISTRICTS = [
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
].sort();

// Montréal - Liste des districts principaux
export const MONTREAL_DISTRICTS = [
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
].sort();

