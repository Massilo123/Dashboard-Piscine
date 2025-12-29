import React from 'react';
import { Calendar, Clock, MapPin, Navigation, CheckCircle, Timer } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import API_CONFIG from '../config/api'

// Hack pour corriger l'icône de marqueur par défaut en CSS
// Nécessaire car les images relatives ne fonctionnent pas correctement avec les importations webpack
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
  phoneNumber?: string
  coordinates: [number, number]
}

interface RouteLeg {
  duration: number;
  distance: number;
}

interface RouteData {
  waypoints: Waypoint[]
  totalDuration: number
  totalDistance: number
  route: {
    geometry?: any;
    legs?: RouteLeg[];
  } | unknown
}

const RouteOptimizerSchedule = () => {
    const [date, setDate] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [routeData, setRouteData] = useState<RouteData | null>(null)
    const [error, setError] = useState<string>('')
    const [shouldFetch, setShouldFetch] = useState<boolean>(false)
    
    // Référence pour la carte Leaflet
    const mapRef = useRef<L.Map | null>(null)
    const mapContainerDesktop = useRef<HTMLDivElement>(null)
    const mapContainerMobile = useRef<HTMLDivElement>(null)
  
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
        if (!routeData || !routeData.waypoints || routeData.waypoints.length === 0) {
            return;
        }

        // Attendre que le conteneur soit disponible dans le DOM
        const initMap = () => {
            // Trouver le conteneur visible (desktop ou mobile) en vérifiant la largeur de l'écran
            let container: HTMLDivElement | null = null;
            
            // Utiliser la largeur de l'écran pour déterminer quel conteneur utiliser
            const isDesktop = window.innerWidth >= 1024; // lg breakpoint de Tailwind
            
            if (isDesktop) {
                // Sur desktop, utiliser le conteneur desktop
                container = mapContainerDesktop.current;
            } else {
                // Sur mobile, utiliser le conteneur mobile
                container = mapContainerMobile.current;
            }
            
            // Vérifier que le conteneur est bien visible et a une taille
            if (container) {
                const rect = container.getBoundingClientRect();
                // Vérifier si le conteneur a une taille (largeur et hauteur > 0)
                if (rect.width === 0 || rect.height === 0) {
                    container = null;
                }
            }
            
            if (!container) {
                // Réessayer après un court délai si le conteneur n'est pas encore disponible
                // Limiter à 10 tentatives pour éviter une boucle infinie
                if (initMap.retryCount === undefined) {
                    initMap.retryCount = 0;
                }
                initMap.retryCount++;
                if (initMap.retryCount < 10) {
                    setTimeout(initMap, 100);
                }
                return;
            }
            
            // Réinitialiser le compteur
            if (initMap.retryCount !== undefined) {
                initMap.retryCount = 0;
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

            // Créer une nouvelle carte (container déjà défini plus haut)
            const newMap = L.map(container).setView([centerLat, centerLng], 11);
            
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
                        html: `<div style="background: linear-gradient(135deg, #8b5cf6, #6366f1); width: 22px; height: 22px; border-radius: 11px; 
                                display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.8); 
                                box-shadow: 0 0 4px rgba(139, 92, 246, 0.5), 0 0 8px rgba(139, 92, 246, 0.3);">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" 
                                stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 1px rgba(255,255,255,0.8));">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                                <circle cx="12" cy="10" r="3"/>
                                </svg>
                                </div>`,
                        iconSize: [22, 22],
                        iconAnchor: [11, 11],
                    });
                } else {
                    // Autres points
                    customIcon = L.divIcon({
                        className: 'custom-icon',
                        html: `<div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); width: 20px; height: 20px; border-radius: 10px; 
                                display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 11px;
                                border: 1px solid rgba(255, 255, 255, 0.8); 
                                box-shadow: 0 0 4px rgba(99, 102, 241, 0.5), 0 0 8px rgba(99, 102, 241, 0.3);">
                                ${index}
                                </div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                    });
                }

                // Créer l'URL Waze avec les coordonnées
                const wazeUrl = `https://waze.com/ul?ll=${waypoint.coordinates[1]},${waypoint.coordinates[0]}&navigate=yes`;
                
                // Créer le contenu de la popup
                const phoneDisplay = waypoint.phoneNumber && waypoint.phoneNumber.trim() 
                    ? `<div style="font-size: 0.85rem; margin-bottom: 5px; color: #9ca3af; display: flex; align-items: center; gap: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        <a href="tel:${waypoint.phoneNumber}" style="color: #818cf8; text-decoration: none;">
                            ${waypoint.phoneNumber}
                        </a>
                    </div>` 
                    : '';
                
                const popupContent = `
                    <div style="max-width: 200px; padding: 12px 16px;">
                        <div style="font-weight: 600; margin-bottom: 8px; font-size: 16px; background: linear-gradient(135deg, #a78bfa, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 8px rgba(139, 92, 246, 0.6);">
                            ${waypoint.customerName || 'Point de départ'}
                        </div>
                        <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" 
                           style="font-size: 0.85rem; margin-bottom: 6px; color: #60a5fa; text-decoration: underline; cursor: pointer; display: block; text-shadow: 0 0 4px rgba(96, 165, 250, 0.6);">
                           ${waypoint.address}
                        </a>
                        ${phoneDisplay}
                        ${waypoint.startAt ? `
                            <div style="font-size: 0.85rem; color: #9ca3af; margin-top: 6px;">
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

            // Ajouter des polylines pour représenter l'itinéraire avec les temps de trajet entre chaque point
            if (routePoints.length > 1) {
                // Ajouter un effet de glow à la ligne en créant une ligne plus large en arrière-plan
                L.polyline(routePoints, {
                    color: '#a78bfa',
                    weight: 4,
                    opacity: 0.25,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(newMap);
                
                // Créer une polyline pour l'itinéraire complet (en avant-plan)
                const mainRoute = L.polyline(routePoints, {
                    color: '#8b5cf6',
                    weight: 2.5,
                    opacity: 0.85,
                    lineJoin: 'round',
                    lineCap: 'round'
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
                            html: `<div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(99, 102, 241, 0.9)); color: white; 
                                    font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 4px; 
                                    border: 1px solid rgba(255, 255, 255, 0.25);
                                    box-shadow: 0 0 4px rgba(139, 92, 246, 0.4), 0 0 8px rgba(139, 92, 246, 0.2); 
                                    white-space: nowrap; width: fit-content;
                                    max-width: 50px; overflow: hidden; text-overflow: ellipsis; text-align: center;
                                    text-shadow: 0 0 2px rgba(255, 255, 255, 0.6);">
                                    ${estimatedDuration} min</div>`,
                            iconSize: [0, 0], // Taille nulle pour que le contenu HTML définisse la taille
                            iconAnchor: [12, 6]
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
        };

        // Initialiser la carte avec un petit délai pour s'assurer que le DOM est prêt
        // Utiliser requestAnimationFrame pour s'assurer que le DOM est complètement rendu
        const timeoutId = setTimeout(() => {
            requestAnimationFrame(() => {
                // Réessayer une fois de plus pour s'assurer que les styles sont appliqués
                requestAnimationFrame(() => {
                    initMap();
                });
            });
        }, 200);

        // Nettoyer la carte lors du nettoyage de l'effet
        return () => {
            clearTimeout(timeoutId);
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [routeData]);

    // Nettoyer la carte lors du démontage du composant
    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);
  
    const fetchOptimizedRoute = async () => {
      if (!date) {
        setError('Veuillez sélectionner une date')
        return
      }
  
      setLoading(true)
      setError('')
  
      try {
        const response = await fetch(API_CONFIG.endpoints.optimizeBookings, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ date }),
        });
  
        const data = await response.json()
        
        // Log des numéros de téléphone reçus
        if (data.data?.waypoints) {
            console.log('[TÉLÉPHONES] Numéros reçus du serveur:');
            data.data.waypoints.forEach((wp: any, idx: number) => {
                if (wp.customerName) {
                    console.log(`  ${idx}. ${wp.customerName} - ${wp.phoneNumber || 'NON DISPONIBLE'}`);
                }
            });
        }

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
      <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 space-y-4">
        <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 p-4 sm:p-6 border border-indigo-500/20">
          {/* Layout desktop : 2 colonnes - gauche (titre+boutons+carte), droite (liste) */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
            {/* Colonne gauche : Titre + Boutons + Carte */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                <h2 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                  Optimisation des rendez-vous
                </h2>
              </div>

              {/* Contrôles de date et boutons */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <input
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  className="border border-cyan-500/30 rounded-lg p-2.5 bg-gray-900/60 text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 w-full sm:w-auto backdrop-blur-sm shadow-md transition-all duration-200"
                />
                <div className="flex gap-2 sm:gap-4">
                  <button
                    onClick={() => {
                      const today = new Date();
                      const formattedDate = today.toISOString().split('T')[0];
                      setDate(formattedDate);
                      setShouldFetch(true);
                    }}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 backdrop-blur-sm text-cyan-200 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm sm:text-base border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                    Aujourd'hui
                  </button>
                 
                  <button
                    onClick={fetchOptimizedRoute}
                    disabled={loading}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 backdrop-blur-sm text-indigo-200 px-4 py-2.5 rounded-lg disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 text-sm sm:text-base border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Optimisation...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />
                        Optimiser
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg text-sm border border-rose-500/50 shadow-lg shadow-rose-500/20 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-rose-300 drop-shadow-[0_0_3px_rgba(239,68,68,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  {error}
                </div>
              )}

              {/* Carte desktop */}
              {routeData && (
                <>
                  <h3 className="text-base sm:text-lg font-semibold mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] flex items-center">
                    <MapPin className="h-5 w-5 mr-2 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                    Visualisation de l'itinéraire
                  </h3>
                  <div 
                    ref={mapContainerDesktop} 
                    className="w-full h-[600px] rounded-lg overflow-hidden shadow-lg border border-indigo-500/20"
                  />
                </>
              )}
            </div>

            {/* Colonne droite : Liste - commence tout en haut */}
            {routeData && (
              <div className="lg:col-span-1 flex flex-col">
                <h3 className="text-base sm:text-lg font-semibold mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] flex items-center">
                  <Navigation className="h-5 w-5 mr-2 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                  Itinéraire optimisé
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-1" style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(99, 102, 241, 0.3) rgba(31, 41, 55, 0.5)'
                }}>
                  {routeData.waypoints.map((waypoint, index) => (
                    <React.Fragment key={index}>
                      <div className="p-3 border border-indigo-500/20 rounded-lg bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-200 shadow-md">
                        <div>
                          {waypoint.type === 'starting_point' ? (
                            <div className="break-words flex items-start">
                              <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full text-white text-xs font-bold mr-2 border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                                <MapPin className="h-3.5 w-3.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />
                              </div>
                              <div className="flex-grow min-w-0">
                                <span className="font-medium text-cyan-300 text-xs drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Départ:</span>
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 hover:underline ml-1 text-xs block transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)] break-words"
                                >
                                  {waypoint.address}
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start">
                              <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full text-white text-xs font-bold mr-2 border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                                {index}
                              </div>
                              <div className="flex-grow min-w-0">
                                <div className="font-medium text-xs text-white mb-1 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)] break-words">
                                  {waypoint.customerName}
                                </div>
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoint.address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs break-words block transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                                >
                                  {waypoint.address}
                                </a>
                                {waypoint.phoneNumber && (
                                  <a 
                                    href={`tel:${waypoint.phoneNumber}`}
                                    className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs block mt-1 flex items-center transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    {waypoint.phoneNumber}
                                  </a>
                                )}
                                {waypoint.startAt && (
                                  <div className="text-gray-300 text-xs mt-1 flex items-center">
                                    <Clock className="h-3 w-3 mr-1 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                                    {
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
                      
                      {/* Afficher le temps de trajet entre les waypoints - version discrète */}
                      {index < routeData.waypoints.length - 1 && travelTimes[index] !== undefined && (
                        <div className="flex justify-center items-center py-0.5">
                          <div className="flex items-center text-cyan-300 px-2 py-0.5 text-xs bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded border border-cyan-500/20 shadow-lg shadow-cyan-500/10 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 drop-shadow-[0_0_2px_rgba(34,211,238,0.8)]">
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
          </div>

          {/* Version mobile */}
          <div className="lg:hidden flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
              <h2 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                Optimisation des rendez-vous
              </h2>
            </div>

            {/* Contrôles de date et boutons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <input
                type="date"
                value={date}
                onChange={handleDateChange}
                className="border border-cyan-500/30 rounded-lg p-2.5 bg-gray-900/60 text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 w-full sm:w-auto backdrop-blur-sm shadow-md transition-all duration-200"
              />
              <div className="flex gap-2 sm:gap-4">
                <button
                  onClick={() => {
                    const today = new Date();
                    const formattedDate = today.toISOString().split('T')[0];
                    setDate(formattedDate);
                    setShouldFetch(true);
                  }}
                  className="flex-1 sm:flex-none bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 backdrop-blur-sm text-cyan-200 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm sm:text-base border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center justify-center"
                >
                  <Calendar className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                  Aujourd'hui
                </button>
               
                <button
                  onClick={fetchOptimizedRoute}
                  disabled={loading}
                  className="flex-1 sm:flex-none bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 backdrop-blur-sm text-indigo-200 px-4 py-2.5 rounded-lg disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 text-sm sm:text-base border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Optimisation...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />
                      Optimiser
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg text-sm border border-rose-500/50 shadow-lg shadow-rose-500/20 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-rose-300 drop-shadow-[0_0_3px_rgba(239,68,68,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}

            {routeData && (
              <>
                {/* Version mobile : barre horizontale scrollable au-dessus de la carte */}
                <div className="mt-4 mb-4">
                  <div className="text-sm font-semibold mb-2 text-cyan-300 flex items-center">
                    <Navigation className="h-4 w-4 mr-1.5 text-cyan-400" />
                    Clients
                  </div>
                  <div className="flex overflow-x-auto pb-2 gap-3" style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(99, 102, 241, 0.3) rgba(31, 41, 55, 0.5)'
                  }}>
                    {routeData.waypoints.map((waypoint, index) => (
                      <div key={index} className="flex-shrink-0 w-64 p-3 border border-indigo-500/20 rounded-lg bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm shadow-md">
                        {waypoint.type === 'starting_point' ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full text-white text-xs font-bold border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                              <MapPin className="h-3 w-3 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-cyan-300 font-medium truncate">Départ</div>
                              <div className="text-xs text-white truncate">{waypoint.address}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full text-white text-xs font-bold border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                              {index}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-white truncate mb-1">
                                {waypoint.customerName}
                              </div>
                              <div className="text-xs text-cyan-400 truncate">
                                {waypoint.address}
                              </div>
                              {waypoint.phoneNumber && (
                                <a 
                                  href={`tel:${waypoint.phoneNumber}`}
                                  className="text-xs text-cyan-400 mt-1 block truncate"
                                >
                                  {waypoint.phoneNumber}
                                </a>
                              )}
                              {waypoint.startAt && (
                                <div className="text-xs text-gray-400 mt-1 flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {new Date(waypoint.startAt).getHours() === 0 
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
                    ))}
                  </div>
                </div>

                {/* Carte mobile */}
                <div className="mt-4">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] flex items-center">
                    <MapPin className="h-5 w-5 mr-2 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                    Visualisation de l'itinéraire
                  </h3>
                  <div 
                    ref={mapContainerMobile} 
                    className="w-full h-96 rounded-lg overflow-hidden shadow-lg border border-indigo-500/20"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
}

export default RouteOptimizerSchedule;