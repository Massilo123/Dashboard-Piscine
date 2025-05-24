import React from 'react';
import { Calendar, Clock, MapPin, Navigation, CheckCircle, Timer, RefreshCw, Zap } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Hack pour corriger l'icône de marqueur par défaut en CSS
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Définir les icônes par défaut pour éviter les erreurs d'icônes manquantes
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Waypoint {
  address: string
  type?: 'starting_point' | 'booking'
  customerName?: string
  startAt?: string
  coordinates: [number, number]
}

interface RouteLeg {
  duration: number;
  distance: number;
}

interface SyncInfo {
  totalBookingsChecked?: number;
  validBookingsFound?: number;
  lastSyncTime: string;
  requestedDate?: string;
}

interface RouteData {
  waypoints: Waypoint[]
  totalDuration: number
  totalDistance: number
  route: {
    geometry?: any;
    legs?: RouteLeg[];
  } | unknown
  freshTimestamp?: number
  cacheStatus?: string
  syncInfo?: SyncInfo
}

const RouteOptimizerSchedule = () => {
    const [date, setDate] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [routeData, setRouteData] = useState<RouteData | null>(null)
    const [error, setError] = useState<string>('')
    const [shouldFetch, setShouldFetch] = useState<boolean>(false)
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
    const [isSyncing, setIsSyncing] = useState<boolean>(false)
    
    // Référence pour la carte Leaflet
    const mapRef = useRef<L.Map | null>(null)
    const mapContainer = useRef<HTMLDivElement>(null)

    const handleDateChange = (e: React.ChangeEvent<HTMLInputEvent>) => {
      setDate(e.target.value)
      setError('')
    }

    useEffect(() => {
        if (shouldFetch && date) {
          fetchOptimizedRoute(true) // Forcer le refresh lors du fetch automatique
          setShouldFetch(false)
        }
    }, [shouldFetch, date])

    // Mise à jour du timestamp de synchronisation
    useEffect(() => {
        if (routeData?.freshTimestamp) {
            setLastSyncTime(new Date(routeData.freshTimestamp));
        }
    }, [routeData]);

    // Auto-synchronisation toutes les 30 secondes si des données sont affichées
    useEffect(() => {
        if (!routeData || !date) return;
        
        const interval = setInterval(() => {
            console.log('🔄 Auto-synchronisation des rendez-vous...');
            forceRefresh();
        }, 30000); // 30 secondes
        
        return () => clearInterval(interval);
    }, [routeData, date]);
    
    // Déterminer les temps de trajet entre les points
    const [travelTimes, setTravelTimes] = useState<number[]>([]);
  
    // Effet pour calculer les temps de trajet entre les points
    useEffect(() => {
        if (!routeData || !routeData.waypoints || routeData.waypoints.length < 2) {
            setTravelTimes([]);
            return;
        }
        
        // Calculer les temps de trajet entre chaque point
        const times: number[] = [];
        
        for (let i = 0; i < routeData.waypoints.length - 1; i++) {
            let estimatedDuration = 0;
            
            // Si des données détaillées sont disponibles
            if (routeData.route && typeof routeData.route === 'object' && 'legs' in routeData.route) {
                const legs = routeData.route.legs;
                if (Array.isArray(legs) && legs[i] && 'duration' in legs[i]) {
                    estimatedDuration = Math.round(legs[i].duration / 60); // convertir en minutes
                }
            } else {
                // Estimation simplifiée basée sur la distance euclidienne
                const startPoint = routeData.waypoints[i].coordinates;
                const endPoint = routeData.waypoints[i + 1].coordinates;
                
                const dx = startPoint[1] - endPoint[1];
                const dy = startPoint[0] - endPoint[0];
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const totalDist = routeData.totalDistance;
                const ratio = distance / (totalDist * 0.01);
                
                estimatedDuration = Math.round((routeData.totalDuration * ratio) / 10);
            }
            
            times.push(estimatedDuration);
        }
        
        setTravelTimes(times);
    }, [routeData]);

    useEffect(() => {
        // Ne rien faire si les conditions ne sont pas remplies
        if (!routeData || !routeData.waypoints || routeData.waypoints.length === 0 || viewMode !== 'map' || !mapContainer.current) {
            return;
        }

        // Nettoyer la carte précédente si elle existe
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        // Calculer le centre approximatif de tous les points
        const lats = routeData.waypoints.map(wp => wp.coordinates[1]);
        const lngs = routeData.waypoints.map(wp => wp.coordinates[0]);
        const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

        // Créer une nouvelle carte
        const newMap = L.map(mapContainer.current).setView([centerLat, centerLng], 11);
        
        // Ajouter des tuiles (fond de carte)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(newMap);

        // Créer un tableau pour stocker les coordonnées des points
        const routePoints: L.LatLngExpression[] = [];

        // Ajouter des marqueurs pour chaque waypoint
        routeData.waypoints.forEach((waypoint, index) => {
            try {
                // Inverser les coordonnées pour Leaflet [lat, lng]
                const position: L.LatLngExpression = [waypoint.coordinates[1], waypoint.coordinates[0]];
                routePoints.push(position);

                // Créer une icône personnalisée
                let customIcon;
                if (index === 0) {
                    // Point de départ
                    customIcon = L.divIcon({
                        className: 'custom-icon',
                        html: `<div style="background-color: #3730a3; width: 32px; height: 32px; border-radius: 16px; 
                                display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
                                stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                                <circle cx="12" cy="10" r="3"/>
                                </svg>
                                </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                    });
                } else {
                    // Autres points
                    customIcon = L.divIcon({
                        className: 'custom-icon',
                        html: `<div style="background-color: #4f46e5; width: 28px; height: 28px; border-radius: 14px; 
                                display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; 
                                border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                ${index}
                                </div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                    });
                }

                // Créer le contenu de la popup
                const popupContent = `
                    <div style="max-width: 200px; padding: 8px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">${waypoint.customerName || 'Point de départ'}</div>
                        <div style="font-size: 0.85rem; margin-bottom: 5px;">${waypoint.address}</div>
                        ${waypoint.startAt ? `
                            <div style="font-size: 0.85rem; color: #6b7280;">
                                Heure: ${new Date(waypoint.startAt).getHours() === 0 
                                    ? "Toute la journée" 
                                    : new Date(waypoint.startAt).toLocaleTimeString('fr-FR', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })
                                }
                            </div>
                        ` : ''}
                    </div>
                `;

                // Ajouter le marqueur à la carte
                L.marker(position, { icon: customIcon })
                    .addTo(newMap)
                    .bindPopup(popupContent);
            } catch (err) {
                console.error(`Erreur lors de l'ajout du marqueur ${index}:`, err);
            }
        });

        // Ajouter des polylines pour représenter l'itinéraire avec les temps de trajet
        if (routePoints.length > 1) {
            // Créer une polyline pour l'itinéraire complet (en arrière-plan)
            const mainRoute = L.polyline(routePoints, {
                color: '#4f46e5',
                weight: 4,
                opacity: 0.7,
                lineJoin: 'round'
            }).addTo(newMap);

            // Ajouter des indicateurs de temps entre chaque segment
            for (let i = 0; i < routePoints.length - 1; i++) {
                const startPoint = routePoints[i];
                const endPoint = routePoints[i + 1];
                
                // Calculer le point milieu pour placer l'étiquette
                const midLat = (startPoint[0] + endPoint[0]) / 2;
                const midLng = (startPoint[1] + endPoint[1]) / 2;
                
                // Estimer le temps de trajet (si disponible dans les données)
                let estimatedDuration = "";
                
                if (i < travelTimes.length) {
                    estimatedDuration = String(travelTimes[i]);
                }
                
                // Créer une étiquette de temps
                if (estimatedDuration !== "") {
                    // Créer une icône personnalisée pour l'étiquette de temps
                    const timeIcon = L.divIcon({
                        className: 'time-label',
                        html: `<div style="background-color: rgba(79, 70, 229, 0.9); color: white; 
                                font-size: 10px; font-weight: 500; padding: 2px 5px; border-radius: 4px; 
                                box-shadow: 0 1px 2px rgba(0,0,0,0.2); white-space: nowrap; width: fit-content;
                                max-width: 60px; overflow: hidden; text-overflow: ellipsis; text-align: center;">
                                ${estimatedDuration} min</div>`,
                        iconSize: [0, 0], // Taille nulle pour que le contenu HTML définisse la taille
                        iconAnchor: [15, 8]
                    });
                    
                    // Ajouter l'étiquette à la carte
                    L.marker([midLat, midLng], { 
                        icon: timeIcon,
                        interactive: false,  // Désactiver les interactions pour éviter les clics
                        zIndexOffset: -1000  // Placer derrière les autres marqueurs
                    }).addTo(newMap);
                }
            }
        }

        // Ajuster la vue pour inclure tous les waypoints
        if (routePoints.length > 0) {
            const bounds = L.latLngBounds(routePoints);
            newMap.fitBounds(bounds, {
                padding: [50, 50]
            });
        }

        // Enregistrer la référence de la carte
        mapRef.current = newMap;

        // Nettoyer la carte lors du nettoyage de l'effet
        return () => {
            if (viewMode !== 'map' && mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [routeData, viewMode]);

    // Nettoyer la carte lors du démontage du composant
    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Fonction principale de récupération avec synchronisation
    const fetchOptimizedRoute = async (forceRefresh: boolean = false) => {
        if (!date) {
            setError('Veuillez sélectionner une date')
            return
        }

        setLoading(true)
        setError('')

        if (forceRefresh) {
            setIsSyncing(true);
        }

        try {
            console.log(`🔄 Optimisation ${forceRefresh ? 'forcée' : 'normale'} pour ${date}...`);
            
            const response = await fetch('https://api.piscineaquarius.com/api/optimize/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                body: JSON.stringify({ 
                    date,
                    forceRefresh: forceRefresh,
                    timestamp: Date.now()
                }),
            });

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Une erreur est survenue')
            }

            console.log(`✅ Optimisation reçue - Statut: ${data.data.cacheStatus}`);
            if (data.data.syncInfo) {
                console.log(`📊 Sync info: ${data.data.syncInfo.validBookingsFound}/${data.data.syncInfo.totalBookingsChecked} rendez-vous valides`);
            }

            setRouteData(data.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue')
        } finally {
            setLoading(false)
            setIsSyncing(false);
        }
    }

    // Fonction de synchronisation instantanée
    const forceRefresh = async () => {
        console.log('🚀 SYNCHRONISATION INSTANTANÉE AVEC SQUARE');
        await fetchOptimizedRoute(true);
    };

    // Composant bouton de synchronisation instantanée
    const InstantSyncButton = () => (
        <button
            onClick={forceRefresh}
            disabled={loading || isSyncing}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                isSyncing 
                    ? 'bg-yellow-600/70 text-white animate-pulse' 
                    : 'bg-green-600/70 text-white hover:bg-green-700/90'
            } disabled:opacity-50 shadow-md`}
            title="Synchronisation instantanée avec Square"
        >
            <RefreshCw className={`h-4 w-4 ${(loading || isSyncing) ? 'animate-spin' : ''}`} />
            <span className="text-sm">
                {isSyncing ? 'Sync...' : 'Sync'}
            </span>
        </button>
    );

    // Composant indicateur de fraîcheur des données
    const FreshnessIndicator = () => {
        if (!lastSyncTime) return null;
        
        const secondsAgo = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
        
        return (
            <div className="text-xs text-center mt-2 flex items-center justify-center gap-2">
                <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                        secondsAgo < 30 ? 'bg-green-400' : 
                        secondsAgo < 60 ? 'bg-yellow-400' : 
                        'bg-red-400'
                    }`}></div>
                    <span className="text-gray-400">
                        Sync: {secondsAgo < 60 ? `${secondsAgo}s` : `${Math.floor(secondsAgo/60)}m`}
                    </span>
                </div>
                {routeData?.syncInfo && (
                    <div className="text-gray-500 text-xs">
                        ({routeData.syncInfo.validBookingsFound}/{routeData.syncInfo.totalBookingsChecked} rendez-vous)
                    </div>
                )}
            </div>
        );
    };
  
    return (
        <div className="w-full max-w-4xl mx-auto p-2 sm:p-4 space-y-4">
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border border-indigo-900/30">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
                        <h2 className="text-lg sm:text-xl font-semibold text-white">Optimisation des rendez-vous</h2>
                        {routeData?.cacheStatus && (
                            <div className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-green-400" />
                                <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
                                    Temps réel
                                </span>
                            </div>
                        )}
                    </div>
                    <InstantSyncButton />
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
                                onClick={() => fetchOptimizedRoute(false)}
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
                        <>
                            {/* Sélecteur de mode d'affichage */}
                            <div className="flex border border-indigo-900/30 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`flex-1 py-2.5 px-4 flex items-center justify-center ${
                                        viewMode === 'list'
                                            ? 'bg-indigo-600/80 text-white'
                                            : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                                    }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                    Liste
                                </button>
                                <button
                                    onClick={() => setViewMode('map')}
                                    className={`flex-1 py-2.5 px-4 flex items-center justify-center ${
                                        viewMode === 'map'
                                            ? 'bg-indigo-600/80 text-white'
                                            : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                                    }`}
                                >
                                    <MapPin className="h-4 w-4 mr-1.5" />
                                    Carte
                                </button>
                            </div>

                            {/* Affichage de la liste */}
                            {viewMode === 'list' && (
                                <div className="mt-4">
                                    <h3 className="text-base sm:text-lg font-semibold mb-3 text-white flex items-center">
                                        <Navigation className="h-5 w-5 mr-2 text-indigo-400" />
                                        Itinéraire optimisé
                                    </h3>
                                    <div className="space-y-1">
                                        {routeData.waypoints.map((waypoint, index) => (
                                            <React.Fragment key={index}>
                                                <div className="p-3 sm:p-4 border border-indigo-900/30 rounded-lg bg-gray-800/60 backdrop-blur-sm hover:bg-gray-700/70 transition-colors shadow-md">
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
                          
                                                {/* Afficher le temps de trajet entre les waypoints */}
                                                {index < routeData.waypoints.length - 1 && travelTimes[index] !== undefined && (
                                                    <div className="flex justify-center items-center py-1">
                                                        <div className="flex items-center text-indigo-300 px-2 py-0.5 text-xs opacity-70">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 opacity-60">
                                                                <polyline points="6 9 12 15 18 9"></polyline>
                                                            </svg>
                                                            <span>{travelTimes[index]} min</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Affichage de la carte */}
                            {viewMode === 'map' && (
                                <div className="mt-4">
                                    <h3 className="text-base sm:text-lg font-semibold mb-3 text-white flex items-center">
                                        <MapPin className="h-5 w-5 mr-2 text-indigo-400" />
                                        Visualisation de l'itinéraire
                                    </h3>
                                    <div 
                                        ref={mapContainer} 
                                        className="w-full h-96 rounded-lg overflow-hidden shadow-lg border border-indigo-900/30"
                                    />
                                </div>
                            )}

                            {/* Résumé de l'itinéraire */}
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

                                {/* Indicateur de fraîcheur */}
                                <FreshnessIndicator />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default RouteOptimizerSchedule;