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
      <div className="flex justify-center items-center p-8 text-gray-300">
        <div className="text-xl">Chargement des données...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900 bg-opacity-40 border border-red-800 text-red-300 rounded">
        <h2 className="font-bold mb-2">Erreur</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || !data.districts || data.districts.length === 0) {
    return (
      <div className="p-4 bg-yellow-900 bg-opacity-30 border border-yellow-800 text-yellow-300 rounded">
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
    <div className="p-2 sm:p-6 bg-gray-900 text-gray-200">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 text-white">Distribution des Clients par Quartier</h1>
        
        {/* Statistiques responsives */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-indigo-900 bg-opacity-40 p-2 sm:p-4 rounded-lg border border-indigo-700 shadow-md">
            <div className="text-lg sm:text-2xl font-bold text-indigo-300">{data.stats.totalProcessed}</div>
            <div className="text-xs sm:text-sm text-indigo-400">Clients traités</div>
          </div>
          <div className="bg-purple-900 bg-opacity-40 p-2 sm:p-4 rounded-lg border border-purple-700 shadow-md">
            <div className="text-lg sm:text-2xl font-bold text-purple-300">{data.stats.totalUnidentified}</div>
            <div className="text-xs sm:text-sm text-purple-400">Non identifiés</div>
          </div>
          <div className="bg-teal-900 bg-opacity-40 p-2 sm:p-4 rounded-lg border border-teal-700 shadow-md">
            <div className="text-lg sm:text-2xl font-bold text-teal-300">{data.stats.totalDistrictsFound}</div>
            <div className="text-xs sm:text-sm text-teal-400">Districts trouvés</div>
          </div>
        </div>

        <select 
          className="w-full sm:w-64 p-2 border border-gray-600 rounded-md bg-gray-800 text-white shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
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
      <div className="hidden md:block bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
        <table className="min-w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                Ville
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                Quartier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                Nombre de Clients
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {sortedDistricts.map((district) => (
              <React.Fragment key={district.id}>
                <tr className="hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-200">{district.city}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-200">{district.neighborhood}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-200">{district.count}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setExpandedDistrict(
                        expandedDistrict === district.id ? null : district.id
                      )}
                      className="text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {expandedDistrict === district.id ? 'Masquer' : 'Voir les clients'}
                    </button>
                  </td>
                </tr>
                {expandedDistrict === district.id && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 bg-gray-700">
                      <div className="space-y-3">
                        {district.clients.map((client) => (
                          <div key={client.id} className="border-b border-gray-600 pb-2">
                            <div className="font-medium text-white">{client.name}</div>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 hover:underline"
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
          <div key={district.id} className="mb-4 bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
            <div className="border-b border-gray-700 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-white">{district.city}</h3>
                  <p className="text-sm text-gray-300">{district.neighborhood}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-900 text-indigo-200 border border-indigo-700">
                    {district.count} clients
                  </span>
                  <button
                    onClick={() => setExpandedDistrict(
                      expandedDistrict === district.id ? null : district.id
                    )}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {expandedDistrict === district.id ? 'Masquer' : 'Voir les clients'}
                  </button>
                </div>
              </div>
            </div>
            
            {expandedDistrict === district.id && (
              <div className="p-4 bg-gray-700">
                <div className="space-y-3">
                  {district.clients.map((client) => (
                    <div key={client.id} className="border-b border-gray-600 pb-2">
                      <div className="font-medium text-white">{client.name}</div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 hover:underline text-sm break-words"
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