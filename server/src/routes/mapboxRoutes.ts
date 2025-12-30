import { Router, Request, Response } from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import mbxDirections from '@mapbox/mapbox-sdk/services/directions';
import Client from '../models/Client';

const router = Router();

const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);
const directionsService = mbxDirections(baseClient);

router.post('/clients-nearby', async (req: Request, res: Response): Promise<void> => {
    try {
        const { address } = req.body;

        if (!address?.trim()) {
            res.status(400).json({
                success: false,
                error: 'Adresse non fournie'
            });
            return;
        }

        // Convertir l'adresse de recherche en coordonnées
        const sourceGeocode = await geocodingService.forwardGeocode({
            query: address,
            limit: 1,
            countries: ['ca']
        }).send();

        if (!sourceGeocode.body.features.length) {
            res.status(404).json({
                success: false,
                error: 'Adresse non trouvée'
            });
            return;
        }

        const sourceCoords = sourceGeocode.body.features[0].geometry.coordinates as [number, number];

        // Récupérer tous les clients avec coordonnées
        const clients = await Client.find({
            coordinates: { $exists: true },
            'coordinates.lng': { $exists: true },
            'coordinates.lat': { $exists: true }
        });

        // Calculer les distances en parallèle
        const clientPromises = clients.map(async (client) => {
            // Vérifier si le client a des coordonnées valides
            if (!client.coordinates?.lng || !client.coordinates?.lat) {
                return null;
            }

            try {
                const directionsResponse = await directionsService.getDirections({
                    profile: 'driving-traffic',
                    waypoints: [
                        { coordinates: sourceCoords },
                        { coordinates: [client.coordinates.lng, client.coordinates.lat] }
                    ]
                    // Note: exclude option removed due to TypeScript type issues
                } as any).send(); // eslint-disable-line @typescript-eslint/no-explicit-any

                if (directionsResponse.body.routes[0]) {
                    const duration = directionsResponse.body.routes[0].duration / 60;
                    
                    if (duration <= 10) {
                        return {
                            id: client._id,
                            name: `${client.givenName} ${client.familyName || ''}`.trim(),
                            address: client.addressLine1,
                            phoneNumber: client.phoneNumber,
                            distance: Math.round(directionsResponse.body.routes[0].distance / 100) / 10,
                            duration: Math.round(duration)
                        };
                    }
                }
                return null;
            } catch (error) {
                console.error(`Erreur pour ${client.givenName}:`, error);
                return null;
            }
        });

        const results = await Promise.all(clientPromises);
        const nearbyClients = results.filter((client): client is NonNullable<typeof client> => client !== null);

        // Si aucun client n'est trouvé
        if (nearbyClients.length === 0) {
            res.json({
                success: true,
                data: {
                    message: "Aucun client trouvé à proximité",
                    clients: []
                }
            });
            return;
        }

        res.json({
            success: true,
            data: {
                clients: nearbyClients.sort((a, b) => a.duration - b.duration)
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

// Nouvelle route pour rechercher des clients à proximité en utilisant des coordonnées directement
router.post('/clients-nearby-coordinates', async (req: Request, res: Response): Promise<void> => {
    try {
        const { coordinates } = req.body;

        if (!coordinates || typeof coordinates.lng !== 'number' || typeof coordinates.lat !== 'number') {
            res.status(400).json({
                success: false,
                error: 'Coordonnées non valides'
            });
            return;
        }

        const sourceCoords: [number, number] = [coordinates.lng, coordinates.lat];

        // Récupérer tous les clients avec coordonnées
        const clients = await Client.find({
            coordinates: { $exists: true },
            'coordinates.lng': { $exists: true },
            'coordinates.lat': { $exists: true }
        });

        // Calculer les distances en parallèle
        const clientPromises = clients.map(async (client) => {
            // Vérifier si le client a des coordonnées valides
            if (!client.coordinates?.lng || !client.coordinates?.lat) {
                return null;
            }

            try {
                const directionsResponse = await directionsService.getDirections({
                    profile: 'driving-traffic',
                    waypoints: [
                        { coordinates: sourceCoords },
                        { coordinates: [client.coordinates.lng, client.coordinates.lat] }
                    ]
                    // Note: exclude option removed due to TypeScript type issues
                } as any).send(); // eslint-disable-line @typescript-eslint/no-explicit-any

                if (directionsResponse.body.routes[0]) {
                    const duration = directionsResponse.body.routes[0].duration / 60;
                    
                    if (duration <= 10) {
                        return {
                            id: client._id,
                            name: `${client.givenName} ${client.familyName || ''}`.trim(),
                            address: client.addressLine1,
                            phoneNumber: client.phoneNumber,
                            distance: Math.round(directionsResponse.body.routes[0].distance / 100) / 10,
                            duration: Math.round(duration)
                        };
                    }
                }
                return null;
            } catch (error) {
                console.error(`Erreur pour ${client.givenName}:`, error);
                return null;
            }
        });

        const results = await Promise.all(clientPromises);
        const nearbyClients = results.filter((client): client is NonNullable<typeof client> => client !== null);

        // Si aucun client n'est trouvé
        if (nearbyClients.length === 0) {
            res.json({
                success: true,
                data: {
                    message: "Aucun client trouvé à proximité",
                    clients: []
                }
            });
            return;
        }

        res.json({
            success: true,
            data: {
                clients: nearbyClients.sort((a, b) => a.duration - b.duration)
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

// Route pour rechercher des clients par district
router.post('/clients-by-district', async (req: Request, res: Response): Promise<void> => {
    try {
        const { district } = req.body;

        if (!district?.trim()) {
            res.status(400).json({
                success: false,
                error: 'District non fourni'
            });
            return;
        }

        // Normaliser le nom du district
        const { normalizeDistrictName } = await import('../config/districts');
        const normalizedDistrict = normalizeDistrictName(district);

        if (!normalizedDistrict) {
            res.status(400).json({
                success: false,
                error: `District non reconnu: ${district}`
            });
            return;
        }

        // Rechercher tous les clients avec ce district et des coordonnées
        // Utiliser une regex pour une recherche insensible à la casse et aux variations
        const districtRegex = new RegExp(`^${normalizedDistrict.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const clients = await Client.find({
            district: districtRegex,
            coordinates: { $exists: true },
            'coordinates.lng': { $exists: true },
            'coordinates.lat': { $exists: true }
        });

        if (clients.length === 0) {
            res.json({
                success: true,
                data: {
                    message: `Aucun client trouvé dans le district: ${normalizedDistrict}`,
                    clients: []
                }
            });
            return;
        }

        // Retourner les clients avec leurs informations
        const clientsData = clients.map(client => ({
            id: client._id.toString(),
            name: `${client.givenName} ${client.familyName || ''}`.trim(),
            address: client.addressLine1 || '',
            phoneNumber: client.phoneNumber || '',
            coordinates: {
                lng: client.coordinates!.lng,
                lat: client.coordinates!.lat
            },
            district: client.district,
            city: client.city
        }));

        res.json({
            success: true,
            data: {
                clients: clientsData
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;