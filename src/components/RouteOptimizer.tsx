import React, { useState, useEffect } from 'react';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';

const baseClient = mbxClient({ accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '' });
const geocodingService = mbxGeocoding(baseClient);

interface OptimizedRoute {
    waypoints: {
        address: string;
        coordinates: [number, number];
    }[];
    totalDuration: number;
    totalDistance: number;
}

interface Suggestion {
    place_name: string;
    text: string;
}

const RouteOptimizer = () => {
    const [addresses, setAddresses] = useState<string[]>(['']);
    const [suggestions, setSuggestions] = useState<{ [key: number]: Suggestion[] }>({});
    const [selectedAddresses, setSelectedAddresses] = useState<{ [key: number]: boolean }>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [route, setRoute] = useState<OptimizedRoute | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setSuggestions({});
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const getSuggestions = async (address: string, index: number) => {
            if (address.length < 3 || selectedAddresses[index]) {
                setSuggestions(prev => ({ ...prev, [index]: [] }));
                return;
            }

            try {
                const response = await geocodingService.forwardGeocode({
                    query: address,
                    countries: ['ca'],
                    limit: 5,
                    types: ['address']
                }).send();

                setSuggestions(prev => ({
                    ...prev,
                    [index]: response.body.features.map(feature => ({
                        place_name: feature.place_name,
                        text: feature.text
                    }))
                }));
            } catch (err) {
                console.error('Erreur de suggestions:', err);
            }
        };

        const timeouts: { [key: number]: NodeJS.Timeout } = {};

        addresses.forEach((address, index) => {
            if (timeouts[index]) {
                clearTimeout(timeouts[index]);
            }
            timeouts[index] = setTimeout(() => getSuggestions(address, index), 300);
        });

        return () => {
            Object.values(timeouts).forEach(clearTimeout);
        };
    }, [addresses, selectedAddresses]);

    const addAddress = () => {
        setAddresses([...addresses, '']);
    };

    const removeAddress = (index: number) => {
        setAddresses(addresses.filter((_, i) => i !== index));
        setSuggestions(prev => {
            const newSuggestions = { ...prev };
            delete newSuggestions[index];
            return newSuggestions;
        });
    };

    const updateAddress = (index: number, value: string) => {
        const newAddresses = [...addresses];
        newAddresses[index] = value;
        setAddresses(newAddresses);
        setSelectedAddresses(prev => ({ ...prev, [index]: false }));
    };

    const selectSuggestion = (index: number, suggestion: Suggestion) => {
        updateAddress(index, suggestion.place_name);
        setSuggestions(prev => ({ ...prev, [index]: [] }));
        setSelectedAddresses(prev => ({ ...prev, [index]: true }));
    };

    const optimizeRoute = async () => {
        try {
            setLoading(true);
            setError('');
            
            const validAddresses = addresses.filter(addr => addr.trim());
            
            const response = await fetch('https://api.piscineaquarius.com/api/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ addresses: validAddresses }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setRoute(data.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 bg-gray-900 rounded-lg shadow-lg border border-gray-700" ref={wrapperRef}>
            <h2 className="text-2xl font-bold mb-4 text-white">Optimiseur d'itinéraire</h2>
            
            <div className="space-y-4 mb-6">
                {addresses.map((address, index) => (
                    <div key={index} className="relative">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => updateAddress(index, e.target.value)}
                                placeholder="Entrez une adresse..."
                                className="flex-1 p-2 border border-gray-600 rounded bg-gray-800 text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                onClick={() => removeAddress(index)}
                                className="px-3 py-2 bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
                            >
                                Supprimer
                            </button>
                        </div>
                        {suggestions[index]?.length > 0 && (
                            <div className="absolute z-10 w-full bg-gray-800 mt-1 border border-gray-700 rounded-md shadow-lg">
                                {suggestions[index].map((suggestion, sIndex) => (
                                    <div
                                        key={sIndex}
                                        className="p-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                        onClick={() => selectSuggestion(index, suggestion)}
                                    >
                                        {suggestion.place_name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                
                <button
                    onClick={addAddress}
                    className="w-full p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                    Ajouter une adresse
                </button>
            </div>

            <button
                onClick={optimizeRoute}
                disabled={loading || addresses.filter(a => a.trim()).length === 0}
                className={`w-full p-3 rounded transition-colors ${
                    loading || addresses.filter(a => a.trim()).length === 0
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
            >
                {loading ? 'Calcul en cours...' : 'Optimiser l\'itinéraire'}
            </button>

            {error && (
                <p className="mt-4 text-red-300 p-2 bg-red-900 bg-opacity-40 rounded border border-red-800">{error}</p>
            )}

            {route && (
                <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">Itinéraire optimisé</h3>
                    <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700 shadow-md">
                        <p className="font-medium text-indigo-300">Durée totale: <span className="text-white">{route.totalDuration} minutes</span></p>
                        <p className="font-medium text-indigo-300">Distance totale: <span className="text-white">{route.totalDistance} km</span></p>
                    </div>
                    <div className="space-y-2">
                        {route.waypoints.map((wp, index) => (
                            <div key={index} className="mt-4 p-3 bg-gray-800 rounded border border-gray-700 shadow-md">
                                <span className="font-bold mr-2 text-indigo-300">{index + 1}.</span>
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wp.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-400 hover:text-indigo-300 hover:underline"
                                >
                                    {wp.address}
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RouteOptimizer;