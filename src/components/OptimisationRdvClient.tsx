import { MapPin, Navigation, User, Calendar, Clock, Users, ChevronRight, ChevronLeft, Filter, X } from 'lucide-react'
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
    bookingDate: string // Format YYYY-MM-DD
  }
  distance: {
    value: number | null
    unit: string
  }
  duration: {
    value: number | null
    unit: string
  }
  route: any // Type pour la route MapBox
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
  const [processedDates, setProcessedDates] = useState<string[]>([])
  const [showDateFilter, setShowDateFilter] = useState<boolean>(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date().toISOString().split('T')[0], // Format YYYY-MM-DD pour aujourd'hui
    endDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0] // Format YYYY-MM-DD pour 30 jours après
  })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Gestion du clic en dehors du composant pour fermer les suggestions
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

  // Mise à jour des dates traitées lorsque clientData change
  useEffect(() => {
    if (clientData?.navigation?.processedDates) {
      setProcessedDates(clientData.navigation.processedDates);
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

  const findNearestClient = async (excludeDates: string[] = [], specificDate: string | null = null) => {
    if (!address) {
      setError('Veuillez entrer une adresse')
      return
    }

    // Valider l'intervalle de dates
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
      setClientData(newClientData);
      
      if (excludeDates.length > 0 && !specificDate) {
        // Si on avance, on ajoute au tableau des clients visités
        setVisitedClients(prev => [...prev, newClientData]);
        setNavigationIndex(prev => prev + 1);
      } else if (specificDate) {
        // Si on navigue en arrière, ne pas modifier le tableau
      } else {
        // Nouvelle recherche, réinitialiser
        setVisitedClients([newClientData]);
        setNavigationIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const handleNextClient = () => {
    if (clientData) {
      findNearestClient(processedDates);
    }
  };

  const handlePreviousClient = () => {
    if (navigationIndex > 0) {
      const previousIndex = navigationIndex - 1;
      const previousClient = visitedClients[previousIndex];
      
      // Utiliser specificDate pour revenir exactement au client précédent
      findNearestClient(
        // Exclure toutes les dates sauf celle du client précédent
        processedDates.filter(date => date !== previousClient.booking.bookingDate),
        previousClient.booking.bookingDate
      );
      
      setNavigationIndex(previousIndex);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4" ref={wrapperRef}>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            <h2 className="text-xl font-semibold text-black">Trouver le client le plus proche</h2>
          </div>
          <button 
            onClick={toggleDateFilter}
            className="flex items-center gap-1 text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
          >
            <Filter className="h-4 w-4" />
            <span>Filtre de dates</span>
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
            <h3 className="text-sm font-medium mb-2 text-gray-700">Filtrer par période</h3>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex flex-col">
                <label htmlFor="startDate" className="text-xs text-gray-500 mb-1">Date de début</label>
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
                <label htmlFor="endDate" className="text-xs text-gray-500 mb-1">Date de fin</label>
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
            <div className="text-xs text-gray-500 mt-2">
              {clientData?.navigation?.dateRange ? (
                <span>Recherche active entre {clientData.navigation.dateRange.startDate} et {clientData.navigation.dateRange.endDate}</span>
              ) : (
                <span>Le filtre sera appliqué à la prochaine recherche</span>
              )}
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
              <input
                type="text"
                value={address}
                onChange={handleAddressChange}
                placeholder="Entrez une adresse"
                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white mt-1 border rounded-md shadow-lg">
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
              {loading ? 'Recherche...' : 'Trouver'}
            </button>
          </div>

          {error && (
            <div className="text-red-500 p-2 bg-red-50 rounded">
              {error}
            </div>
          )}

          {clientData && (
            <div className="mt-4 space-y-4">
              {/* En-tête avec navigation */}
              <div className="flex justify-between items-center">
                <div className="text-black font-medium flex items-center">
                  {navigationIndex > 0 && (
                    <button
                      onClick={handlePreviousClient}
                      disabled={loading}
                      className="flex items-center gap-1 bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors mr-2"
                    >
                      <ChevronLeft className="h-4 w-4" /> Précédent
                    </button>
                  )}
                  {navigationIndex > 0 && (
                    <span className="bg-blue-100 text-blue-800 py-1 px-2 rounded-full text-sm">
                      Client {navigationIndex + 1}
                    </span>
                  )}
                </div>
                {clientData.navigation.hasNext && (
                  <button
                    onClick={handleNextClient}
                    disabled={loading}
                    className="flex items-center gap-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Suivant <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Statistiques */}
              <div className="border rounded p-4 bg-purple-50">
                <h3 className="text-lg font-semibold mb-2 text-black flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Statistiques
                </h3>
                <div className="text-black space-y-1">
                  <div className="font-medium">Clients programmés le {clientData.booking.date.split(" ").slice(0, -1).join(" ")}: {clientData.statistics.clientsOnSameDay}</div>
                  <div className="font-medium">Jours avec rendez-vous restants: {clientData.statistics.remainingDays}</div>
                </div>
              </div>

              <div className="border rounded p-4 bg-blue-50">
                <h3 className="text-lg font-semibold mb-2 text-black flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Informations du client
                </h3>
                <div className="space-y-2 text-black">
                  <div className="font-medium">{clientData.client.name}</div>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientData.client.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline block"
                  >
                    {clientData.client.address}
                  </a>
                </div>
              </div>

              <div className="border rounded p-4 bg-green-50">
                <h3 className="text-lg font-semibold mb-2 text-black flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Rendez-vous
                </h3>
                <div className="space-y-2 text-black">
                  <div className="font-medium">{clientData.booking.date}</div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>{clientData.booking.time}</span>
                  </div>
                </div>
              </div>

              <div className="border rounded p-4 bg-yellow-50">
                <h3 className="text-lg font-semibold mb-2 text-black flex items-center">
                  <Navigation className="h-5 w-5 mr-2" />
                  Itinéraire
                </h3>
                <div className="space-y-2 text-black">
                  <div className="font-medium">
                    Distance: {clientData.distance.value} {clientData.distance.unit}
                  </div>
                  <div className="font-medium">
                    Durée estimée: {clientData.duration.value} {clientData.duration.unit}
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(address)}&destination=${encodeURIComponent(clientData.client.address)}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                  >
                    Ouvrir dans Google Maps
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