import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

// Définir l'adresse fixe du point de départ
const STARTING_POINT = "1829 rue capitol";

// Interface pour les statistiques journalières
interface DailyStats {
    totalDistance: number;
    totalDuration: number;
    clientCount: number;
}

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

        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: "L24K8X13MB1A7"
        });

        // 3. Récupérer les informations des clients avec adresses pour tous les rendez-vous futurs
        const clientsWithBookings: {
            bookingId: string;
            customerId: string;
            customerName: string;
            address: string;
            coordinates: number[];
            startAt: string;
            bookingDate: string; // Date du rendez-vous (YYYY-MM-DD)
            distance: number | null;
            duration: number | null;
        }[] = [];

        // Map pour suivre les dates de rendez-vous déjà traitées
        const processedDates = new Map<string, boolean>();
        excludeDates.forEach((date: string) => {
            processedDates.set(date, true);
        });

        // Map pour compter les clients par date
        const clientsByDate = new Map<string, number>();

        for await (const booking of bookingsResponse) {
            if (booking.customerId && booking.startAt) {
                // Extraire la date du rendez-vous
                const bookingDate = new Date(booking.startAt);
                const dateString = bookingDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
                
                // Incrémenter le compteur pour cette date
                if (clientsByDate.has(dateString)) {
                    clientsByDate.set(dateString, clientsByDate.get(dateString)! + 1);
                } else {
                    clientsByDate.set(dateString, 1);
                }
                
                // Si on cherche une date spécifique et que ce n'est pas celle-ci, sauter ce rendez-vous
                if (specificDate && dateString !== specificDate) {
                    continue;
                }
                
                // Vérifier si cette date a déjà été exclue
                if (processedDates.has(dateString) && !specificDate) {
                    continue; // Sauter ce rendez-vous car sa date est exclue
                }

                try {
                    const customerResponse = await squareClient.customers.get({
                        customerId: booking.customerId
                    });

                    if (customerResponse.customer && customerResponse.customer.address?.addressLine1) {
                        // Obtenir les coordonnées du client
                        const clientGeocodeResponse = await geocodingService.forwardGeocode({
                            query: customerResponse.customer.address.addressLine1,
                            countries: ['ca'],
                            limit: 1
                        }).send();

                        if (clientGeocodeResponse.body.features.length) {
                            const clientCoordinates = clientGeocodeResponse.body.features[0].geometry.coordinates;
                            
                            // Calculer la distance et la durée entre l'adresse source et l'adresse du client
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
                                distance = Math.round(directionsResponse.body.routes[0].distance / 100) / 10; // km
                                duration = Math.round(directionsResponse.body.routes[0].duration / 60); // minutes
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
                        }
                    }
                } catch (error) {
                    console.error(`Erreur récupération client ${booking.customerId}:`, error);
                }
            }
        }

        if (clientsWithBookings.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun client avec rendez-vous trouvé dans cet intervalle de dates'
            });
        }

        // 4. Trier les clients par distance et trouver le plus proche
        clientsWithBookings.sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        const nearestClient = clientsWithBookings[0];

        // Obtenir les dates uniques disponibles (pour le compteur de jours restants)
        const uniqueDates = [...new Set(clientsWithBookings.map(c => c.bookingDate))];
        const remainingDays = uniqueDates.length;

        // Nombre de clients à la date du client le plus proche
        const clientsOnSameDay = clientsByDate.get(nearestClient.bookingDate) || 0;

        // 5. Obtenir l'itinéraire détaillé vers ce client
        const directionResponse = await directionsService.getDirections({
            profile: 'driving-traffic',
            waypoints: [
                { coordinates: sourceCoordinates as [number, number] },
                { coordinates: nearestClient.coordinates as [number, number] }
            ],
            exclude: ['toll']
        }).send();

        // Calculer les statistiques pour la journée du client sélectionné
        const dailyStats = calculateDailyStats(clientsWithBookings, nearestClient.bookingDate);

        // 6. NOUVEAU: Calculer l'itinéraire optimisé pour tous les clients de cette journée
        let optimizedRoute = null;
        try {
            // Récupérer tous les clients de la même journée
            const clientsOnSameDay = clientsWithBookings.filter(
                client => client.bookingDate === nearestClient.bookingDate
            );
            
            // Si nous avons des clients ce jour-là, calculer un itinéraire optimisé
            if (clientsOnSameDay.length > 0) {
                // Récupérer uniquement les adresses des clients
                const clientAddresses = clientsOnSameDay.map(client => client.address);
                
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
                
                // Ajouter le point de départ fixe au début de la liste
                const allAddresses = [STARTING_POINT, ...clientAddresses];
                
                // Convertir toutes les adresses en coordonnées
                const coordinates = await Promise.all(
                    allAddresses.map(async (addr, index) => {
                        // Pour l'adresse de départ, utiliser les coordonnées déjà obtenues
                        if (index === 0) {
                            return {
                                address: addr,
                                coordinates: startPointCoordinates
                            };
                        }
                        
                        // Pour les adresses clients, obtenir les coordonnées
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