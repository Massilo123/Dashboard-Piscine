import { Calendar } from 'lucide-react'
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
        <div className="bg-white rounded-lg shadow p-3 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
            <h2 className="text-lg sm:text-xl font-semibold text-black">Optimisation des rendez-vous</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            {/* Contrôles de date et boutons - responsives */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <input
                type="date"
                value={date}
                onChange={handleDateChange}
                className="border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
              />
              <div className="flex gap-2 sm:gap-4">
                <button
                  onClick={() => {
                    const today = new Date();
                    const formattedDate = today.toISOString().split('T')[0];
                    setDate(formattedDate);
                    setShouldFetch(true);
                  }}
                  className="flex-1 sm:flex-none bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors text-sm sm:text-base"
                >
                  Aujourd'hui
                </button>
               
                <button
                  onClick={fetchOptimizedRoute}
                  disabled={loading}
                  className="flex-1 sm:flex-none bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                >
                  {loading ? '...' : 'Optimiser'}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-500 p-2 bg-red-50 rounded text-sm">
                {error}
              </div>
            )}
  
            {routeData && (
              <div className="mt-4">
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-black">Itinéraire optimisé</h3>
                <div className="space-y-2">
                  {routeData.waypoints.map((waypoint, index) => (
                    <div
                      key={index}
                      className="p-2 sm:p-3 border rounded hover:bg-gray-50 transition-colors text-black"
                    >
                      <div>
                        {waypoint.type === 'starting_point' ? (
                          <div className="break-words">
                            <span className="font-medium text-black text-sm sm:text-base">Point de départ:</span>
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline ml-1 text-sm sm:text-base"
                            >
                              {waypoint.address}
                            </a>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-sm sm:text-base">
                              <span className="font-bold mr-2">{index}.</span>
                              {waypoint.customerName}
                            </div>
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline text-xs sm:text-sm break-words"
                            >
                              {waypoint.address}
                            </a>
                            {waypoint.startAt && (
                              <div className="text-black text-xs sm:text-sm">
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
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-2 sm:p-3 bg-gray-50 rounded">
                  <div className="font-medium text-black text-sm sm:text-base">Durée totale: {routeData.totalDuration} minutes</div>
                  <div className="font-medium text-black text-sm sm:text-base">Distance totale: {routeData.totalDistance} km</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
}

export default RouteOptimizerSchedule;