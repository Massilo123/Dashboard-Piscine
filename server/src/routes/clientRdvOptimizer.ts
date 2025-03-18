import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

router.post('/', async (req: Request, res: Response) => {
    try {
        const { address, excludeDates = [] } = req.body;

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

        // 2. Obtenir la date actuelle pour filtrer seulement les rendez-vous futurs
        const currentDate = new Date();
        
        // On cherche d'abord les rendez-vous pour aujourd'hui
        const todayStart = new Date(currentDate);
        todayStart.setHours(0, 0, 0, 0);
        
        const todayEnd = new Date(currentDate);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Ensuite, on cherche pour les 30 prochains jours
        const futureDate = new Date();
        futureDate.setDate(currentDate.getDate() + 30);

        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: currentDate.toISOString(),
            startAtMax: futureDate.toISOString(),
            locationId: "L24K8X13MB1A7"
        });

        // Récupérer les clients avec rendez-vous pour aujourd'hui
        const todayBookings = await squareClient.bookings.list({
            startAtMin: todayStart.toISOString(),
            startAtMax: todayEnd.toISOString(),
            locationId: "L24K8X13MB1A7"
        });
        
        // Compter les rendez-vous valides d'aujourd'hui (ceux qui ont un client avec une adresse)
        let todayValidBookingsCount = 0;
        for await (const booking of todayBookings) {
            if (booking.customerId) {
                try {
                    const customerResponse = await squareClient.customers.get({
                        customerId: booking.customerId
                    });
                    
                    if (customerResponse.customer && customerResponse.customer.address?.addressLine1) {
                        todayValidBookingsCount++;
                    }
                } catch (error) {
                    console.error(`Erreur récupération client ${booking.customerId}:`, error);
                }
            }
        }

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

        for await (const booking of bookingsResponse) {
            if (booking.customerId && booking.startAt) {
                // Vérifier si cette date a déjà été exclue
                const bookingDate = new Date(booking.startAt);
                const dateString = bookingDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
                
                if (processedDates.has(dateString)) {
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
                error: 'Aucun client avec rendez-vous futur trouvé'
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

        // 5. Obtenir l'itinéraire détaillé vers ce client
        const directionResponse = await directionsService.getDirections({
            profile: 'driving-traffic',
            waypoints: [
                { coordinates: sourceCoordinates as [number, number] },
                { coordinates: nearestClient.coordinates as [number, number] }
            ],
            exclude: ['toll']
        }).send();

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
                    totalBookingsToday: todayValidBookingsCount,
                    remainingDays: remainingDays
                },
                navigation: {
                    hasNext: remainingDays > 1,
                    processedDates: [...processedDates.keys(), nearestClient.bookingDate]
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