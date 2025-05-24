import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';
import NodeCache from 'node-cache';

// Cache avec TTL très court pour synchronisation instantanée
const routeCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

// Interface pour les détails de réservation
interface BookingDetail {
    bookingId: string;
    customerId: string;
    customerName: string;
    address: string;
    startAt: string;
}

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

// Point de départ fixe
const STARTING_POINT = "1829 rue capitol";

// Fonction pour invalider le cache des routes
const invalidateRouteCache = () => {
    routeCache.flushAll();
    console.log('🗑️ Cache des routes invalidé - données fraîches garanties');
};

// Fonction de récupération et validation en temps réel des rendez-vous pour une date
const getValidBookingsForDate = async (date: string, forceRefresh: boolean = false) => {
    const cacheKey = `bookings_date_${date}`;
    
    // Si forceRefresh, ignorer le cache
    if (!forceRefresh) {
        const cached = routeCache.get(cacheKey);
        if (cached && Date.now() - (cached as any).timestamp < 10000) {
            console.log('📋 Utilisation du cache pour la date (< 10s)');
            return (cached as any).data;
        }
    }

    try {
        console.log(`🔄 Récupération fraîche des rendez-vous pour ${date}...`);
        
        const requestedDate = new Date(date);
        
        // Définir les bornes de recherche pour la journée complète en UTC
        const startDate = new Date(Date.UTC(
            requestedDate.getUTCFullYear(),
            requestedDate.getUTCMonth(),
            requestedDate.getUTCDate(),
            4, 0, 0, 0
        ));

        const endDate = new Date(Date.UTC(
            requestedDate.getUTCFullYear(),
            requestedDate.getUTCMonth(),
            requestedDate.getUTCDate() + 1,
            3, 59, 59, 999
        ));

        console.log('Recherche des réservations entre:', startDate.toISOString(), 'et', endDate.toISOString());

        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: "L24K8X13MB1A7"
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
                    bookingData.status === 'ACCEPTED' && 
                    bookingData.customerId &&
                    bookingData.startAt) {
                    
                    // Vérifier que la date correspond toujours
                    const bookingDate = new Date(bookingData.startAt);
                    if (bookingDate >= startDate && bookingDate <= endDate) {
                        validBookings.push(bookingData);
                        console.log(`✅ Rendez-vous ${booking.id} validé pour ${date}`);
                    }
                } else {
                    console.log(`⚠️ Rendez-vous ${booking.id} ignoré - statut: ${bookingData?.status || 'unknown'}`);
                }
            } catch (bookingError) {
                console.log(`❌ Rendez-vous ${booking.id} ignoré - probablement supprimé/annulé`);
            }
        }

        console.log(`📊 ${validBookings.length} rendez-vous valides trouvés pour ${date}`);

        const bookingDetails: BookingDetail[] = [];
        
        for (const booking of validBookings) {
            if (booking.customerId) {
                try {
                    // RE-VÉRIFIER que le client existe toujours
                    const customerResponse = await squareClient.customers.get({
                        customerId: booking.customerId
                    });

                    if (customerResponse.customer && customerResponse.customer.address?.addressLine1) {
                        bookingDetails.push({
                            bookingId: booking.id || '',
                            customerId: booking.customerId || '',
                            customerName: `${customerResponse.customer.givenName || ''} ${customerResponse.customer.familyName || ''}`.trim(),
                            address: customerResponse.customer.address.addressLine1,
                            startAt: booking.startAt || ''
                        });
                        console.log(`✅ Client ${customerResponse.customer.givenName} ${customerResponse.customer.familyName} ajouté`);
                    }
                } catch (error) {
                    console.error(`❌ Client ${booking.customerId} ignoré - probablement supprimé:`, error);
                }
            }
        }

        // Mettre en cache pour 10 secondes maximum
        const result = {
            data: bookingDetails,
            timestamp: Date.now()
        };
        
        routeCache.set(cacheKey, result);
        console.log(`✅ ${bookingDetails.length} détails de rendez-vous mis en cache pour ${date}`);
        
        return bookingDetails;
        
    } catch (error) {
        console.error('❌ Erreur récupération rendez-vous pour date:', error);
        throw error;
    }
};

// Route principale pour optimisation d'adresses génériques
router.post('/', async (req: Request, res: Response) => {
    try {
        const { addresses, forceRefresh = false } = req.body;

        console.log(`🚀 Optimisation d'adresses - forceRefresh: ${forceRefresh}`);

        if (forceRefresh) {
            invalidateRouteCache();
        }

        if (!Array.isArray(addresses) || addresses.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Liste d\'adresses invalide'
            });
            return;
        }

        // 1. Convertir toutes les adresses en coordonnées (incluant le point de départ)
        const allAddresses = [STARTING_POINT, ...addresses];
        const coordinates = await Promise.all(
            allAddresses.map(async (address) => {
                const response = await geocodingService.forwardGeocode({
                    query: address,
                    countries: ['ca'],
                    limit: 1
                }).send();

                if (!response.body.features.length) {
                    throw new Error(`Adresse non trouvée : ${address}`);
                }

                return {
                    address,
                    coordinates: response.body.features[0].geometry.coordinates
                };
            })
        );

        // 2. Calculer la matrice des distances
        const matrix = await calculateDistanceMatrix(coordinates);

        // 3. Trouver le meilleur ordre
        const optimalRoute = findOptimalRoute(matrix, coordinates.length);

        // 4. Obtenir l'itinéraire détaillé
        const finalRoute = await getDetailedRoute(coordinates, optimalRoute);

        console.log(`✅ Optimisation terminée - ${coordinates.length} points`);

        res.json({
            success: true,
            data: {
                route: finalRoute,
                totalDuration: finalRoute.totalDuration,
                totalDistance: finalRoute.totalDistance,
                waypoints: finalRoute.waypoints,
                // NOUVEAUX champs pour la synchronisation
                freshTimestamp: Date.now(),
                cacheStatus: forceRefresh ? 'forced_fresh' : 'fresh',
                syncInfo: {
                    totalAddressesProcessed: coordinates.length,
                    lastSyncTime: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur optimisation adresses:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

// Route pour optimisation des rendez-vous d'une date spécifique
router.post('/bookings', async (req: Request, res: Response) => {
    try {
        const { date, forceRefresh = false } = req.body;

        console.log(`🚀 Optimisation rendez-vous pour ${date} - forceRefresh: ${forceRefresh}`);

        if (forceRefresh) {
            invalidateRouteCache();
        }

        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Date non fournie'
            });
        }

        // Utiliser la fonction de validation temps réel
        const bookingDetails = await getValidBookingsForDate(date, forceRefresh);

        if (bookingDetails.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Aucune adresse valide trouvée pour les rendez-vous de cette date',
                syncInfo: {
                    totalBookingsChecked: 0,
                    validBookingsFound: 0,
                    lastSyncTime: new Date().toISOString()
                }
            });
            return;
        }

        // Optimiser les adresses trouvées
        const allAddresses = [STARTING_POINT, ...bookingDetails.map(b => b.address)];
        const coordinates = await Promise.all(
            allAddresses.map(async (address) => {
                const response = await geocodingService.forwardGeocode({
                    query: address,
                    countries: ['ca'],
                    limit: 1
                }).send();

                if (!response.body.features.length) {
                    throw new Error(`Adresse non trouvée : ${address}`);
                }

                return {
                    address,
                    coordinates: response.body.features[0].geometry.coordinates
                };
            })
        );

        const matrix = await calculateDistanceMatrix(coordinates);
        const optimalRoute = findOptimalRoute(matrix, coordinates.length);
        const finalRoute = await getDetailedRoute(coordinates, optimalRoute);

        // Enrichir l'itinéraire avec les informations de rendez-vous
        const routeWithBookings = {
            ...finalRoute,
            waypoints: finalRoute.waypoints.map((wp, index) => {
                if (index === 0) return { ...wp, type: 'starting_point' };
                
                const bookingDetail = bookingDetails.find(b => b.address === wp.address);
                if (!bookingDetail) return wp;

                return {
                    ...wp,
                    type: 'booking',
                    customerName: bookingDetail.customerName,
                    startAt: bookingDetail.startAt
                };
            })
        };

        console.log(`✅ Optimisation terminée pour ${date} - ${bookingDetails.length} rendez-vous`);

        res.json({
            success: true,
            data: {
                ...routeWithBookings,
                // NOUVEAUX champs pour la synchronisation
                freshTimestamp: Date.now(),
                cacheStatus: forceRefresh ? 'forced_fresh' : 'fresh',
                syncInfo: {
                    totalBookingsChecked: bookingDetails.length,
                    validBookingsFound: bookingDetails.length,
                    lastSyncTime: new Date().toISOString(),
                    requestedDate: date
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur optimisation rendez-vous:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

// Route pour forcer l'invalidation du cache
router.post('/invalidate-cache', async (req: Request, res: Response) => {
    try {
        invalidateRouteCache();
        res.json({
            success: true,
            message: 'Cache des routes invalidé avec succès'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de l\'invalidation du cache'
        });
    }
});

// Route pour vérifier les rendez-vous d'une date spécifique
router.post('/check-date', async (req: Request, res: Response) => {
    try {
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Date manquante'
            });
        }

        // Forcer une vérification fraîche
        const bookingDetails = await getValidBookingsForDate(date, true);
        
        res.json({
            success: true,
            data: {
                date: date,
                totalBookings: bookingDetails.length,
                bookings: bookingDetails.map(b => ({
                    customerName: b.customerName,
                    address: b.address,
                    startAt: b.startAt
                })),
                lastCheckTime: new Date().toISOString()
            }
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de la vérification'
        });
    }
});

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
        exclude: ['toll']
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

export default router;