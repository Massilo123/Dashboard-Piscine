import { MapPin, Navigation, User, Calendar, Clock, ChevronRight, ChevronLeft, Filter, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import API_CONFIG from '../config/api';

const baseClient = mbxClient({ accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' });
const geocodingService = mbxGeocoding(baseClient);

// Point de départ fixe pour l'affichage
const STARTING_POINT = "1829 rue capitol";

interface Suggestion {
  place_name: string;
  text: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface Waypoint {
  address: string;
  coordinates?: [number, number];
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
  route: any
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
  const [allProcessedDates, setAllProcessedDates] = useState<string[]>([])
  const [remainingDays, setRemainingDays] = useState<number>(0)
  const [showDateFilter, setShowDateFilter] = useState<boolean>(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0]
  })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Gestion du clic en dehors du composant
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
      
      if (filterRef.current && !filterRef.current.contains(event.target as Node) && showDateFilter) {
        setShowDateFilter(false);
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

  // Mise à jour des dates traitées
  useEffect(() => {
    if (clientData?.navigation?.processedDates) {
      setAllProcessedDates(clientData.navigation.processedDates);
    }
  }, [clientData]);

  // Gestion des suggestions d'adresses
  useEffect(() => {
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
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <input
                type="text"
                value={address}
                onChange={handleAddressChange}
                placeholder="Entrez une adresse"
                className="w-full border bg-gray-900/60 text-white border-indigo-500/30 rounded-lg p-2.5 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 placeholder-gray-500 transition-all duration-200"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm mt-1 border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 cursor-pointer text-gray-200 transition-all duration-200 border-b border-indigo-500/20 last:border-b-0"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      {suggestion.place_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={findFirstClient}
              disabled={loading}
              className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 px-5 py-2 rounded-lg disabled:from-gray-600/20 disabled:to-gray-600/20 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
            >
              {loading ? '...' : 'Trouver'}
            </button>
          </div>

          {error && (
            <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg border border-rose-500/50 shadow-lg shadow-rose-500/20">
              {error}
            </div>
          )}

          {clientData && (
            <div className="mt-4">
              {/* Boutons de navigation avec indicateur de position */}
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={handlePreviousClient}
                  disabled={loading || !canGoLeft}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    canGoLeft && !loading
                      ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-200 border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 backdrop-blur-sm' 
                      : 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30'
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                {/* Indicateur de position (optionnel) */}
                <span className="text-xs text-cyan-300 px-3 py-1.5 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/10 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                  {currentIndex + 1}/{visitedClients.length}
                  {clientData.navigation.hasNext && currentIndex === visitedClients.length - 1 ? "+" : ""}
                </span>
                
                <button
                  onClick={handleNextClient}
                  disabled={loading || !canGoRight}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    canGoRight && !loading
                      ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm' 
                      : 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30'
                  }`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Carte client principale */}
              <div className="border border-indigo-500/20 rounded-xl shadow-xl shadow-indigo-500/5 overflow-hidden bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm">
                {/* En-tête de la carte avec nom client & distance */}
                <div className="bg-gradient-to-r from-indigo-500/30 to-purple-500/30 backdrop-blur-sm text-white p-3 flex justify-between items-center border-b border-indigo-400/40">
                  <div className="flex items-center">
                    <User className="h-5 w-5 mr-2 text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                    <span className="font-bold text-base sm:text-lg bg-gradient-to-r from-indigo-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_4px_rgba(139,92,246,0.6)]">
                      {clientData.client.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                    <span className="font-bold text-cyan-200 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">{clientData.duration.value} min</span>
                    <span className="text-xs text-gray-300">({clientData.distance.value} km)</span>
                  </div>
                </div>
                
                {/* Corps de la carte */}
                <div className="p-3">
                  {/* Adresse */}
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientData.client.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 hover:underline block mb-3 break-words transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                  >
                    {clientData.client.address}
                  </a>
                  
                  {/* Numéro de téléphone */}
                  {clientData.client.phoneNumber && (
                    <a 
                      href={`tel:${clientData.client.phoneNumber}`}
                      className="text-cyan-400 hover:text-cyan-300 hover:underline block mb-3 flex items-center transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                      {clientData.client.phoneNumber}
                    </a>
                  )}
                  
                  {/* Date mise en évidence, sans l'heure */}
                  <div className="flex items-center mb-3 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm p-3 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                    <Calendar className="h-5 w-5 mr-2 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                    <span className="text-gray-200 font-medium text-lg drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">{clientData.booking.date}</span>
                  </div>
                  
                  {/* Statistiques condensées avec compteur de jours correct */}
                  <div className="flex justify-between text-sm text-gray-300 mb-3 p-2.5 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                    <div className="text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">{clientData.statistics.clientsOnSameDay} clients ce jour</div>
                    <div className="text-indigo-300 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">
                      {remainingDays > 0 
                        ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''} restant${remainingDays > 1 ? 's' : ''}`
                        : "0 jour restant"}
                    </div>
                  </div>
                  
                  {/* Nouvelle section: Statistiques journalières avec itinéraire optimisé */}
                  <div className="mb-3 p-3 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                    <h3 className="font-medium text-cyan-300 mb-2 text-sm flex justify-between items-center drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                      <span>Statistiques pour cette journée:</span>
                      {clientData.statistics.dailyStats.optimizedRoute && 
                        <span className="text-xs bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 backdrop-blur-sm text-emerald-200 px-2 py-1 rounded-full border border-emerald-500/40 shadow-lg shadow-emerald-500/20">Itinéraire optimisé</span>
                      }
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm p-2 rounded-lg shadow-md border border-cyan-500/20">
                        <div className="text-gray-400">Distance</div>
                        <div className="font-bold text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                          {clientData.statistics.dailyStats.optimizedRoute ? 
                            `${clientData.statistics.dailyStats.optimizedRoute.totalDistance} km` : 
                            `${clientData.statistics.dailyStats.totalDistance} km`}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm p-2 rounded-lg shadow-md border border-cyan-500/20">
                        <div className="text-gray-400">Durée</div>
                        <div className="font-bold text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                          {clientData.statistics.dailyStats.optimizedRoute ? 
                            `${clientData.statistics.dailyStats.optimizedRoute.totalDuration} min` : 
                            `${clientData.statistics.dailyStats.totalDuration} min`}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm p-2 rounded-lg shadow-md border border-cyan-500/20">
                        <div className="text-gray-400">Clients</div>
                        <div className="font-bold text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                          {clientData.statistics.dailyStats.clientCount}
                        </div>
                      </div>
                    </div>
                    
                    {clientData.statistics.dailyStats.optimizedRoute && clientData.statistics.dailyStats.clientCount > 0 && (
                      <div className="mt-2 text-xs text-gray-300">
                        <div className="font-medium mb-1 text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Ordre de visite optimisé:</div>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li className="mb-1">Point de départ: {STARTING_POINT}</li>
                          {clientData.statistics.dailyStats.optimizedRoute.waypoints.slice(1).map((wp, index) => (
                            <li key={index} className="mb-1">{wp.address}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                  
                  {/* Bouton d'itinéraire */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(address)}&destination=${encodeURIComponent(clientData.client.address)}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 text-center py-2.5 rounded-lg transition-all duration-200 mb-2 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
                  >
                    <Navigation className="h-4 w-4 inline-block mr-1 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" /> Itinéraire
                  </a>

                  {/* Bouton d'itinéraire optimisé (visible uniquement si disponible) */}
                  {clientData.statistics.dailyStats.optimizedRoute && clientData.statistics.dailyStats.clientCount > 0 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(STARTING_POINT)}&destination=${encodeURIComponent(STARTING_POINT)}&waypoints=${clientData.statistics.dailyStats.optimizedRoute.waypoints.slice(1).map(wp => encodeURIComponent(wp.address)).join('|')}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 text-purple-200 text-center py-2.5 rounded-lg transition-all duration-200 border border-purple-400/40 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
                    >
                      <Navigation className="h-4 w-4 inline-block mr-1 drop-shadow-[0_0_3px_rgba(168,85,247,0.8)]" /> Itinéraire optimisé (tous les clients)
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptimisationRdvClient