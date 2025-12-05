// Configuration centralisée de l'URL de l'API
// Production par défaut : https://api.piscineaquarius.com
// Pour tester en local, créez un fichier .env.local avec : VITE_API_URL=http://localhost:3000

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.piscineaquarius.com';

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  
  // Endpoints complets
  endpoints: {
    optimizeBookings: `${API_BASE_URL}/api/optimize/bookings`,
    clientRdv: `${API_BASE_URL}/api/client-rdv`,
    mapboxClientsNearby: `${API_BASE_URL}/api/mapbox/clients-nearby`,
    mapboxClientsNearbyCoordinates: `${API_BASE_URL}/api/mapbox/clients-nearby-coordinates`,
    clients: `${API_BASE_URL}/api/clienti`,
  }
};

export default API_CONFIG;

