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
   phoneNumber: string;
   serviceType?: string;
   serviceVariationId?: string;
}

const router = Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

// Point de départ fixe
const STARTING_POINT = "1829 rue capitol";

router.post('/bookings', async (req: Request, res: Response) => {
    console.log('\n========================================');
    console.log('🚀 ROUTE /bookings APPELÉE');
    console.log('========================================\n');
    
    try {
        const { date } = req.body;
        console.log(`📅 Date reçue: ${date}`);

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

        const bookingsResponse = await squareClient.bookings.list({
            startAtMin: startDate.toISOString(),
            startAtMax: endDate.toISOString(),
            locationId: "L24K8X13MB1A7",
        });

        const bookingDetails: BookingDetail[] = [];
        
        for await (const booking of bookingsResponse) {
            // Ne traiter que les réservations avec un statut actif
            if (booking.status !== 'ACCEPTED' && booking.status !== 'PENDING') {
                continue;
            }

            if (booking.customerId) {
                try {
                    const customerResponse = await squareClient.customers.get({
                        customerId: booking.customerId
                    });

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const customer = customerResponse.customer as any;

                    if (customer && customer.address?.addressLine1) {
                        // Log de la structure complète pour voir où se trouve le numéro
                        // Fonction pour convertir les BigInt en string pour JSON.stringify
                        /* eslint-disable @typescript-eslint/no-explicit-any */
                        const sanitizeForJSON = (obj: any): string => {
                            if (obj === undefined || obj === null) {
                                return 'null';
                            }
                            try {
                                return JSON.stringify(obj, (_, value) =>
                                    typeof value === 'bigint' ? value.toString() : value
                                );
                            } catch {
                                return '{}';
                            }
                        };
                        
                        console.log('\n--- SQUARE DATA ---');
                        console.log(`Client: ${customer.givenName || 'N/A'} ${customer.familyName || ''}`);
                        console.log(`phoneNumber direct: ${customer.phoneNumber || 'UNDEFINED'}`);
                        console.log(`phones array:`, sanitizeForJSON(customer.phones));
                        console.log(`Tous les champs disponibles:`, Object.keys(customer));
                        console.log(`Structure complète JSON:`, sanitizeForJSON(customer));
                        console.log('--- FIN SQUARE DATA ---\n');

                        // Essayer plusieurs façons de récupérer le numéro de téléphone
                        let phoneNumber = customer.phoneNumber || '';
                        
                        // Si phoneNumber est vide, essayer de récupérer depuis phones array
                        if (!phoneNumber && customer.phones && Array.isArray(customer.phones) && customer.phones.length > 0) {
                            const firstPhone = customer.phones[0];
                            phoneNumber = firstPhone?.phoneNumber || firstPhone?.number || firstPhone?.phone_number || firstPhone?.value || '';
                        }
                        
                        // Si toujours vide, essayer d'autres champs possiblesx 
                        if (!phoneNumber) {
                            phoneNumber = customer.phone || customer.mobile || customer.telephone || customer.phone_number || '';
                        }
                        
                        // Log pour chaque client avec son numéro
                        console.log(`[TÉLÉPHONE] ${customer.givenName || 'Client'} - ${phoneNumber || 'NON DISPONIBLE'}`);

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const segments = (booking as any).appointmentSegments || [];
                        const serviceVariationId = segments[0]?.serviceVariationId || undefined;

                        const bookingDetail = {
                            bookingId: booking.id || '',
                            customerId: booking.customerId || '',
                            customerName: `${customer.givenName || ''} ${customer.familyName || ''}`.trim(),
                            address: customer.address.addressLine1,
                            startAt: booking.startAt || '',
                            phoneNumber: phoneNumber,
                            serviceVariationId
                        };
                        
                        bookingDetails.push(bookingDetail);
                    }
                } catch (error) {
                    console.error(`Erreur récupération client ${booking.customerId}:`, error);
                }
            }
        }

        // Batch-fetch des noms de service depuis le catalogue Square
        const serviceNames: Record<string, string> = {};
        const variationIds = [...new Set(bookingDetails.map(b => b.serviceVariationId).filter(Boolean))] as string[];
        if (variationIds.length > 0) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const catalogResponse = await squareClient.catalog.batchGet({
                    objectIds: variationIds,
                    includeRelatedObjects: true
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const objects: any[] = (catalogResponse as any).objects || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const relatedObjects: any[] = (catalogResponse as any).relatedObjects || [];
                // Construire un map id → nom pour les ITEM parents
                const itemNameMap: Record<string, string> = {};
                for (const obj of relatedObjects) {
                    if (obj.type === 'ITEM' && obj.itemData?.name) {
                        itemNameMap[obj.id] = obj.itemData.name;
                    }
                }
                for (const obj of objects) {
                    if (obj.type === 'ITEM_VARIATION') {
                        const parentId = obj.itemVariationData?.itemId;
                        const name = (parentId && itemNameMap[parentId]) || obj.itemVariationData?.name || '';
                        if (name) serviceNames[obj.id] = name;
                    }
                }
            } catch (err) {
                console.error('[CATALOG] Erreur batch-retrieve:', err);
            }
        }
        // Injecter serviceType dans chaque bookingDetail
        for (const bd of bookingDetails) {
            if (bd.serviceVariationId && serviceNames[bd.serviceVariationId]) {
                bd.serviceType = serviceNames[bd.serviceVariationId];
            }
        }

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
                
                // Normaliser les adresses pour le matching (enlever les espaces multiples, etc.)
                const normalizeAddress = (addr: string) => addr.trim().toLowerCase().replace(/\s+/g, ' ');
                const wpAddressNormalized = normalizeAddress(wp.address);
                
                const bookingDetail = bookingDetails.find(b => {
                    const bAddressNormalized = normalizeAddress(b.address);
                    return bAddressNormalized === wpAddressNormalized;
                });
                
                if (!bookingDetail) {
                    console.log(`[WARNING] Aucun bookingDetail trouvé pour: ${wp.address}`);
                    return wp;
                }

                const waypointResult = {
                    ...wp,
                    type: 'booking',
                    customerName: bookingDetail.customerName,
                    startAt: bookingDetail.startAt,
                    phoneNumber: bookingDetail.phoneNumber || undefined,
                    serviceType: bookingDetail.serviceType || undefined
                };
                
                // Log pour vérifier que le phoneNumber est bien ajouté
                console.log(`[WAYPOINT ${index}] ${waypointResult.customerName} - Téléphone: ${waypointResult.phoneNumber || 'NON DISPONIBLE'}`);

                return waypointResult;
            })
        };
        
        // Log final de tous les waypoints avec leurs numéros
        console.log('========================================');
        console.log('[WAYPOINTS FINAUX] Liste complète:');
        routeWithBookings.waypoints.forEach((wp, idx: number) => {
            if ('customerName' in wp && wp.customerName) {
                console.log(`  ${idx}. ${wp.customerName} - ${('phoneNumber' in wp && wp.phoneNumber) || 'NON DISPONIBLE'}`);
            }
        });
        console.log('========================================');


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

export default router;