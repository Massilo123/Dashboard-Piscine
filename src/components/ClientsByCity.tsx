import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Users, ChevronDown, ChevronRight, Phone, Home, Search, X } from 'lucide-react';
import API_CONFIG from '../config/api';

interface Client {
  _id: string;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
  addressLine1: string;
  coordinates?: {
    lng: number;
    lat: number;
  };
  city: string;
  district?: string;
}

interface CityData {
  clients: Client[];
  districts?: Record<string, Client[]>;
}

interface ClientsByCityData {
  [city: string]: CityData;
}

const ClientsByCity: React.FC = () => {
  const [clientsData, setClientsData] = useState<ClientsByCityData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [totalClients, setTotalClients] = useState(0);
  const [progress, setProgress] = useState({ processed: 0, total: 0, percentage: 0, currentClient: '', city: '', district: '', elapsed: '0s', estimated: '0s' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const startStream = async () => {
      try {
        setLoading(true);
        setError(null);
        setClientsData({});
        setExpandedCities(new Set()); // S'assurer que tout est fermé
        setExpandedDistricts(new Set()); // S'assurer que tout est fermé
        setProgress({ processed: 0, total: 0, percentage: 0, currentClient: '', city: '', district: '', elapsed: '0s', estimated: '0s' });

        eventSource = new EventSource(`${API_CONFIG.baseUrl}/api/clients/by-city-stream`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'start':
                setTotalClients(data.total);
                setProgress(prev => ({ ...prev, total: data.total }));
                console.log('🚀 Début du traitement:', data.message);
                break;

              case 'progress':
                setProgress({
                  processed: data.processed,
                  total: data.total,
                  percentage: data.progress,
                  currentClient: data.currentClient,
                  city: data.city,
                  district: data.district,
                  elapsed: data.elapsed,
                  estimated: data.estimated
                });
                console.log(`📊 Progression: ${data.progress}% (${data.processed}/${data.total}) - ${data.currentClient} - ${data.city}${data.district ? ` - ${data.district}` : ''}`);
                break;

              case 'update':
                setClientsData(data.data);
                // Ne pas ouvrir automatiquement les villes - laisser l'utilisateur choisir
                break;

              case 'complete':
                setClientsData(data.data);
                setTotalClients(data.totalClients);
                setLoading(false);
                // Ne pas ouvrir automatiquement les villes - laisser l'utilisateur choisir
                console.log('✅ Traitement terminé:', data);
                eventSource?.close();
                break;

              case 'error':
                setError(data.error);
                setLoading(false);
                console.error('❌ Erreur:', data.error);
                eventSource?.close();
                break;
            }
          } catch (err) {
            console.error('Erreur parsing SSE:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.error('Erreur EventSource:', err);
          setError('Erreur de connexion au serveur');
          setLoading(false);
          eventSource?.close();
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        console.error('Erreur:', err);
        setLoading(false);
      }
    };

    startStream();

    // Nettoyer lors du démontage
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [refreshKey]);

  const fetchClientsByCityStream = () => {
    // Réinitialiser tous les états pour fermer les menus
    setExpandedCities(new Set());
    setExpandedDistricts(new Set());
    // Forcer le re-render en changeant la clé
    setRefreshKey(prev => prev + 1);
  };

  const fetchClientsByCity = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/by-city`);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des clients');
      }
      
      const result = await response.json();
      if (result.success) {
        setClientsData(result.data);
        setTotalClients(result.totalClients || 0);
        // Ne pas ouvrir automatiquement les villes - laisser l'utilisateur choisir
      } else {
        throw new Error(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCity = (city: string) => {
    const newExpanded = new Set(expandedCities);
    if (newExpanded.has(city)) {
      newExpanded.delete(city);
    } else {
      newExpanded.add(city);
    }
    setExpandedCities(newExpanded);
  };

  const toggleDistrict = (city: string, district: string) => {
    const key = `${city}-${district}`;
    const newExpanded = new Set(expandedDistricts);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedDistricts(newExpanded);
  };

  const getClientCount = (cityData: CityData): number => {
    // Si la ville a des districts (Montréal/Laval) et qu'ils contiennent des clients
    if (cityData.districts && Object.keys(cityData.districts).length > 0) {
      const districtCount = Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      // Si les districts ont des clients, utiliser ce compte
      if (districtCount > 0) {
        return districtCount;
      }
    }
    // Sinon, compter les clients directs
    return cityData.clients?.length || 0;
  };

  // Fonction pour vérifier si un client correspond au terme de recherche
  const clientMatchesSearch = (client: Client, search: string): boolean => {
    if (!search.trim()) return true;
    
    const searchLower = search.toLowerCase().trim();
    const fullName = `${client.givenName} ${client.familyName}`.toLowerCase();
    const phoneNumber = client.phoneNumber?.toLowerCase() || '';
    const address = client.addressLine1?.toLowerCase() || '';
    
    return fullName.includes(searchLower) || 
           phoneNumber.includes(searchLower) || 
           address.includes(searchLower);
  };

  // Fonction pour filtrer les clients selon le terme de recherche
  const filterClientsData = (data: ClientsByCityData, search: string): ClientsByCityData => {
    if (!search.trim()) return data;
    
    const filtered: ClientsByCityData = {};
    
    Object.entries(data).forEach(([city, cityData]) => {
      const filteredCityData: CityData = {
        clients: [],
        districts: {}
      };
      
      // Filtrer les districts pour Montréal/Laval
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        Object.entries(cityData.districts).forEach(([district, clients]) => {
          const filteredClients = clients.filter(client => clientMatchesSearch(client, search));
          if (filteredClients.length > 0) {
            filteredCityData.districts![district] = filteredClients;
          }
        });
      }
      
      // Filtrer les clients directs pour les autres villes
      if (cityData.clients && cityData.clients.length > 0) {
        filteredCityData.clients = cityData.clients.filter(client => clientMatchesSearch(client, search));
      }
      
      // Ne garder la ville que si elle a des clients après filtrage
      const hasClients = (filteredCityData.districts && Object.keys(filteredCityData.districts).length > 0) ||
                        (filteredCityData.clients && filteredCityData.clients.length > 0);
      
      if (hasClients) {
        filtered[city] = filteredCityData;
      }
    });
    
    return filtered;
  };

  // Données filtrées selon le terme de recherche
  const filteredClientsData = useMemo(() => {
    return filterClientsData(clientsData, searchTerm);
  }, [clientsData, searchTerm]);

  // Compter le nombre total de clients filtrés
  const filteredClientCount = useMemo(() => {
    let count = 0;
    Object.values(filteredClientsData).forEach(cityData => {
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        count += Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      } else {
        count += cityData.clients?.length || 0;
      }
    });
    return count;
  }, [filteredClientsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Barre de progression */}
        <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-lg p-6 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Traitement en cours...</h2>
            <div className="text-right">
              <p className="text-indigo-300 font-semibold">{progress.percentage}%</p>
              <p className="text-gray-400 text-sm">{progress.processed} / {progress.total} clients</p>
            </div>
          </div>
          
          {/* Barre de progression */}
          <div className="w-full bg-gray-700 rounded-full h-3 mb-4 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>

          {/* Informations détaillées */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Client actuel</p>
              <p className="text-white font-medium">{progress.currentClient || 'En attente...'}</p>
            </div>
            <div>
              <p className="text-gray-400">Ville / Quartier</p>
              <p className="text-white font-medium">
                {progress.city || 'En attente...'}
                {progress.district && <span className="text-purple-300"> - {progress.district}</span>}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Temps</p>
              <p className="text-white font-medium">
                Écoulé: {progress.elapsed} | Restant: ~{progress.estimated}
              </p>
            </div>
          </div>
        </div>

        {/* Affichage des données déjà reçues */}
        {Object.keys(clientsData).length > 0 && (
          <div className="space-y-4">
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4">
              <p className="text-yellow-300 text-sm">
                ⚡ {Object.keys(clientsData).length} ville{Object.keys(clientsData).length > 1 ? 's' : ''} déjà chargée{Object.keys(clientsData).length > 1 ? 's' : ''} - Les données s'affichent au fur et à mesure
              </p>
            </div>
            
            {/* Afficher les villes déjà reçues */}
            {Object.entries(filterClientsData(clientsData, searchTerm))
              .sort(([cityA, cityDataA], [cityB, cityDataB]) => {
                const aLower = cityA.toLowerCase();
                const bLower = cityB.toLowerCase();
                const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
                const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
                
                if (isAMontrealOrLaval && isBMontrealOrLaval) {
                  if (aLower === 'montréal') return -1;
                  if (bLower === 'montréal') return 1;
                  const countA = getClientCount(cityDataA);
                  const countB = getClientCount(cityDataB);
                  return countB - countA;
                }
                if (isAMontrealOrLaval) return -1;
                if (isBMontrealOrLaval) return 1;
                const countA = getClientCount(cityDataA);
                const countB = getClientCount(cityDataB);
                return countB - countA;
              })
              .map(([city, cityData]) => {
              const isExpanded = expandedCities.has(city);
              const clientCount = getClientCount(cityData);
              const hasDistricts = cityData.districts && Object.keys(cityData.districts).length > 0;
              const isMontrealOrLaval = city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval';

              return (
                <div
                  key={city}
                  className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden hover:border-indigo-500/50 transition-colors"
                >
                  <button
                    onClick={() => toggleCity(city)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-indigo-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-indigo-400" />
                      )}
                      <MapPin className="h-5 w-5 text-indigo-400" />
                      <span className="text-xl font-semibold text-white">{city}</span>
                      <span className="px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-sm">
                        {clientCount} client{clientCount > 1 ? 's' : ''}
                      </span>
                      {isMontrealOrLaval && hasDistricts && (
                        <span className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                          {Object.keys(cityData.districts!).length} quartier{Object.keys(cityData.districts!).length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-4 space-y-4">
                      {hasDistricts && isMontrealOrLaval ? (
                        <div className="space-y-3">
                          {Object.entries(cityData.districts!)
                            .sort(([, clientsA], [, clientsB]) => clientsB.length - clientsA.length)
                            .map(([district, clients]) => {
                            const districtKey = `${city}-${district}`;
                            const isDistrictExpanded = expandedDistricts.has(districtKey);

                            return (
                              <div
                                key={district}
                                className="bg-gray-900/50 rounded-lg border border-gray-700/30 overflow-hidden"
                              >
                                <button
                                  onClick={() => toggleDistrict(city, district)}
                                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {isDistrictExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-purple-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-purple-400" />
                                    )}
                                    <Home className="h-4 w-4 text-purple-400" />
                                    <span className="font-medium text-gray-200 capitalize">{district}</span>
                                    <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs">
                                      {clients.length} client{clients.length > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </button>

                                {isDistrictExpanded && (
                                  <div className="px-4 pb-3 space-y-2">
                                    {clients.map((client) => (
                                      <div
                                        key={client._id}
                                        className="bg-gray-800/30 rounded p-3 border border-gray-700/20 hover:border-indigo-500/30 transition-colors"
                                      >
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <h4 className="font-medium text-white mb-1">
                                              {client.givenName} {client.familyName}
                                            </h4>
                                            <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {client.addressLine1}
                                            </p>
                                            {client.phoneNumber && (
                                              <p className="text-sm text-gray-400 flex items-center gap-1">
                                                <Phone className="h-3 w-3" />
                                                {client.phoneNumber}
                                              </p>
                                            )}
                                          </div>
                                          {client.coordinates && (
                                            <a
                                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="ml-4 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-xs transition-colors"
                                            >
                                              Voir carte
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cityData.clients.map((client) => (
                            <div
                              key={client._id}
                              className="bg-gray-800/30 rounded p-3 border border-gray-700/20 hover:border-indigo-500/30 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-medium text-white mb-1">
                                    {client.givenName} {client.familyName}
                                  </h4>
                                  <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {client.addressLine1}
                                  </p>
                                  {client.phoneNumber && (
                                    <p className="text-sm text-gray-400 flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {client.phoneNumber}
                                    </p>
                                  )}
                                </div>
                                {client.coordinates && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-4 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-xs transition-colors"
                                  >
                                    Voir carte
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Spinner si aucune donnée encore */}
        {Object.keys(clientsData).length === 0 && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
              <p className="text-gray-400">Chargement des clients...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchClientsByCityStream}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-lg p-6 border border-indigo-500/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
              <Users className="h-8 w-8 text-indigo-400" />
              Clients par Ville
            </h1>
            <p className="text-gray-400">
              {searchTerm ? (
                <>
                  {filteredClientCount} client{filteredClientCount > 1 ? 's' : ''} trouvé{filteredClientCount > 1 ? 's' : ''} sur {totalClients} total
                </>
              ) : (
                <>
                  {totalClients} client{totalClients > 1 ? 's' : ''} réparti{totalClients > 1 ? 's' : ''} sur {Object.keys(clientsData).length} ville{Object.keys(clientsData).length > 1 ? 's' : ''}
                </>
              )}
            </p>
          </div>
          <button
            onClick={fetchClientsByCityStream}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors flex items-center gap-2"
          >
            <MapPin className="h-4 w-4" />
            Actualiser
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou adresse..."
            className="w-full pl-10 pr-10 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Liste des villes */}
      <div className="space-y-4">
        {Object.entries(filteredClientsData)
          .sort(([cityA, cityDataA], [cityB, cityDataB]) => {
            const aLower = cityA.toLowerCase();
            const bLower = cityB.toLowerCase();
            const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
            const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
            
            // Si les deux sont Montréal/Laval, trier entre eux (Montréal puis Laval)
            if (isAMontrealOrLaval && isBMontrealOrLaval) {
              if (aLower === 'montréal') return -1;
              if (bLower === 'montréal') return 1;
              // Entre Montréal et Laval, trier par nombre de clients décroissant
              const countA = getClientCount(cityDataA);
              const countB = getClientCount(cityDataB);
              return countB - countA;
            }
            
            // Si seulement A est Montréal/Laval, A vient en premier
            if (isAMontrealOrLaval) return -1;
            
            // Si seulement B est Montréal/Laval, B vient en premier
            if (isBMontrealOrLaval) return 1;
            
            // Sinon, trier par nombre de clients décroissant
            const countA = getClientCount(cityDataA);
            const countB = getClientCount(cityDataB);
            return countB - countA;
          })
          .map(([city, cityData]) => {
          const isExpanded = expandedCities.has(city);
          const clientCount = getClientCount(cityData);
          const hasDistricts = cityData.districts && Object.keys(cityData.districts).length > 0;
          const isMontrealOrLaval = city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval';

          return (
            <div
              key={city}
              className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden hover:border-indigo-500/50 transition-colors"
            >
              {/* En-tête de la ville */}
              <button
                onClick={() => toggleCity(city)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-indigo-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-indigo-400" />
                  )}
                  <MapPin className="h-5 w-5 text-indigo-400" />
                  <span className="text-xl font-semibold text-white">{city}</span>
                  <span className="px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-sm">
                    {clientCount} client{clientCount > 1 ? 's' : ''}
                  </span>
                  {isMontrealOrLaval && hasDistricts && (
                    <span className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                      {Object.keys(cityData.districts!).length} quartier{Object.keys(cityData.districts!).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>

              {/* Contenu de la ville */}
              {isExpanded && (
                <div className="px-6 pb-4 space-y-4">
                  {hasDistricts && isMontrealOrLaval ? (
                    // Affichage par quartier pour Montréal et Laval
                    <div className="space-y-3">
                      {Object.entries(cityData.districts!)
                        .sort(([, clientsA], [, clientsB]) => clientsB.length - clientsA.length)
                        .map(([district, clients]) => {
                        const districtKey = `${city}-${district}`;
                        const isDistrictExpanded = expandedDistricts.has(districtKey);

                        return (
                          <div
                            key={district}
                            className="bg-gray-900/50 rounded-lg border border-gray-700/30 overflow-hidden"
                          >
                            <button
                              onClick={() => toggleDistrict(city, district)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {isDistrictExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-purple-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-purple-400" />
                                )}
                                <Home className="h-4 w-4 text-purple-400" />
                                <span className="font-medium text-gray-200 capitalize">{district}</span>
                                <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs">
                                  {clients.length} client{clients.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </button>

                            {isDistrictExpanded && (
                              <div className="px-4 pb-3 space-y-2">
                                {clients.map((client) => (
                                  <div
                                    key={client._id}
                                    className="bg-gray-800/30 rounded p-3 border border-gray-700/20 hover:border-indigo-500/30 transition-colors"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <h4 className="font-medium text-white mb-1">
                                          {client.givenName} {client.familyName}
                                        </h4>
                                        <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                          <MapPin className="h-3 w-3" />
                                          {client.addressLine1}
                                        </p>
                                        {client.phoneNumber && (
                                          <p className="text-sm text-gray-400 flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            {client.phoneNumber}
                                          </p>
                                        )}
                                      </div>
                                      {client.coordinates && (
                                        <a
                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-4 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-xs transition-colors"
                                        >
                                          Voir carte
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Affichage simple pour les autres villes
                    <div className="space-y-2">
                      {cityData.clients.map((client) => (
                        <div
                          key={client._id}
                          className="bg-gray-800/30 rounded p-3 border border-gray-700/20 hover:border-indigo-500/30 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-white mb-1">
                                {client.givenName} {client.familyName}
                              </h4>
                              <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {client.addressLine1}
                              </p>
                              {client.phoneNumber && (
                                <p className="text-sm text-gray-400 flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {client.phoneNumber}
                                </p>
                              )}
                            </div>
                            {client.coordinates && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-4 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-xs transition-colors"
                              >
                                Voir carte
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(clientsData).length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Aucun client trouvé</p>
        </div>
      )}
    </div>
  );
};

export default ClientsByCity;

