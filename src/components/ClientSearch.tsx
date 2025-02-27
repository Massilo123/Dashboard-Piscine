import React, { useState, useEffect } from 'react';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css';  // N'oubliez pas d'importer le CSS




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

const ClientSearch = () => {
    const [address, setAddress] = useState('');
    const [isAddressSelected, setIsAddressSelected] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [clients, setClients] = useState<NearbyClient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
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

    const searchClients = async () => {
        try {
            setLoading(true);
            setError('');
            setSuggestions([]); 
            
            const response = await fetch('https://api.piscineaquarius.com/api/mapbox/clients-nearby', {
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !loading && address.trim()) {
            searchClients();
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4" ref={wrapperRef}>
            <div className="mb-8">
                <h2 className="text-2xl text-black font-bold mb-4">Rechercher des clients à proximité</h2>
                <div className="relative">
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => {
                                setAddress(e.target.value);
                                setIsAddressSelected(false);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Entrez une adresse..."
                            className="w-full p-2 border rounded"
                        />
                            
                            {suggestions.length > 0 && (
                                <div className="absolute z-10 w-full bg-white mt-1 border rounded-md shadow-lg">
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            className="p-2 hover:bg-green-100 cursor-pointer text-black"
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
                            disabled={loading || !address.trim()}
                            className={`px-4 py-2 rounded ${
                                loading || !address.trim()
                                    ? 'bg-gray-300'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                        >
                            {loading ? 'Recherche...' : 'Rechercher'}
                        </button>
                    </div>
                </div>
                {error && (
                    <p className="text-red-500 mt-2">{error}</p>
                )}
            </div>

            
            {clients.length === 0 && address !== '' && !loading && !error && (
                <div className="text-center p-4">
                    <p className="text-gray-600">Aucun client trouvé à proximité de cette adresse.</p>
                </div>
            )}

            {clients.length > 0 && (
                <div>
                    <h3 className="text-xl text-black font-semibold mb-4">Clients à proximité</h3>
                    <div className="grid gap-4">
                        {clients.map((client) => (
                            <div
                                key={client.id}
                                className="p-4 border rounded hover:bg-gray-50"
                            >
                                <h4 className="text-black font-medium">{client.name}</h4>
                                <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    {client.address}
                                </a>
                                <a 
                                    href={`tel:${client.phoneNumber}`}
                                    className="block text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    {client.phoneNumber}
                                </a>
                                <div className="mt-2 text-sm text-gray-500">
                                    <span className="mr-4">Distance: {client.distance} km</span>
                                    <span>Durée: {client.duration} min</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientSearch;