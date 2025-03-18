import { MapPin, Navigation, User, Calendar, Clock } from 'lucide-react'
import { useState } from 'react'

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
}

const OptimisationRdvClient = () => {
  const [address, setAddress] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [error, setError] = useState<string>('')

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value)
    setError('')
  }

  const findNearestClient = async () => {
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
        body: JSON.stringify({ address }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Une erreur est survenue')
      }

      setClientData(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          <h2 className="text-xl font-semibold text-black">Trouver le client le plus proche</h2>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={address}
              onChange={handleAddressChange}
              placeholder="Entrez une adresse"
              className="border rounded p-2 flex-grow focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={findNearestClient}
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