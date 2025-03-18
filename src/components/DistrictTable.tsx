import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Client {
  id: string;
  name: string;
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface District {
  id: string;
  city: string;
  neighborhood: string;
  clients: Client[];
  count: number;
}

interface APIResponse {
  districts: District[];
  unidentifiedClients: Client[];
  stats: {
    totalProcessed: number;
    totalUnidentified: number;
    totalDistrictsFound: number;
  };
}

const VALID_CITIES = [
    'Montréal',
    'Laval',
    'Terrebonne',
    'Longueuil',
    'Brossard',
    'Repentigny',
    'Blainville',
    'Mascouche',
    'Saint-Jérôme',
    'Mirabel',
    'Saint-Eustache',
    'Saint-Sauveur',
    'Boisbriand',
    'Bois-des-Filion'
];

const DistrictTable = () => {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('https://api.piscineaquarius.com/api/district-analysis');
        
        if (!response.data) {
          throw new Error('Pas de données reçues de l\'API');
        }

        if (!Array.isArray(response.data.districts)) {
          console.error('Structure reçue:', response.data);
          throw new Error('Format de données invalide: les districts ne sont pas un tableau');
        }

        const isValidDistrict = (d: any): d is District => {
          return typeof d.id === 'string' &&
                 typeof d.city === 'string' &&
                 typeof d.neighborhood === 'string' &&
                 Array.isArray(d.clients) &&
                 typeof d.count === 'number';
        };

        if (!response.data.districts.every(isValidDistrict)) {
          throw new Error('Format de données invalide: structure des districts incorrecte');
        }

        const cleanedDistricts = response.data.districts.map(district => {
          if (!VALID_CITIES.includes(district.city)) {
            return {
              ...district,
              city: 'Montréal',
              neighborhood: district.city
            };
          }
          return district;
        });

        setData({
          ...response.data,
          districts: cleanedDistricts
        });
      } catch (err) {
        console.error('Erreur complète:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors de la récupération des données');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-xl">Chargement des données...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
        <h2 className="font-bold mb-2">Erreur</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || !data.districts || data.districts.length === 0) {
    return (
      <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
        <h2 className="font-bold mb-2">Aucune donnée</h2>
        <p>Aucun district n'a été trouvé.</p>
      </div>
    );
  }

  const citiesWithCounts = VALID_CITIES
    .map(city => ({
      city,
      totalClients: data.districts
        .filter(d => d.city === city)
        .reduce((sum, d) => sum + d.count, 0)
    }))
    .filter(cityData => cityData.totalClients > 0)
    .sort((a, b) => b.totalClients - a.totalClients);

  const filteredDistricts = selectedCity === 'all' 
    ? data.districts 
    : data.districts.filter(d => d.city === selectedCity);

  const sortedDistricts = [...filteredDistricts].sort((a, b) => b.count - a.count);

  return (
    <div className="p-2 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-4">Distribution des Clients par Quartier</h1>
        
        {/* Statistiques responsives */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-blue-50 p-2 sm:p-4 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-blue-700">{data.stats.totalProcessed}</div>
            <div className="text-xs sm:text-sm text-blue-600">Clients traités</div>
          </div>
          <div className="bg-yellow-50 p-2 sm:p-4 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-yellow-700">{data.stats.totalUnidentified}</div>
            <div className="text-xs sm:text-sm text-yellow-600">Non identifiés</div>
          </div>
          <div className="bg-green-50 p-2 sm:p-4 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-green-700">{data.stats.totalDistrictsFound}</div>
            <div className="text-xs sm:text-sm text-green-600">Districts trouvés</div>
          </div>
        </div>

        <select 
          className="w-full sm:w-64 p-2 border rounded-md shadow-sm"
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
        >
          <option value="all">Toutes les villes</option>
          {citiesWithCounts.map(({ city, totalClients }) => (
            <option key={city} value={city}>
              {city} ({totalClients} clients)
            </option>
          ))}
        </select>
      </div>

      {/* Version desktop du tableau - caché sur mobile */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ville
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Quartier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nombre de Clients
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDistricts.map((district) => (
              <React.Fragment key={district.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{district.city}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{district.neighborhood}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{district.count}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setExpandedDistrict(
                        expandedDistrict === district.id ? null : district.id
                      )}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      {expandedDistrict === district.id ? 'Masquer' : 'Voir les clients'}
                    </button>
                  </td>
                </tr>
                {expandedDistrict === district.id && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-3">
                        {district.clients.map((client) => (
                          <div key={client.id} className="border-b border-gray-200 pb-2">
                            <div className="font-medium">{client.name}</div>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {client.address}
                            </a>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Version mobile - visible uniquement sur petits écrans */}
      <div className="md:hidden">
        {sortedDistricts.map((district) => (
          <div key={district.id} className="mb-4 bg-white rounded-lg shadow overflow-hidden">
            <div className="border-b border-gray-200 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-gray-900">{district.city}</h3>
                  <p className="text-sm text-gray-700">{district.neighborhood}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {district.count} clients
                  </span>
                  <button
                    onClick={() => setExpandedDistrict(
                      expandedDistrict === district.id ? null : district.id
                    )}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-900"
                  >
                    {expandedDistrict === district.id ? 'Masquer' : 'Voir les clients'}
                  </button>
                </div>
              </div>
            </div>
            
            {expandedDistrict === district.id && (
              <div className="p-4 bg-gray-50">
                <div className="space-y-3">
                  {district.clients.map((client) => (
                    <div key={client.id} className="border-b border-gray-200 pb-2">
                      <div className="font-medium">{client.name}</div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline text-sm break-words"
                      >
                        {client.address}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DistrictTable;