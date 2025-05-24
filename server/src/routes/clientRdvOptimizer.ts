import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';
import NodeCache from 'node-cache';

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

// Cache avec TTL très court pour synchronisation instantanée
const bookingCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

// Définir l'adresse fixe du point de départ
const STARTING_POINT = "1829 rue capitol";

// Interface pour les statistiques journalières
interface DailyStats {
    totalDistance: number;
    totalDuration: number;
    clientCount: number;
}

// Fonction pour invalider le cache
const invalidateCache = () => {
    bookingCache.flushAll();
    console.log('🗑️ Cache invalidé - données fraîches garanties');
};

// Fonction de récupération et validation en temps réel des rendez-vous
const getValidBookingsRealTime = async (locationId: string, startDate: Date, endDate: Date, forceRefresh: boolean = false) => {
    const cacheKey = `bookings_${locationId}_${startDate.getTime()}_${endDate.getTime()}`;
    
    // Si forceRefresh, ignorer le cache
    if (!forceRefresh) {
        const cached = bookingCache.get(cacheKey);
        if (cached && Date.now() - (cached as any).timestamp < 10000) {
            console.log('📋 Utilisation du cache (< 10s)');
            return (cached as any).data;
        }
    }

    try {
        console.log('🔄 Récupération fraîche des données Square...');
        
        // Récupérer tous les rendez-vous de Square
        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: locationId
        });

        const validBookings = [];
        
        // Valider chaque rendez-vous individuellement en temps réel
        for await (const booking of bookingsResponse) {
            try {
                // RE-VÉRIFIER chaque rendez-vous individuellement avec Square
                const currentBooking = await squareClient.bookings.get({
                    bookingId: booking.id!
                });

                const bookingData = currentBooking.booking;
                
                // Vérifications strictes - seulement les rendez-vous acceptés et valides
                if (bookingData && 
                    bookingData.status === 'ACCEPTED' && // Seulement les rendez-vous acceptés
                    bookingData.customerId &&
                    bookingData.startAt) {
                    
                    // Vérifier que la date est bien dans la plage demandée
                    const bookingDate = new Date(bookingData.startAt);
                    if (bookingDate >= startDate && bookingDate <= endDate) {
                        validBookings.push(bookingData);
                        console.log(`✅ Rendez-vous ${booking.id} validé`);
                    }
                } else {
                    console.log(`⚠️ Rendez-vous ${booking.id} ignoré - statut: ${bookingData?.status || 'unknown'}`);
                }
            } catch (bookingError) {
                // Si on ne peut pas récupérer le rendez-vous, il n'existe probablement plus
                console.log(`❌ Rendez-vous ${booking.id} ignoré - probablement supprimé/annulé`);
            }
        }

        // Mettre en cache pour 10 secondes maximum
        const result = {
            data: validBookings,
            timestamp: Date.now()
        };
        
        bookingCache.set(cacheKey, result);
        console.log(`✅ ${validBookings.length} rendez-vous valides récupérés et mis en cache`);
        
        return validBookings;
        
    } catch (error) {
        console.error('❌ Erreur récupération rendez-vous:', error);
        throw error;
    }
};

// Fonction pour calculer les statistiques d'une journée spécifique
const calculateDailyStats = (clients: any[], date: string): DailyStats => {
    const clientsOnDate = clients.filter(client => client.bookingDate === date);
    
    const totalDistance = clientsOnDate.reduce((sum, client) => {
        return sum + (client.distance || 0);
    }, 0);
    
    const totalDuration = clientsOnDate.reduce((sum, client) => {
        return sum + (client.duration || 0);
    }, 0);
    
    return {
        totalDistance: Math.round(totalDistance * 10) / 10,
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
                exclude: ['toll']
            }).send();

            if (response.body.routes.length) {
                const duration = response.body.routes[0].duration / 60;
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
        exclude: ['toll']
    }).send();

    if (!response.body.routes.length) {
        throw new Error('Impossible de calculer l\'itinéraire détaillé');
    }

    return {
        waypoints: waypoints,
        route: response.body.routes[0],
        totalDuration: Math.round(response.body.routes[0].duration / 60),
        totalDistance: Math.round(response.body.routes[0].distance / 100) / 10
    };
}

router.post('/', async (req: Request, res: Response) => {
    try {
        const { 
            address, 
            excludeDates = [], 
            specificDate = null,
            dateRange = null,
            forceRefresh = false // NOUVEAU: paramètre pour forcer la synchronisation
        } = req.body;

        console.log(`🚀 Début traitement - forceRefresh: ${forceRefresh}`);

        // Si forceRefresh est true, invalider tout le cache
        if (forceRefresh) {
            invalidateCache();
        }

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

        // 2. Configurer la plage de dates pour la recherche
        const currentDate = new Date();
        let startDate, endDate;
        
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            startDate = new Date(dateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
        } else {
            startDate = new Date(currentDate);
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
        }

        // 3. UTILISER LA VALIDATION TEMPS RÉEL
        const validBookings = await getValidBookingsRealTime("L24K8X13MB1A7", startDate, endDate, forceRefresh);

        // 4. Récupérer les informations des clients avec adresses pour tous les rendez-vous validés
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
        }[] = [];

        const processedDates = new Map<string, boolean>();
        excludeDates.forEach((date: string) => {
            processedDates.set(date, true);
        });

        const clientsByDate = new Map<string, number>();

        for (const booking of validBookings) {
            if (booking.customerId && booking.startAt) {
                const bookingDate = new Date(booking.startAt);
                const dateString = bookingDate.toISOString().split('T')[0];
                
                clientsByDate.set(dateString, (clientsByDate.get(dateString) || 0) + 1);
                
                if (specificDate && dateString !== specificDate) {
                    continue;
                }
                
                if (processedDates.has(dateString) && !specificDate) {
                    continue;
                }

                try {
                    // RE-VÉRIFIER que le client existe toujours
                    const customerResponse = await squareClient.customers.get({
                        customerId: booking.customerId
                    });

                    if (customerResponse.customer && customerResponse.customer.address?.addressLine1) {
                        const clientGeocodeResponse = await geocodingService.forwardGeocode({
                            query: customerResponse.customer.address.addressLine1,
                            countries: ['ca'],
                            limit: 1
                        }).send();

                        if (clientGeocodeResponse.body.features.length) {
                            const clientCoordinates = clientGeocodeResponse.body.features[0].geometry.coordinates;
                            
                            const directionsResponse = await directionsService.getDirections({
                                profile: 'driving-traffic',
                                waypoints: [
                                    { coordinates: sourceCoordinates as [number, number] },
                                    { coordinates: clientCoordinates as [number, number] }
                                ],
                                exclude: ['toll']
                            }).send();

                            let distance = null;
                            let duration = null;

                            if (directionsResponse.body.routes.length) {
                                distance = Math.round(directionsResponse.body.routes[0].distance / 100) / 10;
                                duration = Math.round(directionsResponse.body.routes[0].duration / 60);
                            }

                            clientsWithBookings.push({
                                bookingId: booking.id || '',
                                customerId: booking.customerId,
                                customerName: `${customerResponse.customer.givenName || ''} ${customerResponse.customer.familyName || ''}`.trim(),
                                address: customerResponse.customer.address.addressLine1,
                                coordinates: clientCoordinates,
                                startAt: booking.startAt,
                                bookingDate: dateString,
                                distance,
                                duration
                            });

                            console.log(`✅ Client ${customerResponse.customer.givenName} ${customerResponse.customer.familyName} ajouté`);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Client ${booking.customerId} ignoré - probablement supprimé:`, error);
                }
            }
        }

        if (clientsWithBookings.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun client avec rendez-vous VALIDE trouvé dans cet intervalle de dates'
            });
        }

        // 5. Trier les clients par distance et trouver le plus proche
        clientsWithBookings.sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        const nearestClient = clientsWithBookings[0];

        const uniqueDates = [...new Set(clientsWithBookings.map(c => c.bookingDate))];
        const remainingDays = uniqueDates.length;
        const clientsOnSameDay = clientsByDate.get(nearestClient.bookingDate) || 0;

        // 6. Obtenir l'itinéraire détaillé vers ce client
        const directionResponse = await directionsService.getDirections({
            profile: 'driving-traffic',
            waypoints: [
                { coordinates: sourceCoordinates as [number, number] },
                { coordinates: nearestClient.coordinates as [number, number] }
            ],
            exclude: ['toll']
        }).send();

        const dailyStats = calculateDailyStats(clientsWithBookings, nearestClient.bookingDate);

        // 7. Calculer l'itinéraire optimisé pour tous les clients de cette journée
        let optimizedRoute = null;
        try {
            const clientsOnSameDay = clientsWithBookings.filter(
                client => client.bookingDate === nearestClient.bookingDate
            );
            
            if (clientsOnSameDay.length > 0) {
                const clientAddresses = clientsOnSameDay.map(client => client.address);
                
                const startPointResponse = await geocodingService.forwardGeocode({
                    query: STARTING_POINT,
                    countries: ['ca'],
                    limit: 1
                }).send();

                if (!startPointResponse.body.features.length) {
                    throw new Error(`Adresse de point de départ non trouvée : ${STARTING_POINT}`);
                }

                const startPointCoordinates = startPointResponse.body.features[0].geometry.coordinates;
                const allAddresses = [STARTING_POINT, ...clientAddresses];
                
                const coordinates = await Promise.all(
                    allAddresses.map(async (addr, index) => {
                        if (index === 0) {
                            return {
                                address: addr,
                                coordinates: startPointCoordinates
                            };
                        }
                        
                        const response = await geocodingService.forwardGeocode({
                            query: addr,
                            countries: ['ca'],
                            limit: 1
                        }).send();

                        if (!response.body.features.length) {
                            throw new Error(`Adresse non trouvée : ${addr}`);
                        }

                        return {
                            address: addr,
                            coordinates: response.body.features[0].geometry.coordinates
                        };
                    })
                );

                const matrix = await calculateDistanceMatrix(coordinates);
                const optimalRoute = findOptimalRoute(matrix, coordinates.length);
                const detailedRoute = await getDetailedRoute(coordinates, optimalRoute);
                
                optimizedRoute = {
                    waypoints: detailedRoute.waypoints,
                    totalDuration: detailedRoute.totalDuration,
                    totalDistance: detailedRoute.totalDistance
                };
            }
        } catch (error) {
            console.error("❌ Erreur lors de l'optimisation de l'itinéraire:", error);
        }

        // 8. Formater la réponse
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

        console.log(`✅ Traitement terminé - Client le plus proche: ${nearestClient.customerName}`);

        res.json({
            success: true,
            data: {
                client: {
                    id: nearestClient.customerId,
                    name: nearestClient.customerName,
                    address: nearestClient.address
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
                            waypoints: optimizedRoute.waypoints.map(wp => ({
                                address: wp.address
                            }))
                        } : null
                    }
                },
                navigation: {
                    hasNext: remainingDays > 1,
                    processedDates: [...processedDates.keys(), nearestClient.bookingDate],
                    allDates: Array.from(clientsByDate.keys()).sort(),
                    dateRange: dateRange ? {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate
                    } : null
                },
                // NOUVEAUX champs pour la synchronisation
                freshTimestamp: Date.now(),
                cacheStatus: forceRefresh ? 'forced_fresh' : 'fresh',
                syncInfo: {
                    totalBookingsChecked: validBookings.length,
                    validBookingsFound: clientsWithBookings.length,
                    lastSyncTime: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur générale:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

// Route pour forcer l'invalidation du cache
router.post('/invalidate-cache', async (req: Request, res: Response) => {
    try {
        invalidateCache();
        res.json({
            success: true,
            message: 'Cache invalidé avec succès'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de l\'invalidation du cache'
        });
    }
});

// Route pour vérifier le statut d'un rendez-vous spécifique
router.post('/check-booking', async (req: Request, res: Response) => {
    try {
        const { bookingId } = req.body;
        
        if (!bookingId) {
            return res.status(400).json({
                success: false,
                error: 'ID de rendez-vous manquant'
            });
        }

        const bookingCheck = await squareClient.bookings.get({
            bookingId: bookingId
        });
        
        res.json({
            success: true,
            exists: !!bookingCheck.booking,
            status: bookingCheck.booking?.status,
            startAt: bookingCheck.booking?.startAt,
            customerId: bookingCheck.booking?.customerId
        });
        
    } catch (error) {
        res.json({
            success: false,
            exists: false,
            error: error instanceof Error ? error.message : 'Rendez-vous introuvable'
        });
    }
});

export default router;