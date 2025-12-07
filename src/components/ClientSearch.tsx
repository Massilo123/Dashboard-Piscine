import React, { useState, useEffect } from 'react';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import API_CONFIG from '../config/api';

const baseClient = mbxClient({ 
    accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' 
});
const geocodingService = mbxGeocoding(baseClient);

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
console.log("Token in use:", MAPBOX_TOKEN); // Pour debug

interface NearbyClient {
    id: string;
    name: string;
    address: string;
    phoneNumber: string;
    distance: number;
    duration: number;
}

interface Suggestion {
    place_name: string;
    text: string;
}

interface Coordinates {
    lng: number;
    lat: number;
}

const ClientSearch = () => {
    const [address, setAddress] = useState('');
    const [isAddressSelected, setIsAddressSelected] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [clients, setClients] = useState<NearbyClient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [geolocating, setGeolocating] = useState(false);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        const getSuggestions = async () => {
            if (address.length < 3 || isAddressSelected) {
                setSuggestions([]);
                return;
            }

            try {
                const response = await geocodingService.forwardGeocode({
                    query: address,
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

        const timeoutId = setTimeout(getSuggestions, 300);
        return () => clearTimeout(timeoutId);
    }, [address, isAddressSelected]);

    // Fonction pour obtenir l'adresse à partir des coordonnées
    const getAddressFromCoordinates = async (coordinates: Coordinates) => {
        try {
            const response = await geocodingService.reverseGeocode({
                query: [coordinates.lng, coordinates.lat],
                limit: 1,
                countries: ['ca']
            }).send();

            if (response.body.features.length > 0) {
                return response.body.features[0].place_name;
            }
            return null;
        } catch (err) {
            console.error('Erreur de géocodage inverse:', err);
            return null;
        }
    };

    // Fonction pour obtenir la position actuelle
    const getCurrentPosition = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('La géolocalisation n\'est pas prise en charge par votre navigateur'));
                return;
            }

            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
    };

    // Fonction pour rechercher avec la position actuelle
    const searchWithCurrentLocation = async () => {
        try {
            setGeolocating(true);
            setError('');
            
            // Obtenir la position actuelle
            const position = await getCurrentPosition();
            const coordinates = {
                lng: position.coords.longitude,
                lat: position.coords.latitude
            };
            
            // Obtenir l'adresse à partir des coordonnées
            const locationAddress = await getAddressFromCoordinates(coordinates);
            
            if (locationAddress) {
                setAddress(locationAddress);
                setIsAddressSelected(true);
                
                // Rechercher les clients à proximité
                await searchClientsWithCoordinates(coordinates);
            } else {
                throw new Error('Impossible de déterminer votre adresse actuelle');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la géolocalisation');
            console.error('Erreur de géolocalisation:', err);
        } finally {
            setGeolocating(false);
        }
    };

    // Fonction pour rechercher des clients avec l'adresse
    const searchClients = async () => {
        try {
            setLoading(true);
            setError('');
            setSuggestions([]);
            
            const response = await fetch(API_CONFIG.endpoints.mapboxClientsNearby, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ address }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setClients(data.data.clients);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    // Fonction pour rechercher des clients avec les coordonnées
    const searchClientsWithCoordinates = async (coordinates: Coordinates) => {
        try {
            setLoading(true);
            setError('');
            
            const response = await fetch(API_CONFIG.endpoints.mapboxClientsNearbyCoordinates, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ coordinates }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setClients(data.data.clients);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !loading && address.trim()) {
            searchClients();
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4" ref={wrapperRef}>
            <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 p-6 border border-indigo-500/20">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                        Rechercher des clients à proximité
                    </h2>
                    <div className="relative">
                        <div className="flex gap-4 flex-wrap">
                            <div className="flex-1 relative min-w-[200px]">
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => {
                                        setAddress(e.target.value);
                                        setIsAddressSelected(false);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Entrez une adresse..."
                                    className="w-full p-2.5 border border-cyan-500/30 rounded-lg bg-gray-900/60 text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 placeholder-gray-500 backdrop-blur-sm shadow-md transition-all duration-200"
                                />
                                
                                {suggestions.length > 0 && (
                                    <div className="absolute z-10 w-full bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm mt-1 border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20">
                                        {suggestions.map((suggestion, index) => (
                                            <div
                                                key={index}
                                                className="p-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 cursor-pointer text-gray-200 transition-all duration-200 border-b border-indigo-500/20 last:border-b-0"
                                                onClick={() => {
                                                    setAddress(suggestion.place_name);
                                                    setSuggestions([]);
                                                    setIsAddressSelected(true);
                                                }}
                                            >
                                                {suggestion.place_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={searchClients}
                                disabled={loading || geolocating || !address.trim()}
                                className={`px-5 py-2.5 rounded-lg transition-all duration-200 ${
                                    loading || geolocating || !address.trim()
                                        ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed border border-gray-600/30'
                                        : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm'
                                }`}
                            >
                                {loading ? 'Recherche...' : 'Rechercher'}
                            </button>
                            <button
                                onClick={searchWithCurrentLocation}
                                disabled={loading || geolocating}
                                className={`px-5 py-2.5 rounded-lg transition-all duration-200 flex items-center ${
                                    loading || geolocating
                                        ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed border border-gray-600/30'
                                        : 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-emerald-200 border border-emerald-400/40 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 backdrop-blur-sm'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 drop-shadow-[0_0_3px_rgba(16,185,129,0.8)]" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                {geolocating ? 'Localisation...' : 'Ma position'}
                            </button>
                        </div>
                    </div>
                    {error && (
                        <p className="text-rose-300 mt-2 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg border border-rose-500/50 shadow-lg shadow-rose-500/20">{error}</p>
                    )}
                </div>

                {clients.length === 0 && address !== '' && !loading && !error && (
                    <div className="text-center p-4 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                        <p className="text-gray-300">Aucun client trouvé à proximité de cette adresse.</p>
                    </div>
                )}

                {clients.length > 0 && (
                    <div>
                        <h3 className="text-xl font-semibold mb-4 flex items-center bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                            <span className="bg-gradient-to-br from-indigo-500/30 to-purple-500/30 backdrop-blur-sm w-7 h-7 inline-flex items-center justify-center rounded-full mr-2 text-sm border border-indigo-400/40 shadow-lg shadow-indigo-500/20 text-indigo-200 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">
                                {clients.length}
                            </span>
                            Clients à proximité
                        </h3>
                        <div className="grid gap-4">
                            {clients.map((client) => (
                                <div
                                    key={client.id}
                                    className="p-4 border border-indigo-500/20 rounded-lg bg-gradient-to-br from-gray-900/95 to-gray-800/85 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm shadow-md"
                                >
                                    <h4 className="text-white font-medium text-lg mb-2 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">{client.name}</h4>
                                    <a 
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-400 hover:text-cyan-300 hover:underline block mt-1 transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                                    >
                                        {client.address}
                                    </a>
                                    <a 
                                        href={`tel:${client.phoneNumber}`}
                                        className="block text-cyan-400 hover:text-cyan-300 hover:underline mt-1 transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                                    >
                                        {client.phoneNumber}
                                    </a>
                                    <div className="mt-3 flex space-x-4">
                                        <span className="px-3 py-1.5 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-full text-sm text-cyan-300 border border-cyan-500/20 shadow-lg shadow-cyan-500/10 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                                            Distance: {client.distance} km
                                        </span>
                                        <span className="px-3 py-1.5 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-full text-sm text-indigo-300 border border-indigo-500/20 shadow-lg shadow-indigo-500/10 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">
                                            Durée: {client.duration} min
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClientSearch;