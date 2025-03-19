import { Calendar, Clock, MapPin, Navigation, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Waypoint {
  address: string
  type?: 'starting_point' | 'booking'
  customerName?: string
  startAt?: string
  coordinates: [number, number]
}

interface RouteData {
  waypoints: Waypoint[]
  totalDuration: number
  totalDistance: number
  route: unknown
}

const RouteOptimizerSchedule = () => {
    const [date, setDate] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [routeData, setRouteData] = useState<RouteData | null>(null)
    const [error, setError] = useState<string>('')
    const [shouldFetch, setShouldFetch] = useState<boolean>(false)
  
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setDate(e.target.value)
      setError('')
    }

    useEffect(() => {
        if (shouldFetch && date) {
          fetchOptimizedRoute()
          setShouldFetch(false)
        }
      }, [shouldFetch, date])
  
    const fetchOptimizedRoute = async () => {
      if (!date) {
        setError('Veuillez sélectionner une date')
        return
      }
  
      setLoading(true)
      setError('')
  
      try {
        const response = await fetch('https://api.piscineaquarius.com/api/optimize/bookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ date }),
        });
  
        const data = await response.json()
  
        if (!response.ok) {
          throw new Error(data.error || 'Une erreur est survenue')
        }
  
        setRouteData(data.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        setLoading(false)
      }
    }
  
    return (
      <div className="w-full max-w-4xl mx-auto p-2 sm:p-4 space-y-4">
        <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border border-indigo-900/30">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
            <h2 className="text-lg sm:text-xl font-semibold text-white">Optimisation des rendez-vous</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            {/* Contrôles de date et boutons - responsives */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <input
                type="date"
                value={date}
                onChange={handleDateChange}
                className="border border-indigo-900/30 rounded-lg p-2.5 bg-gray-800/60 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-auto backdrop-blur-sm shadow-md"
              />
              <div className="flex gap-2 sm:gap-4">
                <button
                  onClick={() => {
                    const today = new Date();
                    const formattedDate = today.toISOString().split('T')[0];
                    setDate(formattedDate);
                    setShouldFetch(true);
                  }}
                  className="flex-1 sm:flex-none bg-gray-700/70 backdrop-blur-sm text-white px-4 py-2.5 rounded-lg hover:bg-gray-600/90 transition-colors text-sm sm:text-base shadow-md flex items-center justify-center"
                >
                  <Calendar className="h-4 w-4 mr-1.5" />
                  Aujourd'hui
                </button>
               
                <button
                  onClick={fetchOptimizedRoute}
                  disabled={loading}
                  className="flex-1 sm:flex-none bg-indigo-600/80 backdrop-blur-sm text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700/90 disabled:bg-gray-600/70 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base shadow-md flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Optimisation...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Optimiser
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-300 p-3 bg-red-900/40 backdrop-blur-sm rounded-lg text-sm border border-red-800/50 shadow-md flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}
  
            {routeData && (
              <div className="mt-4">
                <h3 className="text-base sm:text-lg font-semibold mb-3 text-white flex items-center">
                  <Navigation className="h-5 w-5 mr-2 text-indigo-400" />
                  Itinéraire optimisé
                </h3>
                <div className="space-y-2">
                  {routeData.waypoints.map((waypoint, index) => (
                    <div
                      key={index}
                      className="p-3 sm:p-4 border border-indigo-900/30 rounded-lg bg-gray-800/60 backdrop-blur-sm hover:bg-gray-700/70 transition-colors shadow-md"
                    >
                      <div>
                        {waypoint.type === 'starting_point' ? (
                          <div className="break-words flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-900/70 rounded-full text-white text-sm font-bold mr-3">
                              <MapPin className="h-4 w-4" />
                            </div>
                            <div className="flex-grow">
                              <span className="font-medium text-gray-200 text-sm sm:text-base">Point de départ:</span>
                              <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 hover:underline ml-1 text-sm sm:text-base block"
                              >
                                {waypoint.address}
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-600/70 rounded-full text-white text-sm font-bold mr-3">
                              {index}
                            </div>
                            <div className="flex-grow">
                              <div className="font-medium text-sm sm:text-base text-white mb-1">
                                {waypoint.customerName}
                              </div>
                              <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs sm:text-sm break-words block"
                              >
                                {waypoint.address}
                              </a>
                              {waypoint.startAt && (
                                <div className="text-gray-300 text-xs sm:text-sm mt-1 flex items-center">
                                  <Clock className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                                  Heure: {
                                    new Date(waypoint.startAt).getHours() === 0 
                                    ? "Toute la journée" 
                                    : new Date(waypoint.startAt).toLocaleTimeString('fr-FR', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  }
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-indigo-900/30 backdrop-blur-sm rounded-lg border border-indigo-900/30 shadow-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-800/60 backdrop-blur-sm rounded-lg border border-indigo-900/20 shadow-md">
                      <div className="font-medium text-indigo-300 text-sm sm:text-base flex items-center">
                        <Clock className="h-4 w-4 mr-1.5 text-indigo-400" />
                        Durée totale: <span className="text-white ml-1">{routeData.totalDuration} minutes</span>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-800/60 backdrop-blur-sm rounded-lg border border-indigo-900/20 shadow-md">
                      <div className="font-medium text-indigo-300 text-sm sm:text-base flex items-center">
                        <Navigation className="h-4 w-4 mr-1.5 text-indigo-400" />
                        Distance totale: <span className="text-white ml-1">{routeData.totalDistance} km</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
}

export default RouteOptimizerSchedule;