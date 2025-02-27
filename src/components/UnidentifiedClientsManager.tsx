import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';

interface UnidentifiedClient {
  id: string;
  name: string;
  address: string;
  reason: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface APIResponse {
  success: boolean;
  data?: {
    message: string;
  };
  error?: string;
}

// Composant pour la carte client
const ClientCard = ({ 
  client, 
  isSelected, 
  onClick 
}: { 
  client: UnidentifiedClient; 
  isSelected: boolean; 
  onClick: () => void;
}) => (
  <div
    className={`p-4 mb-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50 
      ${isSelected ? 'bg-blue-50 border-2 border-blue-300' : 'bg-white border border-gray-200'}`}
    onClick={onClick}
  >
    <div className="font-medium text-gray-900">{client.name}</div>
    <div className="text-sm text-gray-600 mt-1">{client.address}</div>
    <div className="text-xs text-red-500 mt-1">{client.reason}</div>
  </div>
);

// Composant pour le formulaire d'édition
const EditForm = ({
  client,
  city,
  setCity,
  neighborhood,
  setNeighborhood,
  onSearch,
  onSave,
  feedback,
  loading
}: {
  client: UnidentifiedClient;
  city: string;
  setCity: (city: string) => void;
  neighborhood: string;
  setNeighborhood: (neighborhood: string) => void;
  onSearch: () => void;
  onSave: () => void;
  feedback: { type: 'success' | 'error'; message: string; } | null;
  loading: boolean;
}) => (
  <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
    <h3 className="font-medium text-lg mb-4 text-gray-900">Édition manuelle</h3>
    <div className="space-y-4">
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium text-gray-700">Client sélectionné:</div>
        <div className="text-sm mt-1">{client.name}</div>
        <div className="text-sm text-gray-600">{client.address}</div>
      </div>

      <button
        onClick={onSearch}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg
          hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Search size={16} />
        Rechercher l'adresse
      </button>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 
            focus:border-blue-500 outline-none transition-all"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Quartier</label>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 
            focus:border-blue-500 outline-none transition-all"
          disabled={loading}
        />
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg ${
          feedback.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.message}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={!city || !neighborhood || loading}
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
          disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {loading ? 'Sauvegarde en cours...' : 'Sauvegarder'}
      </button>
    </div>
  </div>
);

const UnidentifiedClientsManager = () => {
  const [clients, setClients] = useState<UnidentifiedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<UnidentifiedClient | null>(null);
  const [manualCity, setManualCity] = useState('');
  const [manualNeighborhood, setManualNeighborhood] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    fetchUnidentifiedClients();
  }, []);

  const fetchUnidentifiedClients = async () => {
    try {
      setLoading(true);
      const response = await axios.get('https://dashboard.piscineaquarius.com/api/district-analysis');
      setClients(response.data.unidentifiedClients);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchAddress = async () => {
    if (!selectedClient) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: {
          q: selectedClient.address,
          format: 'json',
          limit: 1
        }
      });
      
      if (response.data && response.data[0]) {
        const result = response.data[0];
        setManualCity(result.address.city || result.address.town || '');
        setManualNeighborhood(result.address.suburb || result.address.neighbourhood || '');
      }
    } catch (error) {
      console.error('Erreur de recherche:', error);
      setFeedback({
        type: 'error',
        message: 'Erreur lors de la recherche de l\'adresse'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveManualLocation = async () => {
    if (!selectedClient || !manualCity || !manualNeighborhood) return;

    try {
      setLoading(true);
      const response = await axios.post<APIResponse>('/api/manual-district-assignment', {
        clientId: selectedClient.id,
        city: manualCity,
        neighborhood: manualNeighborhood
      });

      if (response.data.success) {
        setFeedback({
          type: 'success',
          message: response.data.data?.message || 'Client mis à jour avec succès'
        });
        await fetchUnidentifiedClients();
        setSelectedClient(null);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur lors de la mise à jour'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !clients.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Clients Non Identifiés ({clients.length})
          </h2>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 p-6">
          {/* Liste des clients */}
          <div className="border border-gray-200 rounded-lg p-4 h-[600px] overflow-auto bg-gray-50">
            {clients.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                isSelected={selectedClient?.id === client.id}
                onClick={() => {
                  setSelectedClient(client);
                  setManualCity('');
                  setManualNeighborhood('');
                  setFeedback(null);
                }}
              />
            ))}
          </div>

          {/* Formulaire d'édition */}
          {selectedClient ? (
            <EditForm
              client={selectedClient}
              city={manualCity}
              setCity={setManualCity}
              neighborhood={manualNeighborhood}
              setNeighborhood={setManualNeighborhood}
              onSearch={searchAddress}
              onSave={saveManualLocation}
              feedback={feedback}
              loading={loading}
            />
          ) : (
            <div className="flex items-center justify-center h-full border border-gray-200 rounded-lg">
              <div className="text-gray-500">
                Sélectionnez un client pour l'éditer
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnidentifiedClientsManager;