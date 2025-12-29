import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';
import Client from '../models/Client';

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

// Définir l'adresse fixe du point de départ
const STARTING_POINT = "1829 rue capitol";

// Fonction utilitaire pour calculer la distance à vol d'oiseau (Haversine)
function calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en km
}

// Interface pour les statistiques journalières
interface DailyStats {
    totalDistance: number;
    totalDuration: number;
    clientCount: number;
}

// Fonction pour calculer les statistiques d'une journée spécifique
/* eslint-disable @typescript-eslint/no-explicit-any */
const calculateDailyStats = (clients: any[], date: string): DailyStats => {
    const clientsOnDate = clients.filter(client => client.bookingDate === date);
    
    const totalDistance = clientsOnDate.reduce((sum, client) => {
        return sum + (client.distance || 0);
    }, 0);
    
    const totalDuration = clientsOnDate.reduce((sum, client) => {
        return sum + (client.duration || 0);
    }, 0);
    
    return {
        totalDistance: Math.round(totalDistance * 10) / 10, // Arrondir à 1 décimale
        totalDuration,
        clientCount: clientsOnDate.length
    };
};

// Fonction pour calculer la matrice des distances
async function calculateDistanceMatrix(locations: { address: string; coordinates: number[] }[]) {
    const matrix: number[][] = Array(locations.length).fill(0).map(() => Array(locations.length).fill(0));
    
    for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
            const response = await directionsService.getDirections({
                profile: 'driving-traffic',
                waypoints: [
                    { coordinates: locations[i].coordinates as [number, number] },
                    { coordinates: locations[j].coordinates as [number, number] }
                ],
                // exclude: ['toll'] // Removed due to TypeScript type issues
            }).send();

            if (response.body.routes.length) {
                const duration = response.body.routes[0].duration / 60; // en minutes
                matrix[i][j] = duration;
                matrix[j][i] = duration;
            }
        }
    }
    return matrix;
}

// Fonction pour trouver l'itinéraire optimal
function findOptimalRoute(matrix: number[][], n: number): number[] {
    const visited = new Array(n).fill(false);
    const route = [0];
    visited[0] = true;

    for (let i = 1; i < n; i++) {
        const lastPoint = route[route.length - 1];
        let nextPoint = -1;
        let minDuration = Infinity;

        for (let j = 0; j < n; j++) {
            if (!visited[j] && matrix[lastPoint][j] < minDuration) {
                minDuration = matrix[lastPoint][j];
                nextPoint = j;
            }
        }

        route.push(nextPoint);
        visited[nextPoint] = true;
    }

    return route;
}

// Fonction pour obtenir l'itinéraire détaillé
async function getDetailedRoute(locations: { address: string; coordinates: number[] }[], route: number[]) {
    const waypoints = route.map(index => ({
        coordinates: locations[index].coordinates as [number, number],
        address: locations[index].address
    }));

    const response = await directionsService.getDirections({
        profile: 'driving-traffic',
        waypoints: waypoints.map(wp => ({ coordinates: wp.coordinates })),
        // exclude: ['toll'] // Removed due to TypeScript type issues
    }).send();

    if (!response.body.routes.length) {
        throw new Error('Impossible de calculer l\'itinéraire détaillé');
    }

    return {
        waypoints: waypoints,
        route: response.body.routes[0],
        totalDuration: Math.round(response.body.routes[0].duration / 60), // minutes
        totalDistance: Math.round(response.body.routes[0].distance / 100) / 10 // km
    };
}

router.post('/', async (req: Request, res: Response) => {
    try {
        const { 
            address, 
            excludeDates = [], 
            specificDate = null,
            dateRange = null  // Nouvel attribut pour filtrer par intervalle de dates
        } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Adresse non fournie'
            });
        }

        // 1. Convertir l'adresse en coordonnées
        const geocodeResponse = await geocodingService.forwardGeocode({
            query: address,
            countries: ['ca'],
            limit: 1
        }).send();

        if (!geocodeResponse.body.features.length) {
            return res.status(404).json({
                success: false,
                error: `Adresse non trouvée : ${address}`
            });
        }

        const sourceCoordinates = geocodeResponse.body.features[0].geometry.coordinates;
        const [sourceLng, sourceLat] = sourceCoordinates;

        // 2. Configurer la plage de dates pour la recherche
        const currentDate = new Date();
        let startDate, endDate;
        
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            // Utiliser l'intervalle de dates fourni par l'utilisateur
            startDate = new Date(dateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Par défaut: rechercher dans les 30 prochains jours
            startDate = new Date(currentDate);
            
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
        }

        // 3. Récupérer tous les rendez-vous futurs
        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: "L24K8X13MB1A7"
        });

        // 4. OPTIMISATION: Récupérer tous les clients de MongoDB avec leurs coordonnées en une seule requête
        const bookingCustomerIds: string[] = [];
        const bookingsMap = new Map<string, any[]>();
        
        for await (const booking of bookingsResponse) {
            if (booking.customerId && booking.startAt) {
                const bookingDate = new Date(booking.startAt);
                const dateString = bookingDate.toISOString().split('T')[0];
                
                // Si on cherche une date spécifique et que ce n'est pas celle-ci, sauter
                if (specificDate && dateString !== specificDate) {
                    continue;
                }
                
                // Vérifier si cette date est exclue
                if (excludeDates.includes(dateString) && !specificDate) {
                    continue;
                }
                
                bookingCustomerIds.push(booking.customerId);
                
                if (!bookingsMap.has(booking.customerId)) {
                    bookingsMap.set(booking.customerId, []);
                }
                bookingsMap.get(booking.customerId)!.push({
                    id: booking.id,
                    startAt: booking.startAt,
                    bookingDate: dateString
                });
            }
        }

        if (bookingCustomerIds.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun rendez-vous trouvé dans cet intervalle de dates'
            });
        }

        // Récupérer tous les clients de MongoDB avec leurs coordonnées en une seule requête
        const clientsFromMongo = await Client.find({
            squareId: { $in: bookingCustomerIds },
            'coordinates.lng': { $exists: true, $ne: null },
            'coordinates.lat': { $exists: true, $ne: null },
            addressLine1: { $exists: true, $ne: '' }
        }).select('squareId givenName familyName phoneNumber addressLine1 coordinates city district');

        // Créer un map pour accéder rapidement aux clients par squareId
        const clientsMap = new Map<string, typeof clientsFromMongo[0]>();
        clientsFromMongo.forEach(client => {
            if (client.squareId) {
                clientsMap.set(client.squareId, client);
            }
        });

        // 5. OPTIMISATION: Pré-filtrer avec distance Haversine avant les appels API
        const MAX_STRAIGHT_DISTANCE_KM = 50; // Marge de sécurité pour pré-filtrage (50 km)
        
        const clientsWithBookings: {
            bookingId: string;
            customerId: string;
            customerName: string;
            address: string;
            coordinates: number[];
            startAt: string;
            bookingDate: string;
            distance: number | null;
            duration: number | null;
            phoneNumber?: string;
            city?: string;
            district?: string;
            haversineDistance: number; // Pour le tri initial
        }[] = [];

        // Map pour compter les clients par date
        const clientsByDate = new Map<string, number>();

        for (const [squareId, client] of clientsMap.entries()) {
            const bookings = bookingsMap.get(squareId) || [];
            
            if (!client.coordinates?.lng || !client.coordinates?.lat) {
                continue;
            }

            // Calculer la distance Haversine (rapide)
            const haversineDistance = calculateHaversineDistance(
                sourceLat,
                sourceLng,
                client.coordinates.lat,
                client.coordinates.lng
            );

            // Pré-filtrer: seulement les clients à moins de 50 km
            if (haversineDistance > MAX_STRAIGHT_DISTANCE_KM) {
                continue;
            }

            // Traiter tous les rendez-vous de ce client
            for (const booking of bookings) {
                // Compter les clients par date
                const dateString = booking.bookingDate;
                if (clientsByDate.has(dateString)) {
                    clientsByDate.set(dateString, clientsByDate.get(dateString)! + 1);
                } else {
                    clientsByDate.set(dateString, 1);
                }

                clientsWithBookings.push({
                    bookingId: booking.id || '',
                    customerId: squareId,
                    customerName: `${client.givenName || ''} ${client.familyName || ''}`.trim(),
                    address: client.addressLine1 || '',
                    coordinates: [client.coordinates.lng, client.coordinates.lat],
                    startAt: booking.startAt,
                    bookingDate: dateString,
                    distance: null, // Sera calculé plus tard
                    duration: null, // Sera calculé plus tard
                    phoneNumber: client.phoneNumber || undefined,
                    city: client.city || undefined,
                    district: client.district || undefined,
                    haversineDistance
                });
            }
        }

        if (clientsWithBookings.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun client avec rendez-vous trouvé dans cet intervalle de dates'
            });
        }

        // 6. OPTIMISATION: Trier par distance Haversine et limiter à 100 clients les plus proches
        clientsWithBookings.sort((a, b) => a.haversineDistance - b.haversineDistance);
        const topClients = clientsWithBookings.slice(0, 100); // Limiter à 100 pour éviter trop d'appels API

        // 7. OPTIMISATION: Calculer les distances réelles seulement pour les clients pré-filtrés
        const clientPromises = topClients.map(async (clientData) => {
            try {
                const directionsResponse = await directionsService.getDirections({
                    profile: 'driving-traffic',
                    waypoints: [
                        { coordinates: sourceCoordinates as [number, number] },
                        { coordinates: clientData.coordinates as [number, number] }
                    ],
                    // exclude: ['toll'] // Removed due to TypeScript type issues
                }).send();

                if (directionsResponse.body.routes.length) {
                    const distance = Math.round(directionsResponse.body.routes[0].distance / 100) / 10; // km
                    const duration = Math.round(directionsResponse.body.routes[0].duration / 60); // minutes
                    
                    return {
                        ...clientData,
                        distance,
                        duration
                    };
                }
                return null;
            } catch (error) {
                console.error(`Erreur pour ${clientData.customerName}:`, error);
                return null;
            }
        });

        const clientsWithRealDistances = (await Promise.all(clientPromises))
            .filter((client): client is NonNullable<typeof client> => client !== null);

        if (clientsWithRealDistances.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun client avec rendez-vous trouvé dans cet intervalle de dates'
            });
        }

        // 8. Trier par distance réelle et trouver le plus proche
        clientsWithRealDistances.sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        const nearestClient = clientsWithRealDistances[0];

        // Obtenir les dates uniques disponibles (pour le compteur de jours restants)
        const uniqueDates = [...new Set(clientsWithRealDistances.map(c => c.bookingDate))];
        const remainingDays = uniqueDates.length;

        // Nombre de clients à la date du client le plus proche
        const clientsOnSameDay = clientsByDate.get(nearestClient.bookingDate) || 0;

        // 9. Obtenir l'itinéraire détaillé vers ce client (déjà calculé, mais on le garde pour compatibilité)
        const directionResponse = await directionsService.getDirections({
            profile: 'driving-traffic',
            waypoints: [
                { coordinates: sourceCoordinates as [number, number] },
                { coordinates: nearestClient.coordinates as [number, number] }
            ],
            // exclude: ['toll'] // Removed due to TypeScript type issues
        }).send();

        // Calculer les statistiques pour la journée du client sélectionné
        const dailyStats = calculateDailyStats(clientsWithRealDistances, nearestClient.bookingDate);

        // 10. NOUVEAU: Calculer l'itinéraire optimisé pour tous les clients de cette journée
        let optimizedRoute = null;
        // Créer un map pour associer les adresses aux informations client (défini en dehors du try pour être accessible après)
        const clientInfoMap = new Map<string, { city?: string; district?: string }>();
        
        try {
            // Récupérer tous les clients de la même journée (avec leurs coordonnées déjà disponibles)
            const clientsOnSameDayList = clientsWithRealDistances.filter(
                client => client.bookingDate === nearestClient.bookingDate
            );
            
            // Remplir le map avec les informations des clients
            clientsOnSameDayList.forEach(client => {
                clientInfoMap.set(client.address, {
                    city: client.city,
                    district: client.district
                });
            });
            
            // Si nous avons des clients ce jour-là, calculer un itinéraire optimisé
            if (clientsOnSameDayList.length > 0) {
                // Obtenir les coordonnées du point de départ fixe
                const startPointResponse = await geocodingService.forwardGeocode({
                    query: STARTING_POINT,
                    countries: ['ca'],
                    limit: 1
                }).send();

                if (!startPointResponse.body.features.length) {
                    throw new Error(`Adresse de point de départ non trouvée : ${STARTING_POINT}`);
                }

                const startPointCoordinates = startPointResponse.body.features[0].geometry.coordinates;
                
                // Construire la liste des locations avec coordonnées (déjà disponibles!)
                
                const coordinates = [
                    {
                        address: STARTING_POINT,
                        coordinates: startPointCoordinates
                    },
                    ...clientsOnSameDayList.map(client => ({
                        address: client.address,
                        coordinates: client.coordinates
                    }))
                ];

                // Calculer la matrice des distances
                const matrix = await calculateDistanceMatrix(coordinates);
                
                // Trouver l'ordre optimal
                const optimalRoute = findOptimalRoute(matrix, coordinates.length);
                
                // Obtenir l'itinéraire détaillé
                const detailedRoute = await getDetailedRoute(coordinates, optimalRoute);
                
                optimizedRoute = {
                    waypoints: detailedRoute.waypoints,
                    totalDuration: detailedRoute.totalDuration,
                    totalDistance: detailedRoute.totalDistance
                };
            }
        } catch (error) {
            console.error("Erreur lors de l'optimisation de l'itinéraire:", error);
            // En cas d'erreur, on continue sans l'itinéraire optimisé
        }

        // Formater la date et l'heure du rendez-vous
        const bookingDate = new Date(nearestClient.startAt);
        const formattedDate = bookingDate.toLocaleDateString('fr-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        const formattedTime = bookingDate.toLocaleTimeString('fr-CA', {
            hour: '2-digit',
            minute: '2-digit'
        });

        res.json({
            success: true,
            data: {
                client: {
                    id: nearestClient.customerId,
                    name: nearestClient.customerName,
                    address: nearestClient.address,
                    phoneNumber: nearestClient.phoneNumber || undefined,
                    city: nearestClient.city || undefined,
                    district: nearestClient.district || undefined
                },
                booking: {
                    id: nearestClient.bookingId,
                    date: formattedDate,
                    time: formattedTime,
                    dateISO: nearestClient.startAt,
                    bookingDate: nearestClient.bookingDate
                },
                distance: {
                    value: nearestClient.distance,
                    unit: 'km'
                },
                duration: {
                    value: nearestClient.duration,
                    unit: 'minutes'
                },
                route: directionResponse.body.routes[0],
                statistics: {
                    clientsOnSameDay: clientsOnSameDay,
                    remainingDays: remainingDays,
                    dailyStats: {
                        totalDistance: dailyStats.totalDistance,
                        totalDuration: dailyStats.totalDuration,
                        clientCount: dailyStats.clientCount,
                        optimizedRoute: optimizedRoute ? {
                            totalDistance: optimizedRoute.totalDistance,
                            totalDuration: optimizedRoute.totalDuration,
                            waypoints: optimizedRoute.waypoints.map((wp, index) => {
                                // Pour le point de départ, pas de ville/district
                                if (index === 0) {
                                    return {
                                        address: wp.address
                                    };
                                }
                                // Pour les autres waypoints, récupérer les infos depuis le map
                                const clientInfo = clientInfoMap.get(wp.address);
                                return {
                                    address: wp.address,
                                    city: clientInfo?.city || undefined,
                                    district: clientInfo?.district || undefined
                                };
                            })
                        } : null
                    }
                },
                navigation: {
                    hasNext: remainingDays > 1,
                    processedDates: [...excludeDates, nearestClient.bookingDate],
                    allDates: Array.from(clientsByDate.keys()).sort(),
                    dateRange: dateRange ? {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate
                    } : null
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;