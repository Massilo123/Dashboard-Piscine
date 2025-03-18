import { MapPin, Navigation, User, Calendar, Clock, Users, ChevronRight } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';

const baseClient = mbxClient({ accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' });
const geocodingService = mbxGeocoding(baseClient);

interface Suggestion {
  place_name: string;
  text: string;
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
    totalBookingsToday: number
    remainingDays: number
  }
  navigation: {
    hasNext: boolean
    processedDates: string[]
  }
}

const OptimisationRdvClient = () => {
  const [address, setAddress] = useState<string>('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isAddressSelected, setIsAddressSelected] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [error, setError] = useState<string>('')
  const [processedDates, setProcessedDates] = useState<string[]>([])
  const [navigationCount, setNavigationCount] = useState<number>(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Gestion du clic en dehors du composant pour fermer les suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const selectSuggestion = (suggestion: Suggestion) => {
    setAddress(suggestion.place_name);
    setSuggestions([]);
    setIsAddressSelected(true);
  };

  const findNearestClient = async (excludeDates: string[] = []) => {
    if (!address) {
      setError('Veuillez entrer une adresse')
      return
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
          excludeDates
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Une erreur est survenue')
      }

      setClientData(data.data)
      
      if (excludeDates.length > 0) {
        setNavigationCount(prev => prev + 1);
      } else {
        setNavigationCount(0);
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

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4" ref={wrapperRef}>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          <h2 className="text-xl font-semibold text-black">Trouver le client le plus proche</h2>
        </div>
        
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
              {/* En-tête avec navigation et compteur */}
              <div className="flex justify-between items-center">
                <div className="text-black font-medium">
                  {navigationCount > 0 && (
                    <span className="bg-blue-100 text-blue-800 py-1 px-2 rounded-full text-sm">
                      Client {navigationCount + 1}
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

              {/* Statistiques de la journée */}
              <div className="border rounded p-4 bg-purple-50">
                <h3 className="text-lg font-semibold mb-2 text-black flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Statistiques
                </h3>
                <div className="text-black space-y-1">
                  <div className="font-medium">Nombre total de clients aujourd'hui: {clientData.statistics.totalBookingsToday}</div>
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