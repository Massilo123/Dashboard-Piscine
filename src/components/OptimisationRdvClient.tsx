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
  const [navigationIndex, setNavigationIndex] = useState<number>(0)
  const [allProcessedDates, setAllProcessedDates] = useState<string[]>([])
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

  // Mise à jour des dates traitées
  useEffect(() => {
    if (clientData?.navigation?.processedDates) {
      setAllProcessedDates(clientData.navigation.processedDates);
    }
  }, [clientData]);

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

  // Fonction pour obtenir les dates processées à exclure, sans la date courante
  const getExcludeDatesExcept = (currentDate: string | null) => {
    if (!currentDate) return allProcessedDates;
    return allProcessedDates.filter(date => date !== currentDate);
  };

  const findNearestClient = async (excludeDates: string[] = [], specificDate: string | null = null) => {
    if (!address) {
      setError('Veuillez entrer une adresse')
      return
    }

    if (dateRange.startDate > dateRange.endDate) {
      setError('La date de début doit être antérieure à la date de fin');
      return;
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('https://api.piscineaquarius.com/api/client-rdv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          address,
          excludeDates,
          specificDate,
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

      const newClientData = data.data;
      
      if (excludeDates.length > 0 && !specificDate) {
        // Navigation suivante - ajouter le nouveau client à l'historique
        const updatedVisitedClients = [...visitedClients, newClientData];
        setVisitedClients(updatedVisitedClients);
        setNavigationIndex(updatedVisitedClients.length - 1);
      } else if (specificDate) {
        // Trouver l'index du client avec la date spécifique
        const existingIndex = visitedClients.findIndex(
          client => client.booking.bookingDate === specificDate
        );
        
        if (existingIndex >= 0) {
          // Nous avons trouvé un client existant avec cette date, mettre à jour l'index
          setNavigationIndex(existingIndex);
        }
      } else {
        // Premier client - réinitialiser l'historique
        setVisitedClients([newClientData]);
        setNavigationIndex(0);
      }
      
      // Toujours mettre à jour les données client
      setClientData(newClientData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  // Navigation directe à un client spécifique dans l'historique
  const navigateToClient = (index: number) => {
    if (index >= 0 && index < visitedClients.length && index !== navigationIndex) {
      const targetClient = visitedClients[index];
      const targetDate = targetClient.booking.bookingDate;
      
      // Exclure toutes les autres dates sauf celle du client cible
      const excludeDates = getExcludeDatesExcept(targetDate);
      
      findNearestClient(excludeDates, targetDate);
    }
  };

  const handleNextClient = () => {
    if (clientData && clientData.navigation.hasNext) {
      findNearestClient(allProcessedDates);
    }
  };

  const handlePreviousClient = () => {
    if (navigationIndex > 0) {
      navigateToClient(navigationIndex - 1);
    }
  };

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
              onClick={() => findNearestClient([])}
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
              {/* Boutons de navigation */}
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={handlePreviousClient}
                  disabled={loading || navigationIndex <= 0}
                  className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                    navigationIndex > 0 && !loading
                      ? 'bg-gray-500 text-white hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                <button
                  onClick={handleNextClient}
                  disabled={loading || !clientData.navigation.hasNext}
                  className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                    clientData.navigation.hasNext && !loading
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Navigation par index (optionnel) - utile pour le débogage */}
              {/*
              <div className="flex justify-center mb-4 gap-2">
                {visitedClients.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => navigateToClient(index)}
                    disabled={index === navigationIndex || loading}
                    className={`w-8 h-8 rounded-full ${
                      index === navigationIndex 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              */}

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
                  
                  {/* Statistiques condensées */}
                  <div className="flex justify-between text-sm text-gray-500 mb-3">
                    <div>{clientData.statistics.clientsOnSameDay} clients ce jour</div>
                    <div>{clientData.statistics.remainingDays} jours restants</div>
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