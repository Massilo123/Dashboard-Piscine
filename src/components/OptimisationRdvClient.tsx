import { MapPin, Navigation, User, Calendar, Clock, ChevronRight, ChevronLeft, Filter, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';

const baseClient = mbxClient({ accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' });
const geocodingService = mbxGeocoding(baseClient);

interface Suggestion {
  place_name: string;
  text: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface ClientData {
  client: {
    id: string
    name: string
    address: string
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
      const response = await fetch('https://api.piscineaquarius.com/api/client-rdv', {
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
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 space-y-4" ref={wrapperRef}>
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
            <h2 className="text-lg sm:text-xl font-semibold text-black">Client le plus proche</h2>
          </div>
          <button 
            onClick={toggleDateFilter}
            className="flex items-center gap-1 text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
          >
            <Filter className="h-4 w-4" />
            <span>Dates</span>
          </button>
        </div>

        {/* Filtre par date - Visible uniquement lorsque activé */}
        {showDateFilter && (
          <div 
            ref={filterRef}
            className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50 relative"
          >
            <div className="absolute top-2 right-2">
              <button
                onClick={() => setShowDateFilter(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex flex-col">
                <label htmlFor="startDate" className="text-xs text-gray-500 mb-1">Date début</label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={dateRange.startDate}
                  onChange={handleDateRangeChange}
                  className="border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="endDate" className="text-xs text-gray-500 mb-1">Date fin</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={dateRange.endDate}
                  onChange={handleDateRangeChange}
                  className="border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white mt-1 border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-2 hover:bg-gray-100 cursor-pointer text-black"
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
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '...' : 'Trouver'}
            </button>
          </div>

          {error && (
            <div className="text-red-500 p-2 bg-red-50 rounded">
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
                  className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                    canGoLeft && !loading
                      ? 'bg-gray-500 text-white hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                {/* Indicateur de position (optionnel) */}
                <span className="text-xs text-gray-500">
                  {currentIndex + 1}/{visitedClients.length}
                  {clientData.navigation.hasNext && currentIndex === visitedClients.length - 1 ? "+" : ""}
                </span>
                
                <button
                  onClick={handleNextClient}
                  disabled={loading || !canGoRight}
                  className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                    canGoRight && !loading
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Carte client principale */}
              <div className="border rounded-lg shadow overflow-hidden">
                {/* En-tête de la carte avec nom client & distance */}
                <div className="bg-blue-500 text-white p-3 flex justify-between items-center">
                  <div className="flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    <span className="font-bold text-base sm:text-lg">{clientData.client.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span className="font-bold">{clientData.duration.value} min</span>
                    <span className="text-xs">({clientData.distance.value} km)</span>
                  </div>
                </div>
                
                {/* Corps de la carte */}
                <div className="p-3 bg-white">
                  {/* Adresse */}
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientData.client.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline block mb-3 break-words"
                  >
                    {clientData.client.address}
                  </a>
                  
                  {/* Date mise en évidence, sans l'heure */}
                  <div className="flex items-center mb-3 bg-yellow-50 p-3 rounded border border-yellow-200">
                    <Calendar className="h-5 w-5 mr-2 text-yellow-600" />
                    <span className="text-gray-800 font-medium text-lg">{clientData.booking.date}</span>
                  </div>
                  
                  {/* Statistiques condensées avec compteur de jours correct */}
                  <div className="flex justify-between text-sm text-gray-500 mb-3">
                    <div>{clientData.statistics.clientsOnSameDay} clients ce jour</div>
                    <div>
                      {remainingDays > 0 
                        ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''} restant${remainingDays > 1 ? 's' : ''}`
                        : "0 jour restant"}
                    </div>
                  </div>
                  
                  {/* Nouvelle section: Statistiques journalières */}
                  <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-100">
                    <h3 className="font-medium text-blue-800 mb-1 text-sm">Statistiques pour cette journée:</h3>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-white p-2 rounded shadow-sm">
                        <div className="text-gray-500">Distance</div>
                        <div className="font-bold text-blue-700">
                          {clientData.statistics.dailyStats.totalDistance} km
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded shadow-sm">
                        <div className="text-gray-500">Durée</div>
                        <div className="font-bold text-blue-700">
                          {clientData.statistics.dailyStats.totalDuration} min
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded shadow-sm">
                        <div className="text-gray-500">Clients</div>
                        <div className="font-bold text-blue-700">
                          {clientData.statistics.dailyStats.clientCount}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bouton d'itinéraire */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(address)}&destination=${encodeURIComponent(clientData.client.address)}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-blue-500 text-white text-center py-2 rounded hover:bg-blue-600 transition-colors"
                  >
                    <Navigation className="h-4 w-4 inline-block mr-1" /> Itinéraire
                  </a>
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