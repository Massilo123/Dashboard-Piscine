import { MapPin, Navigation, User, Calendar, Clock, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Filter, X, Search } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import API_CONFIG from '../config/api';
import { filterLocations } from '../config/sectorsFilter';

const baseClient = mbxClient({ accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' });
const geocodingService = mbxGeocoding(baseClient);

// Point de départ fixe pour l'affichage
const STARTING_POINT = "1829 rue capitol";

interface Suggestion {
  place_name: string;
  text: string;
}

interface SearchClient {
  id: string;
  name: string;
  address: string;
  phoneNumber: string;
  coordinates: { lng: number; lat: number } | null;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface Waypoint {
  address: string;
  coordinates?: [number, number];
  city?: string;
  district?: string;
}

interface OptimizedRoute {
  totalDistance: number;
  totalDuration: number;
  waypoints: Waypoint[];
}

interface ClientData {
  client: {
    id: string
    name: string
    address: string
    phoneNumber?: string
    city?: string
    district?: string
  }
  booking: {
    id: string
    date: string
    time: string
    dateISO: string
    bookingDate: string
  }
  distance: {
    value: number | null
    unit: string
  }
  duration: {
    value: number | null
    unit: string
  }
  route: unknown
  statistics: {
    clientsOnSameDay: number
    remainingDays: number
    dailyStats: {
      totalDistance: number
      totalDuration: number
      clientCount: number
      optimizedRoute: OptimizedRoute | null
    }
  }
  navigation: {
    hasNext: boolean
    processedDates: string[]
    allDates: string[]
    dateRange: DateRange | null
  }
}

const OptimisationRdvClient = () => {
  const [address, setAddress] = useState<string>('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isAddressSelected, setIsAddressSelected] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [error, setError] = useState<string>('')
  const [visitedClients, setVisitedClients] = useState<ClientData[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [fetchingNew, setFetchingNew] = useState<boolean>(false)
  const [remainingDays, setRemainingDays] = useState<number>(0)
  const [showDateFilter, setShowDateFilter] = useState<boolean>(false)
  const [isStatsExpanded, setIsStatsExpanded] = useState<boolean>(false)
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0]
  })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  
  // États pour la recherche de clients
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('')
  const [clientSearchResults, setClientSearchResults] = useState<SearchClient[]>([])
  const [showClientSearchResults, setShowClientSearchResults] = useState<boolean>(false)
  const [searchingClients, setSearchingClients] = useState<boolean>(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)

  // Gestion du clic en dehors du composant
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSuggestions([]);
        setLocationSuggestions([]);
      }
      
      if (filterRef.current && !filterRef.current.contains(event.target as Node) && showDateFilter) {
        setShowDateFilter(false);
      }
      
      if (clientSearchRef.current && !clientSearchRef.current.contains(event.target as Node)) {
        setShowClientSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDateFilter]);

  // Mise à jour du clientData lorsque l'index change
  useEffect(() => {
    if (visitedClients.length > 0 && currentIndex >= 0 && currentIndex < visitedClients.length) {
      setClientData(visitedClients[currentIndex]);
      
      // Calcul correct des jours restants
      let daysLeft = 0;
      
      // Si nous ne sommes pas au dernier client, il y a au moins les jours des clients suivants
      if (currentIndex < visitedClients.length - 1) {
        // Compter les jours uniques restants parmi les clients déjà visités
        const uniqueDatesAfterCurrent = new Set();
        for (let i = currentIndex + 1; i < visitedClients.length; i++) {
          uniqueDatesAfterCurrent.add(visitedClients[i].booking.bookingDate);
        }
        daysLeft = uniqueDatesAfterCurrent.size;
      }
      
      // Si nous sommes au dernier client et qu'il y a d'autres clients non encore chargés
      if (currentIndex === visitedClients.length - 1 && visitedClients[currentIndex].navigation.hasNext) {
        // Ajouter 1 pour représenter les clients non encore chargés
        daysLeft += 1;
      }
      
      setRemainingDays(daysLeft);
    }
  }, [currentIndex, visitedClients]);


  // Gestion des suggestions d'adresses et secteurs
  useEffect(() => {
    // Rechercher les secteurs/villes qui correspondent
    if (address.length >= 1 && !isAddressSelected) {
      const locations = filterLocations(address);
      setLocationSuggestions(locations);
    } else {
      setLocationSuggestions([]);
    }

    const getSuggestions = async (searchAddress: string) => {
      if (searchAddress.length < 3 || isAddressSelected) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await geocodingService.forwardGeocode({
          query: searchAddress,
          countries: ['ca'],
          limit: 5,
          types: ['address']
        }).send();

        setSuggestions(response.body.features.map(feature => ({
          place_name: feature.place_name,
          text: feature.text
        })));
      } catch (err) {
        console.error('Erreur de suggestions:', err);
      }
    };

    const timeoutId = setTimeout(() => getSuggestions(address), 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [address, isAddressSelected]);

  // Recherche de clients dans la base de données
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length < 2) {
        setClientSearchResults([]);
        setShowClientSearchResults(false);
        return;
      }

      setSearchingClients(true);
      try {
        const response = await fetch(`${API_CONFIG.endpoints.searchClients}?query=${encodeURIComponent(clientSearchQuery)}`);
        const data = await response.json();

        if (data.success) {
          setClientSearchResults(data.data);
          setShowClientSearchResults(data.data.length > 0);
        } else {
          setClientSearchResults([]);
          setShowClientSearchResults(false);
        }
      } catch (err) {
        console.error('Erreur lors de la recherche de clients:', err);
        setClientSearchResults([]);
        setShowClientSearchResults(false);
      } finally {
        setSearchingClients(false);
      }
    };

    const timeoutId = setTimeout(searchClients, 300);
    return () => clearTimeout(timeoutId);
  }, [clientSearchQuery]);

  // Fonction pour sélectionner un client et insérer son adresse
  const handleClientSelect = (client: SearchClient) => {
    setAddress(client.address);
    setIsAddressSelected(true);
    setClientSearchQuery('');
    setClientSearchResults([]);
    setShowClientSearchResults(false);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value)
    setError('')
    setIsAddressSelected(false)
  }

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateRange(prev => ({
      ...prev,
      [name]: value
    }));
  }

  const toggleDateFilter = () => {
    setShowDateFilter(!showDateFilter);
  }

  const selectSuggestion = (suggestion: Suggestion) => {
    setAddress(suggestion.place_name);
    setSuggestions([]);
    setIsAddressSelected(true);
  };

  // Fonction pour gérer la sélection d'une ville/district depuis les suggestions
  const handleLocationSelect = (location: string) => {
    setAddress(location);
    setIsAddressSelected(false);
    setLocationSuggestions([]);
  };

  const fetchClient = async (excludeDates: string[] = []) => {
    if (!address) {
      setError('Veuillez entrer une adresse')
      return null;
    }

    if (dateRange.startDate > dateRange.endDate) {
      setError('La date de début doit être antérieure à la date de fin');
      return null;
    }

    setLoading(true)
    setError('')
    setFetchingNew(true);

    try {
      const response = await fetch(API_CONFIG.endpoints.clientRdv, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          address,
          excludeDates,
          specificDate: null,
          dateRange: {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate
          }
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Une erreur est survenue')
      }

      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      return null;
    } finally {
      setLoading(false)
      setFetchingNew(false);
    }
  }

  const findFirstClient = async () => {
    const newClient = await fetchClient([]);
    
    if (newClient) {
      setVisitedClients([newClient]);
      setCurrentIndex(0);
      setClientData(newClient);
      setRemainingDays(newClient.navigation.hasNext ? 1 : 0);
    }
  }

  const findNextClient = async () => {
    // Si nous sommes déjà sur le dernier client connu et qu'il y a plus de clients disponibles
    if (currentIndex === visitedClients.length - 1 && clientData?.navigation.hasNext) {
      // Récupérer toutes les dates déjà visitées
      const alreadyVisitedDates = visitedClients.map(client => client.booking.bookingDate);
      
      // Chercher un nouveau client
      const newClient = await fetchClient(alreadyVisitedDates);
      
      if (newClient) {
        // Ajouter le nouveau client à notre liste
        const updatedClients = [...visitedClients, newClient];
        setVisitedClients(updatedClients);
        
        // Aller directement au nouveau client
        setCurrentIndex(updatedClients.length - 1);
        
        // Mettre à jour les jours restants
        setRemainingDays(newClient.navigation.hasNext ? 1 : 0);
      }
    } else if (currentIndex < visitedClients.length - 1) {
      // Nous avons déjà ce client en mémoire, avancer simplement l'index
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      
      // Recalculer les jours restants
      const uniqueDatesAfterCurrent = new Set();
      for (let i = newIndex + 1; i < visitedClients.length; i++) {
        uniqueDatesAfterCurrent.add(visitedClients[i].booking.bookingDate);
      }
      
      // Si nous sommes sur le dernier client connu et qu'il y a d'autres clients non chargés
      let daysLeft = uniqueDatesAfterCurrent.size;
      if (newIndex === visitedClients.length - 1 && visitedClients[newIndex].navigation.hasNext) {
        daysLeft += 1;
      }
      
      setRemainingDays(daysLeft);
    }
  }

  const handlePreviousClient = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      
      // Recalculer les jours restants
      const uniqueDatesAfterCurrent = new Set();
      for (let i = newIndex + 1; i < visitedClients.length; i++) {
        uniqueDatesAfterCurrent.add(visitedClients[i].booking.bookingDate);
      }
      
      // Si le dernier client a hasNext, ajouter 1 pour les clients non chargés
      let daysLeft = uniqueDatesAfterCurrent.size;
      if (visitedClients[visitedClients.length - 1].navigation.hasNext) {
        daysLeft += 1;
      }
      
      setRemainingDays(daysLeft);
    }
  }

  const handleNextClient = () => {
    if (fetchingNew) return; // Éviter les clics multiples pendant le chargement
    
    if (currentIndex < visitedClients.length - 1) {
      // Nous avons déjà ce client en mémoire
      findNextClient();
    } else if (clientData?.navigation.hasNext) {
      // Besoin de chercher un nouveau client
      findNextClient();
    }
  }

  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < visitedClients.length - 1 || (clientData?.navigation.hasNext || false);

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 space-y-4 py-6" ref={wrapperRef}>
      <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 p-4 sm:p-6 border border-indigo-500/20">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
            <h2 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
              Client le plus proche.
            </h2>
          </div>
          <button 
            onClick={toggleDateFilter}
            className="flex items-center gap-1 text-cyan-200 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm"
          >
            <Filter className="h-4 w-4 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
            <span>Dates</span>
          </button>
        </div>

        {/* Filtre par date - Visible uniquement lorsque activé */}
        {showDateFilter && (
          <div 
            ref={filterRef}
            className="mb-4 p-3 border border-cyan-500/30 rounded-lg bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm relative shadow-lg shadow-cyan-500/10"
          >
            <div className="absolute top-2 right-2">
              <button
                onClick={() => setShowDateFilter(false)}
                className="text-gray-400 hover:text-rose-400 transition-colors hover:drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex flex-col">
                <label htmlFor="startDate" className="text-xs text-cyan-300 mb-1 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Date début</label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={dateRange.startDate}
                  onChange={handleDateRangeChange}
                  className="border bg-gray-900/60 text-white border-cyan-500/30 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 transition-all duration-200"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="endDate" className="text-xs text-cyan-300 mb-1 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Date fin</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={dateRange.endDate}
                  onChange={handleDateRangeChange}
                  className="border bg-gray-900/60 text-white border-cyan-500/30 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 transition-all duration-200"
                />
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          {/* Recherche de clients */}
          <div className="relative" ref={clientSearchRef}>
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-cyan-400" />
              <label className="text-sm text-gray-300">
                Rechercher un client
              </label>
            </div>
            <input
              type="text"
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
              placeholder="Nom, adresse ou numéro..."
              className="w-full border bg-gray-900/60 text-white border-cyan-500/30 rounded-lg p-2.5 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 placeholder-gray-500 transition-all duration-200"
            />
            {showClientSearchResults && clientSearchResults.length > 0 && (
              <div className="absolute z-20 w-full bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm mt-1 border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-60 overflow-y-auto">
                {clientSearchResults.map((client) => (
                  <div
                    key={client.id}
                    className="p-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 cursor-pointer text-gray-200 transition-all duration-200 border-b border-indigo-500/20 last:border-b-0"
                    onClick={() => handleClientSelect(client)}
                  >
                    <div className="font-medium text-white">
                      {client.name}
                    </div>
                    {client.address && (
                      <div className="text-sm text-cyan-300 mt-1">
                        {client.address}
                      </div>
                    )}
                    {client.phoneNumber && (
                      <div className="text-xs text-gray-400 mt-1">
                        {client.phoneNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {searchingClients && (
              <div className="absolute right-3 top-9 text-cyan-400">
                <div className="animate-spin h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>

          {/* Champ d'adresse */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-cyan-400" />
                <label className="text-sm text-gray-300">Adresse</label>
              </div>
              <input
                type="text"
                value={address}
                onChange={handleAddressChange}
                placeholder="Entrez une adresse ou un secteur"
                className="w-full border bg-gray-900/60 text-white border-indigo-500/30 rounded-lg p-2.5 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 placeholder-gray-500 transition-all duration-200"
              />
              {(locationSuggestions.length > 0 || suggestions.length > 0) && (
                <div className="absolute z-10 w-full bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm mt-1 border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-60 overflow-y-auto">
                  {/* Suggestions de secteurs/villes */}
                  {locationSuggestions.length > 0 && (
                    <>
                      {locationSuggestions.map((location, index) => (
                        <div
                          key={`location-${index}`}
                          className="p-3 hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-indigo-500/10 cursor-pointer text-gray-200 transition-all duration-200 border-b border-indigo-500/20"
                          onClick={() => handleLocationSelect(location)}
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-purple-400" />
                            <div>
                              <div className="font-medium text-white">
                                {location}
                              </div>
                              <div className="text-xs text-purple-300 mt-0.5">
                                Secteur/Ville
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {suggestions.length > 0 && (
                        <div className="border-t border-indigo-500/30 my-1"></div>
                      )}
                    </>
                  )}
                  {/* Suggestions d'adresses Mapbox */}
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={`address-${index}`}
                      className="p-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 cursor-pointer text-gray-200 transition-all duration-200 border-b border-indigo-500/20 last:border-b-0"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      {suggestion.place_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end">
              <button
                onClick={findFirstClient}
                disabled={loading || !address.trim()}
                className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 px-6 py-2.5 rounded-lg disabled:from-gray-600/20 disabled:to-gray-600/20 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm font-medium"
              >
                {loading ? 'Recherche...' : 'Trouver'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg border border-rose-500/50 shadow-lg shadow-rose-500/20">
              {error}
            </div>
          )}

          {clientData && (
            <div className="mt-6 space-y-4">
              {/* Section principale : Informations client */}
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 border border-indigo-500/20 overflow-hidden">
                {/* En-tête avec DATE mise en évidence */}
                <div className="bg-gradient-to-r from-cyan-500/40 via-indigo-500/40 to-purple-500/40 backdrop-blur-sm p-5 border-b border-cyan-400/50">
                  <div className="flex items-center justify-center mb-4">
                    <Calendar className="h-8 w-8 text-white mr-3 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
                    <div className="text-center">
                      <div className="text-xs text-white/80 mb-1">Rendez-vous le</div>
                      <h3 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                        {clientData.booking.date}
                      </h3>
                    </div>
                  </div>
                  
                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handlePreviousClient}
                      disabled={loading || !canGoLeft}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                        canGoLeft && !loading
                          ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30' 
                          : 'bg-gray-700/30 text-gray-500 cursor-not-allowed border border-gray-600/30'
                      }`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    
                    <span className="text-sm text-white px-3 py-1 bg-white/20 rounded-lg border border-white/30 font-medium">
                      {currentIndex + 1}/{visitedClients.length}
                      {clientData.navigation.hasNext && currentIndex === visitedClients.length - 1 ? "+" : ""}
                    </span>
                    
                    <button
                      onClick={handleNextClient}
                      disabled={loading || !canGoRight}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                        canGoRight && !loading
                          ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30' 
                          : 'bg-gray-700/30 text-gray-500 cursor-not-allowed border border-gray-600/30'
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Informations client */}
                <div className="p-4 space-y-3">
                  {/* Nom du client et distance/durée */}
                  <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-cyan-400" />
                      <span className="text-lg font-semibold text-white">
                        {clientData.client.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-cyan-400" />
                        <span className="font-bold text-cyan-300">{clientData.duration.value} min</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{clientData.distance.value} km</div>
                    </div>
                  </div>
                  
                  {/* Adresse et téléphone */}
                  <div className="space-y-2">
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientData.client.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-cyan-400 hover:text-cyan-300 transition-colors group"
                    >
                      <MapPin className="h-5 w-5 mt-0.5 text-cyan-400 group-hover:drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                      <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                        <span className="break-words">{clientData.client.address}</span>
                        {(clientData.client.city || clientData.client.district) && (
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                            {clientData.client.city && (
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 bg-indigo-500/30 text-indigo-200 rounded-md border border-indigo-400/50 font-medium">
                                {clientData.client.city}
                              </span>
                            )}
                            {clientData.client.district && (
                              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 bg-purple-500/30 text-purple-200 rounded-md border border-purple-400/50 font-medium">
                                {clientData.client.district}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </a>
                    
                    {clientData.client.phoneNumber && (
                      <a 
                        href={`tel:${clientData.client.phoneNumber}`}
                        className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        <span>{clientData.client.phoneNumber}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Section : Statistiques quotidiennes */}
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 border border-indigo-500/20 p-2.5">
                <button
                  onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                  className="w-full flex items-center justify-between hover:opacity-80 transition-opacity py-1"
                >
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-cyan-300">Statistiques du jour</h4>
                    {clientData.statistics.dailyStats.optimizedRoute && (
                      <span className="text-xs bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-200 px-1.5 py-0.5 rounded-full border border-emerald-500/40">
                        Optimisé
                      </span>
                    )}
                  </div>
                  {isStatsExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-cyan-400" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                  )}
                </button>
                
                {isStatsExpanded && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center p-3 bg-gradient-to-br from-gray-900/95 to-gray-800/85 rounded-lg border border-cyan-500/20">
                    <div className="text-xs text-gray-400 mb-1">Distance</div>
                    <div className="text-lg font-bold text-cyan-300">
                      {clientData.statistics.dailyStats.optimizedRoute ? 
                        `${clientData.statistics.dailyStats.optimizedRoute.totalDistance} km` : 
                        `${clientData.statistics.dailyStats.totalDistance} km`}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-gray-900/95 to-gray-800/85 rounded-lg border border-cyan-500/20">
                    <div className="text-xs text-gray-400 mb-1">Durée</div>
                    <div className="text-lg font-bold text-cyan-300">
                      {clientData.statistics.dailyStats.optimizedRoute ? 
                        `${clientData.statistics.dailyStats.optimizedRoute.totalDuration} min` : 
                        `${clientData.statistics.dailyStats.totalDuration} min`}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-gray-900/95 to-gray-800/85 rounded-lg border border-cyan-500/20">
                    <div className="text-xs text-gray-400 mb-1">Clients</div>
                    <div className="text-lg font-bold text-cyan-300">
                      {clientData.statistics.dailyStats.clientCount}
                    </div>
                  </div>
                    </div>
                    
                    {/* Info rapide */}
                    <div className="flex items-center justify-between text-sm pt-3 border-t border-indigo-500/20">
                      <span className="text-cyan-300">{clientData.statistics.clientsOnSameDay} client{clientData.statistics.clientsOnSameDay > 1 ? 's' : ''} ce jour</span>
                      <span className="text-indigo-300">
                        {remainingDays > 0 
                          ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''} restant${remainingDays > 1 ? 's' : ''}`
                          : "0 jour restant"}
                      </span>
                    </div>
                    
                    {/* Ordre de visite optimisé (si disponible) */}
                    {clientData.statistics.dailyStats.optimizedRoute && clientData.statistics.dailyStats.clientCount > 1 && (
                      <div className="mt-4 pt-4 border-t border-indigo-500/20">
                        <div className="text-xs font-medium text-cyan-300 mb-2">Ordre de visite optimisé :</div>
                        <ol className="space-y-1.5 text-xs text-gray-300">
                          <li className="flex items-start gap-2">
                            <span className="text-cyan-400 font-medium">1.</span>
                            <span>{STARTING_POINT}</span>
                          </li>
                          {clientData.statistics.dailyStats.optimizedRoute.waypoints.slice(1).map((wp, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <span className="text-cyan-400 font-medium flex-shrink-0">{index + 2}.</span>
                              <div className="flex-1 flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap">
                                <span className="text-gray-300">{wp.address}</span>
                                {(wp.city || wp.district) && (
                                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                                    {wp.city && (
                                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 bg-indigo-500/30 text-indigo-200 rounded-md border border-indigo-400/50 font-medium">
                                        {wp.city}
                                      </span>
                                    )}
                                    {wp.district && (
                                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 bg-purple-500/30 text-purple-200 rounded-md border border-purple-400/50 font-medium">
                                        {wp.district}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section : Actions */}
              {isStatsExpanded && (
                <div className="space-y-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(address)}&destination=${encodeURIComponent(clientData.client.address)}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 py-3 rounded-lg transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm font-medium"
                  >
                    <Navigation className="h-5 w-5" />
                    <span>Itinéraire vers ce client</span>
                  </a>

                  {clientData.statistics.dailyStats.optimizedRoute && clientData.statistics.dailyStats.clientCount > 1 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(STARTING_POINT)}&destination=${encodeURIComponent(STARTING_POINT)}&waypoints=${clientData.statistics.dailyStats.optimizedRoute.waypoints.slice(1).map(wp => encodeURIComponent(wp.address)).join('|')}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 text-purple-200 py-3 rounded-lg transition-all duration-200 border border-purple-400/40 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:-translate-y-0.5 backdrop-blur-sm font-medium"
                    >
                      <Navigation className="h-5 w-5" />
                      <span>Itinéraire optimisé (tous les clients)</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptimisationRdvClient