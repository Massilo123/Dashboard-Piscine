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
        <div className="max-w-4xl mx-auto p-4" ref={wrapperRef}>
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-indigo-900/30">
                <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-2 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                    </svg>
                    Optimiseur d'itinéraire
                </h2>
                
                <div className="space-y-4 mb-6">
                    {addresses.map((address, index) => (
                        <div key={index} className="relative">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => updateAddress(index, e.target.value)}
                                    placeholder="Entrez une adresse..."
                                    className="flex-1 min-w-0 p-2.5 border border-indigo-900/30 rounded-lg bg-gray-800/60 text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-md"
                                />
                                <button
                                    onClick={() => removeAddress(index)}
                                    className="whitespace-nowrap px-2 py-2 bg-red-800/70 text-white rounded-lg hover:bg-red-700/90 transition-colors shadow-md backdrop-blur-sm flex-shrink-0 text-sm"
                                    aria-label="Supprimer cette adresse"
                                >
                                    Supprimer
                                </button>
                            </div>
                            {suggestions[index]?.length > 0 && (
                                <div className="absolute z-10 w-full bg-gray-800/90 backdrop-blur-md mt-1 border border-indigo-900/30 rounded-lg shadow-xl">
                                    {suggestions[index].map((suggestion, sIndex) => (
                                        <div
                                            key={sIndex}
                                            className="p-2.5 hover:bg-indigo-700/40 cursor-pointer text-gray-200 transition-colors"
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
                        className="w-full p-2.5 bg-indigo-600/80 backdrop-blur-sm text-white rounded-lg hover:bg-indigo-700/90 transition-colors shadow-md flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Ajouter une adresse
                    </button>
                </div>

                <button
                    onClick={optimizeRoute}
                    disabled={loading || addresses.filter(a => a.trim()).length === 0}
                    className={`w-full p-3 rounded-lg shadow-lg transition-colors flex items-center justify-center ${
                        loading || addresses.filter(a => a.trim()).length === 0
                            ? 'bg-gray-600/70 text-gray-400 cursor-not-allowed'
                            : 'bg-purple-600/80 hover:bg-purple-700/90 text-white backdrop-blur-sm'
                    }`}
                >
                    {loading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Calcul en cours...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            Optimiser l'itinéraire
                        </>
                    )}
                </button>

                {error && (
                    <div className="mt-4 text-red-300 p-3 bg-red-900/40 backdrop-blur-sm rounded-lg border border-red-800/50 shadow-md">
                        <div className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            {error}
                        </div>
                    </div>
                )}

                {route && (
                    <div className="mt-6 space-y-4">
                        <h3 className="text-lg font-semibold mb-2 text-white flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="8 12 12 16 16 12"></polyline>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                            </svg>
                            Itinéraire optimisé
                        </h3>
                        <div className="p-4 bg-indigo-900/30 backdrop-blur-sm rounded-lg border border-indigo-900/30 shadow-lg">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-800/60 backdrop-blur-sm rounded-lg border border-indigo-900/20 shadow-md">
                                    <p className="font-medium text-indigo-300 flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <polyline points="12 6 12 12 16 14"></polyline>
                                        </svg>
                                        Durée totale: <span className="text-white ml-1">{route.totalDuration} minutes</span>
                                    </p>
                                </div>
                                <div className="p-3 bg-gray-800/60 backdrop-blur-sm rounded-lg border border-indigo-900/20 shadow-md">
                                    <p className="font-medium text-indigo-300 flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                        Distance totale: <span className="text-white ml-1">{route.totalDistance} km</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {route.waypoints.map((wp, index) => (
                                <div key={index} className="p-4 bg-gray-800/60 backdrop-blur-sm rounded-lg border border-indigo-900/30 shadow-lg hover:shadow-indigo-900/10 hover:bg-gray-800/70 transition-all">
                                    <div className="flex items-start">
                                        <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-indigo-600/70 rounded-full text-white text-sm font-bold mr-3">
                                            {index + 1}
                                        </span>
                                        <div className="flex-grow">
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wp.address)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-400 hover:text-indigo-300 hover:underline block"
                                            >
                                                {wp.address}
                                            </a>
                                        </div>
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wp.address)}`} 
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-shrink-0 text-indigo-400 hover:text-indigo-300 ml-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                                <polyline points="15 3 21 3 21 9"></polyline>
                                                <line x1="10" y1="14" x2="21" y2="3"></line>
                                            </svg>
                                        </a>
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

export default RouteOptimizer;