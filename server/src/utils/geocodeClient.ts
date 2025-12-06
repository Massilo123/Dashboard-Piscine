// Fonction utilitaire pour géocoder un client avec HERE API
import Client from '../models/Client';

export async function geocodeClient(clientId: string): Promise<{ success: boolean; coordinates?: { lng: number; lat: number }; error?: string }> {
  try {
    const client = await Client.findById(clientId);
    
    if (!client) {
      return { success: false, error: 'Client non trouvé' };
    }

    if (!client.addressLine1 || client.addressLine1.trim() === '') {
      return { success: false, error: 'Client sans adresse' };
    }

    // Vérifier si le client a déjà des coordonnées valides
    if (client.coordinates && 
        typeof client.coordinates === 'object' &&
        client.coordinates !== null &&
        'lng' in client.coordinates &&
        'lat' in client.coordinates &&
        client.coordinates.lng != null &&
        client.coordinates.lat != null) {
      // Le client a déjà des coordonnées, on peut les garder ou les mettre à jour
      // Pour l'instant, on les met à jour si l'adresse a changé
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
      
      await Client.updateOne(
        { _id: clientId },
        {
          $set: {
            coordinates: {
              lng: position.lng,
              lat: position.lat
            }
          }
        }
      );

      console.log(`✅ Coordonnées géocodées pour ${client.givenName} (${client.addressLine1}) -> ${position.lat}, ${position.lng}`);
      
      return { 
        success: true, 
        coordinates: { lng: position.lng, lat: position.lat } 
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

