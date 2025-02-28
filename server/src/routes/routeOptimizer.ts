import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import squareClient from '../config/square';


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

router.post('/', async (req: Request, res: Response) => {
   try {
       const { addresses } = req.body;

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

       res.json({
           success: true,
           data: {
               route: finalRoute,
               totalDuration: finalRoute.totalDuration,
               totalDistance: finalRoute.totalDistance,
               waypoints: finalRoute.waypoints
           }
       });

   } catch (error) {
       res.status(500).json({
           success: false,
           error: error instanceof Error ? error.message : 'Erreur inconnue'
       });
   }
});

router.post('/bookings', async (req: Request, res: Response) => {
    try {
        const { date } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Date non fournie'
            });
            
        }
        
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
            requestedDate.getUTCDate() + 1, // Ajouter un jour pour aller jusqu'à 4:59:59 le lendemain
            3, 59, 59, 999
        ));

        console.log('Recherche des réservations entre:', startDate.toISOString(), 'et', endDate.toISOString());

        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: "L24K8X13MB1A7",
            
        });

        console.log('Réservations reçues:', bookingsResponse);

        const bookingDetails: BookingDetail[] = [];
        
        for await (const booking of bookingsResponse) {
            const bookingDate = new Date(booking.startAt || '');
            console.log('Réservation date (UTC):', booking.startAt);
            console.log('En local:', bookingDate.toLocaleString());
            console.log('Date demandée:', date);
            console.log("StartAt reçu :", booking.startAt);
            

            if (booking.customerId) {
                try {
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
                    }
                } catch (error) {
                    console.error(`Erreur récupération client ${booking.customerId}:`, error);
                }
            }
        }

        console.log('Nombre de réservations trouvées:', bookingDetails.length);
        

        if (bookingDetails.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Aucune adresse valide trouvée pour les rendez-vous de cette date'
            });
            return;
        }

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

        res.json({
            success: true,
            data: routeWithBookings
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});


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