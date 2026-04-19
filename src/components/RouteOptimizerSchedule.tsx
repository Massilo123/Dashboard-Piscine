import React from 'react';
import { createPortal } from 'react-dom'
import { Calendar, Clock, MapPin, Navigation, CheckCircle, Timer, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import API_CONFIG from '../config/api'

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

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
    const [currentCardIndex, setCurrentCardIndex] = useState<number>(0)

    const mapRef = useRef<L.Map | null>(null)
    const mapContainerDesktop = useRef<HTMLDivElement>(null)
    const mapContainerMobile = useRef<HTMLDivElement>(null)
    const carouselRef = useRef<HTMLDivElement>(null)
    const scrollRaf = useRef<number>(0)
    const ignoreScroll = useRef<boolean>(false)

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

    // Reset carousel when new route data arrives
    useEffect(() => {
        setCurrentCardIndex(0)
        ignoreScroll.current = true
        setTimeout(() => {
            const el = carouselRef.current
            if (el) el.scrollLeft = 0
            ignoreScroll.current = false
        }, 50)
    }, [routeData])

    const flyToWaypoint = useCallback((index: number) => {
        if (!mapRef.current || window.innerWidth >= 1024) return
        const waypoints = routeData?.waypoints
        if (!waypoints) return
        const wp = waypoints[index]
        if (!wp) return
        // Starting point → overview of the full route
        if (wp.type === 'starting_point') {
            const points: L.LatLngExpression[] = waypoints.map(w => [w.coordinates[1], w.coordinates[0]])
            if (points.length > 0) {
                mapRef.current.flyToBounds(L.latLngBounds(points), { padding: [50, 50], duration: 0.7 })
            }
            return
        }
        mapRef.current.flyTo(
            [wp.coordinates[1], wp.coordinates[0]],
            14,
            { duration: 0.7 }
        )
    }, [routeData])

    const scrollToIndex = useCallback((index: number, smooth = true) => {
        const el = carouselRef.current
        if (!el) return
        ignoreScroll.current = true
        el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
        setCurrentCardIndex(index)
        flyToWaypoint(index)
        setTimeout(() => { ignoreScroll.current = false }, smooth ? 320 : 80)
    }, [flyToWaypoint])

    const prevCard = () => scrollToIndex(Math.max(0, currentCardIndex - 1))
    const nextCard = () => routeData && scrollToIndex(Math.min(routeData.waypoints.length - 1, currentCardIndex + 1))

    const handleCarouselScroll = () => {
        if (ignoreScroll.current) return
        if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
        scrollRaf.current = requestAnimationFrame(() => {
            scrollRaf.current = 0
            const el = carouselRef.current
            if (!el || el.clientWidth === 0) return
            const idx = Math.round(el.scrollLeft / el.clientWidth)
            const total = routeData?.waypoints.length ?? 1
            const clamped = Math.max(0, Math.min(total - 1, idx))
            if (clamped !== currentCardIndex) {
                setCurrentCardIndex(clamped)
                flyToWaypoint(clamped)
            }
        })
    }

    const [travelTimes, setTravelTimes] = useState<number[]>([]);

    useEffect(() => {
        if (!routeData || !routeData.waypoints || routeData.waypoints.length < 2) {
            setTravelTimes([]);
            return;
        }
        const times: number[] = [];
        for (let i = 0; i < routeData.waypoints.length - 1; i++) {
            let estimatedDuration = 0;
            if (routeData.route && typeof routeData.route === 'object' && 'legs' in routeData.route) {
                const legs = routeData.route.legs;
                if (Array.isArray(legs) && legs[i] && 'duration' in legs[i]) {
                    estimatedDuration = Math.round(legs[i].duration / 60);
                }
            } else {
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
        if (!routeData || !routeData.waypoints || routeData.waypoints.length === 0) {
            return;
        }

        const initMap = () => {
            let container: HTMLDivElement | null = null;
            const isDesktop = window.innerWidth >= 1024;
            if (isDesktop) {
                container = mapContainerDesktop.current;
            } else {
                container = mapContainerMobile.current;
            }
            if (container) {
                const rect = container.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    container = null;
                }
            }
            if (!container) {
                if (initMap.retryCount === undefined) initMap.retryCount = 0;
                initMap.retryCount++;
                if (initMap.retryCount < 10) setTimeout(initMap, 100);
                return;
            }
            if (initMap.retryCount !== undefined) initMap.retryCount = 0;

            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }

            const lats = routeData.waypoints.map(wp => wp.coordinates[1]);
            const lngs = routeData.waypoints.map(wp => wp.coordinates[0]);
            const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
            const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

            const newMap = L.map(container).setView([centerLat, centerLng], 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(newMap);

            const routePoints: L.LatLngExpression[] = [];

            routeData.waypoints.forEach((waypoint, index) => {
            try {
                const position: L.LatLngExpression = [waypoint.coordinates[1], waypoint.coordinates[0]];
                routePoints.push(position);

                let customIcon;
                if (index === 0) {
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

                const wazeUrl = `https://waze.com/ul?ll=${waypoint.coordinates[1]},${waypoint.coordinates[0]}&navigate=yes`;
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

                L.marker(position, { icon: customIcon })
                    .addTo(newMap)
                    .bindPopup(popupContent);
            } catch (err) {
                console.error(`Erreur lors de l'ajout du marqueur ${index}:`, err);
            }
        });

            if (routePoints.length > 1) {
                L.polyline(routePoints, {
                    color: '#a78bfa',
                    weight: 4,
                    opacity: 0.25,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(newMap);

                L.polyline(routePoints, {
                    color: '#8b5cf6',
                    weight: 2.5,
                    opacity: 0.85,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(newMap);

                const localTravelTimes: number[] = [];
                for (let i = 0; i < routeData.waypoints.length - 1; i++) {
                    let dur = 0;
                    if (routeData.route && typeof routeData.route === 'object' && 'legs' in routeData.route) {
                        const legs = routeData.route.legs;
                        if (Array.isArray(legs) && legs[i] && 'duration' in legs[i]) {
                            dur = Math.round(legs[i].duration / 60);
                        }
                    } else {
                        const sp = routeData.waypoints[i].coordinates;
                        const ep = routeData.waypoints[i + 1].coordinates;
                        const dx = sp[1] - ep[1];
                        const dy = sp[0] - ep[0];
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const ratio = distance / (routeData.totalDistance * 0.01);
                        dur = Math.round((routeData.totalDuration * ratio) / 10);
                    }
                    localTravelTimes.push(dur);
                }

                for (let i = 0; i < routePoints.length - 1; i++) {
                    const startPoint = routePoints[i];
                    const endPoint = routePoints[i + 1];
                    const midLat = (startPoint[0] + endPoint[0]) / 2;
                    const midLng = (startPoint[1] + endPoint[1]) / 2;
                    let estimatedDuration = "";
                    if (i < localTravelTimes.length) estimatedDuration = String(localTravelTimes[i]);
                    if (estimatedDuration !== "") {
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
                            iconSize: [0, 0],
                            iconAnchor: [12, 6]
                        });
                        L.marker([midLat, midLng], {
                            icon: timeIcon,
                            interactive: false,
                            zIndexOffset: -1000
                        }).addTo(newMap);
                    }
                }
            }

            if (routePoints.length > 0) {
                const bounds = L.latLngBounds(routePoints);
                newMap.fitBounds(bounds, { padding: [50, 50] });
            }

            mapRef.current = newMap;
        };

        const timeoutId = setTimeout(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    initMap();
                });
            });
        }, 200);

        return () => {
            clearTimeout(timeoutId);
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [routeData]);

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        });
        const data = await response.json()
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

    const LoadingSpinner = () => (
      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    )

    const PhoneIcon = () => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    )

    return (
      <>
        <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 space-y-4">
          <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/5 p-4 sm:p-6 border border-indigo-500/20 overflow-hidden">

            {/* ===== DESKTOP LAYOUT ===== */}
            <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4 lg:items-stretch">
              {/* Left column: header + controls + map */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                  <h2 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                    Optimisation des rendez-vous
                  </h2>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 min-w-0">
                  <input
                    type="date"
                    value={date}
                    onChange={handleDateChange}
                    className="border border-cyan-500/30 rounded-lg p-2.5 bg-gray-900/60 text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 w-full min-w-0 sm:w-auto backdrop-blur-sm shadow-md transition-all duration-200"
                  />
                  <div className="flex gap-2 sm:gap-4">
                    <button
                      onClick={() => {
                        const today = new Date();
                        setDate(today.toISOString().split('T')[0]);
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
                        <><LoadingSpinner /><span className="ml-2">Optimisation...</span></>
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />Optimiser</>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg text-sm border border-rose-500/50 shadow-lg shadow-rose-500/20 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-rose-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    {error}
                  </div>
                )}

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

              {/* Right column: waypoint list */}
              {routeData && (
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <h3 className="text-base sm:text-lg font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] flex items-center flex-shrink-0">
                    <Navigation className="h-5 w-5 mr-2 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                    Itinéraire optimisé
                  </h3>
                  <div className="overflow-y-auto pr-2 space-y-1 flex-shrink-0" style={{
                    maxHeight: '725px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(99, 102, 241, 0.3) rgba(31, 41, 55, 0.5)'
                  }}>
                    {routeData.waypoints.map((waypoint, index) => (
                      <React.Fragment key={index}>
                        <div className="p-3 border border-indigo-500/20 rounded-lg bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-200 shadow-md">
                          {waypoint.type === 'starting_point' ? (
                            <div className="break-words flex items-start">
                              <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full text-white text-xs font-bold mr-2 border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                                <MapPin className="h-3.5 w-3.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />
                              </div>
                              <div className="flex-grow min-w-0">
                                <span className="font-medium text-cyan-300 text-xs drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Départ:</span>
                                <a
                                  href={`https://www.waze.com/ul?q=${encodeURIComponent(waypoint.address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 hover:underline ml-1 text-xs block transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)] break-words cursor-pointer"
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
                                  href={`https://www.waze.com/ul?q=${encodeURIComponent(waypoint.address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs break-words block transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)] cursor-pointer"
                                >
                                  {waypoint.address}
                                </a>
                                {waypoint.phoneNumber && (
                                  <a
                                    href={`tel:${waypoint.phoneNumber}`}
                                    className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs block mt-1 flex items-center transition-colors drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    {waypoint.phoneNumber}
                                  </a>
                                )}
                                {waypoint.startAt && (
                                  <div className="text-gray-300 text-xs mt-1 flex items-center">
                                    <Clock className="h-3 w-3 mr-1 text-cyan-400" />
                                    {new Date(waypoint.startAt).getHours() === 0
                                      ? "Toute la journée"
                                      : new Date(waypoint.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                                    }
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {index < routeData.waypoints.length - 1 && travelTimes[index] !== undefined && (
                          <div className="flex justify-center items-center py-0.5">
                            <div className="flex items-center text-cyan-300 px-2 py-0.5 text-xs bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded border border-cyan-500/20 shadow-lg shadow-cyan-500/10 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
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

            {/* ===== MOBILE LAYOUT — controls only ===== */}
            <div className="lg:hidden flex flex-col gap-4 w-full overflow-hidden">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                <h2 className="text-lg font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                  Optimisation des rendez-vous
                </h2>
              </div>

              <div className="flex flex-col gap-2 w-full min-w-0">
                <input
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  placeholder="Entrer une date"
                  className="border border-cyan-500/30 rounded-lg px-4 py-4 bg-gray-900/60 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 w-full max-w-full min-w-0 backdrop-blur-sm shadow-md transition-all duration-200 appearance-none text-base"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const today = new Date();
                      setDate(today.toISOString().split('T')[0]);
                      setShouldFetch(true);
                    }}
                    className="flex-1 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 backdrop-blur-sm text-cyan-200 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm border border-cyan-400/40 shadow-lg shadow-cyan-500/20 flex items-center justify-center"
                  >
                    <Calendar className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                    Aujourd'hui
                  </button>
                  <button
                    onClick={fetchOptimizedRoute}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 backdrop-blur-sm text-indigo-200 px-4 py-2.5 rounded-lg disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 text-sm border border-indigo-400/40 shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? (
                      <><LoadingSpinner /><span className="ml-2">Optimisation...</span></>
                    ) : (
                      <><CheckCircle className="h-4 w-4 mr-1.5 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />Optimiser</>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-rose-300 p-3 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm rounded-lg text-sm border border-rose-500/50 shadow-lg shadow-rose-500/20 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-rose-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  {error}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ===== MOBILE FULL-SCREEN MAP OVERLAY — portalled to document.body to escape any ancestor backdrop-filter/transform ===== */}
        {routeData && createPortal(
          <div className="fixed inset-0 lg:hidden flex flex-col justify-between" style={{ zIndex: 9999 }}>

            {/* Map background — isolated stacking context so Leaflet's internal z-indexes don't escape */}
            <div ref={mapContainerMobile} className="absolute inset-0 w-full h-full" style={{ zIndex: 0, isolation: 'isolate' }} />

            {/* Top controls bar */}
            <div className="relative bg-gray-900/85 backdrop-blur-md border-b border-indigo-500/30 px-3 py-2" style={{ zIndex: 1000 }}>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  className="flex-1 min-w-0 border border-cyan-500/30 rounded-lg px-3 py-2 bg-gray-900/60 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 backdrop-blur-sm appearance-none"
                />
                <button
                  onClick={() => {
                    const today = new Date();
                    setDate(today.toISOString().split('T')[0]);
                    setShouldFetch(true);
                  }}
                  className="flex-shrink-0 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-200 p-2 rounded-lg border border-cyan-400/40 shadow-lg active:scale-95 transition-transform"
                  title="Aujourd'hui"
                >
                  <Calendar className="h-4 w-4 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                </button>
                <button
                  onClick={fetchOptimizedRoute}
                  disabled={loading}
                  className="flex-shrink-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-200 p-2 rounded-lg border border-indigo-400/40 shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
                  title="Optimiser"
                >
                  {loading ? <LoadingSpinner /> : <CheckCircle className="h-4 w-4 drop-shadow-[0_0_3px_rgba(139,92,246,0.8)]" />}
                </button>
                <button
                  onClick={() => setRouteData(null)}
                  className="flex-shrink-0 text-gray-400 hover:text-white p-2 rounded-lg border border-gray-500/30 hover:border-gray-400/50 transition-colors active:scale-95"
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Bottom carousel stack — gradient bg anchors it visually to the bottom edge */}
            <div className="relative" style={{
              zIndex: 1000,
              background: 'linear-gradient(to top, rgba(8,8,20,0.95) 0%, rgba(8,8,20,0.80) 60%, transparent 100%)',
              paddingTop: '2rem',
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
            }}>

              {/* Info row: stop counter + swipe hint */}
              <div className="flex justify-between items-center px-4 mb-1.5">
                <span className="text-xs font-semibold text-white/80 bg-gray-900/60 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-indigo-500/25">
                  {routeData.waypoints[currentCardIndex]?.type === 'starting_point'
                    ? 'Point de départ'
                    : `Arrêt ${currentCardIndex} sur ${routeData.waypoints.length - 1}`}
                </span>
                {routeData.waypoints.length > 1 && (
                  <span className="text-xs text-white/45">
                    Glissez vers la gauche ou la droite &nbsp;{currentCardIndex + 1} / {routeData.waypoints.length}
                  </span>
                )}
              </div>

              {/* Carousel + nav buttons row */}
              <div className="relative flex items-center gap-1 px-1">

                {/* Prev button */}
                {routeData.waypoints.length > 1 && (
                  <button
                    onClick={prevCard}
                    disabled={currentCardIndex === 0}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gray-900/80 backdrop-blur-md border border-indigo-500/30 rounded-full text-indigo-300 shadow-lg shadow-indigo-500/10 disabled:opacity-20 active:scale-95 transition-transform"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}

                {/* Scroll-snap carousel */}
                <div
                  ref={carouselRef}
                  onScroll={handleCarouselScroll}
                  className="flex-1 flex flex-row flex-nowrap overflow-x-auto overflow-y-hidden"
                  style={{
                    scrollSnapType: 'x mandatory',
                    scrollBehavior: 'smooth',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x',
                    scrollbarWidth: 'none',
                  }}
                >
                  {routeData.waypoints.map((waypoint, index) => {
                    const wazeUrl = `https://waze.com/ul?ll=${waypoint.coordinates[1]},${waypoint.coordinates[0]}&navigate=yes`;
                    const timeStr = waypoint.startAt
                      ? (new Date(waypoint.startAt).getHours() === 0
                          ? 'Toute la journée'
                          : new Date(waypoint.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
                      : null;

                    return (
                      <div
                        key={index}
                        style={{ flex: '0 0 100%', minWidth: '100%', maxWidth: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', boxSizing: 'border-box', padding: '0 0.25rem' }}
                      >
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-500/20 p-4">

                          {waypoint.type === 'starting_point' ? (
                            <>
                              <div className="flex items-center gap-2.5 mb-2.5">
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gradient-to-br from-indigo-500/40 to-purple-500/40 rounded-full border border-indigo-400/50 shadow-lg shadow-indigo-500/30">
                                  <MapPin className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)]" />
                                </div>
                                <span className="text-base font-bold text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]">Point de départ</span>
                              </div>
                              <a
                                href={`https://www.waze.com/ul?q=${encodeURIComponent(waypoint.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-3"
                              >
                                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{waypoint.address}</span>
                              </a>
                              <a
                                href={`https://www.waze.com/ul?q=${encodeURIComponent(waypoint.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-semibold py-2.5 rounded-xl text-center border border-indigo-500/40 shadow-lg shadow-indigo-500/20 transition-all active:scale-95 block mt-1"
                              >
                                Waze
                              </a>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2.5 mb-2.5">
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gradient-to-br from-indigo-500/40 to-purple-500/40 rounded-full text-white text-sm font-bold border border-indigo-400/50 shadow-lg shadow-indigo-500/30">
                                  #{index}
                                </div>
                                <span className="text-base font-bold text-white drop-shadow-[0_0_4px_rgba(139,92,246,0.5)] truncate flex-1">
                                  {waypoint.customerName}
                                </span>
                              </div>

                              <a
                                href={wazeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-2 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]"
                              >
                                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span className="truncate">{waypoint.address}</span>
                              </a>

                              {waypoint.phoneNumber && (
                                <div className="flex items-center gap-1.5 text-sm text-cyan-300 mb-2 drop-shadow-[0_0_3px_rgba(34,211,238,0.4)]">
                                  <PhoneIcon />
                                  <span>{waypoint.phoneNumber}</span>
                                </div>
                              )}

                              {timeStr && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                                  <span>{timeStr}</span>
                                </div>
                              )}

                              <div className="flex gap-2 mt-3">
                                {waypoint.phoneNumber ? (
                                  <a
                                    href={`tel:${waypoint.phoneNumber}`}
                                    className="flex-1 bg-gradient-to-r from-emerald-600/80 to-green-600/80 hover:from-emerald-600 hover:to-green-600 text-white text-sm font-semibold py-2.5 rounded-xl text-center border border-emerald-500/40 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                  >
                                    Appeler
                                  </a>
                                ) : (
                                  <span className="flex-1 bg-gray-700/50 text-gray-500 text-sm font-semibold py-2.5 rounded-xl text-center border border-gray-600/30 cursor-not-allowed">
                                    Appeler
                                  </span>
                                )}
                                <a
                                  href={wazeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-semibold py-2.5 rounded-xl text-center border border-indigo-500/40 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                                >
                                  Waze
                                </a>
                              </div>
                            </>
                          )}

                          {/* Travel time to next stop */}
                          {index < routeData.waypoints.length - 1 && travelTimes[index] !== undefined && (
                            <div className="flex justify-center mt-3">
                              <div className="flex items-center gap-1.5 text-xs text-cyan-300 bg-gray-900/60 backdrop-blur-sm px-3 py-1 rounded-full border border-cyan-500/20 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">
                                <Timer className="h-3 w-3" />
                                <span>{travelTimes[index]} min jusqu'au prochain</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Next button */}
                {routeData.waypoints.length > 1 && (
                  <button
                    onClick={nextCard}
                    disabled={currentCardIndex === routeData.waypoints.length - 1}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gray-900/80 backdrop-blur-md border border-indigo-500/30 rounded-full text-indigo-300 shadow-lg shadow-indigo-500/10 disabled:opacity-20 active:scale-95 transition-transform"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    )
}

export default RouteOptimizerSchedule;
