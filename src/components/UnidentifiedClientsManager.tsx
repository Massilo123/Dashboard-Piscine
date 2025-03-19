import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, User, MapPin, CheckCircle, AlertCircle, Save } from 'lucide-react';

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
    className={`p-4 mb-3 rounded-lg cursor-pointer transition-all hover:bg-gray-700/70 backdrop-blur-sm border border-indigo-900/30 shadow-md
      ${isSelected ? 'bg-indigo-900/60 border-indigo-600/70 shadow-indigo-900/20' : 'bg-gray-800/60'}`}
    onClick={onClick}
  >
    <div className="font-medium text-white flex items-center gap-2">
      <User className="h-4 w-4 text-indigo-400" />
      {client.name}
    </div>
    <div className="text-sm text-gray-300 mt-1 flex items-center gap-2">
      <MapPin className="h-4 w-4 text-indigo-400 flex-shrink-0" />
      <span className="truncate">{client.address}</span>
    </div>
    <div className="text-xs text-red-400 mt-1 flex items-center gap-2">
      <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
      {client.reason}
    </div>
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
  <div className="border border-indigo-900/30 rounded-xl p-6 bg-gray-800/60 shadow-xl backdrop-blur-sm">
    <h3 className="font-medium text-lg mb-4 text-white flex items-center gap-2">
      <User className="h-5 w-5 text-indigo-400" />
      Édition manuelle
    </h3>
    <div className="space-y-4">
      <div className="p-4 bg-gray-700/70 rounded-lg border border-indigo-900/30 backdrop-blur-sm shadow-md">
        <div className="text-sm font-medium text-gray-300 mb-1">Client sélectionné:</div>
        <div className="text-sm mt-1 text-white font-semibold">{client.name}</div>
        <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
          {client.address}
        </div>
      </div>

      <button
        onClick={onSearch}
        disabled={loading}
        className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-gray-700/70 border border-indigo-900/30 rounded-lg
          hover:bg-gray-600/90 transition-colors disabled:opacity-50 text-gray-200 w-full backdrop-blur-sm shadow-md"
      >
        <Search size={16} />
        Rechercher l'adresse automatiquement
      </button>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Ville</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full p-2.5 border border-indigo-900/30 rounded-lg focus:ring-2 focus:ring-indigo-500 
            focus:border-indigo-500 outline-none transition-all bg-gray-700/60 text-white backdrop-blur-sm shadow-md"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Quartier</label>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="w-full p-2.5 border border-indigo-900/30 rounded-lg focus:ring-2 focus:ring-indigo-500 
            focus:border-indigo-500 outline-none transition-all bg-gray-700/60 text-white backdrop-blur-sm shadow-md"
          disabled={loading}
        />
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${
          feedback.type === 'success' 
            ? 'bg-green-900/40 text-green-300 border border-green-800/50 backdrop-blur-sm' 
            : 'bg-red-900/40 text-red-300 border border-red-800/50 backdrop-blur-sm'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-400" />
          )}
          {feedback.message}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={!city || !neighborhood || loading}
        className="w-full py-2.5 bg-indigo-600/80 text-white rounded-lg hover:bg-indigo-700/90 
          disabled:bg-gray-600/70 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors font-medium backdrop-blur-sm shadow-md flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sauvegarde en cours...
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            Sauvegarder
          </>
        )}
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
      const response = await axios.get('https://api.piscineaquarius.com/api/district-analysis');
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
      <div className="flex items-center justify-center min-h-screen text-gray-300">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          <div className="text-lg">Chargement des données...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border border-indigo-900/30">
        <div className="p-6 border-b border-indigo-900/30 bg-indigo-900/20 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <User className="h-6 w-6 text-indigo-400" />
            Clients Non Identifiés 
            <span className="ml-2 bg-indigo-700/70 text-white px-2.5 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
              {clients.length}
            </span>
          </h2>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 p-6">
          {/* Liste des clients */}
          <div className="border border-indigo-900/30 rounded-xl p-4 h-[600px] overflow-auto bg-gray-800/40 backdrop-blur-sm shadow-lg">
            {clients.length > 0 ? (
              clients.map(client => (
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
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-70" />
                  <p>Tous les clients ont été identifiés</p>
                </div>
              </div>
            )}
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
            <div className="flex items-center justify-center h-full border border-indigo-900/30 rounded-xl bg-gray-800/40 backdrop-blur-sm shadow-lg">
              <div className="text-center text-gray-400 p-6">
                <User className="h-12 w-12 text-indigo-400/60 mx-auto mb-3" />
                <p>Sélectionnez un client pour l'éditer</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnidentifiedClientsManager;