export interface Client {
    _id?: string;
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    date_preferee: string;
}
  
  const API_URL = 'https://dashboard.piscineaquarius.com/api';
  
  export const clientApi = {
    // Récupérer tous les clients
    getClients: async (): Promise<Client[]> => {
      const response = await fetch(`${API_URL}/clienti`);
      if (!response.ok) throw new Error('Erreur lors de la récupération des clients');
      return response.json();
    },
  
    // Ajouter un nouveau client
    addClient: async (client: Omit<Client, '_id'>): Promise<Client> => {
      const response = await fetch(`${API_URL}/clienti`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(client),
      });
      if (!response.ok) throw new Error('Erreur lors de l\'ajout du client');
      return response.json();
    }
  };