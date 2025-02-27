// routes/districtAnalysis.ts
import express from 'express';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import Client from '../models/Client';
import dotenv from 'dotenv';
import { findDistrictByPostalCode, extractPostalCode } from '../config/postalDistricts';

dotenv.config();

const router = express.Router();
const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);

interface NullableCoordinates {
    lng?: number | null;
    lat?: number | null;
}

// Liste des villes pour lesquelles on veut des quartiers détaillés
const DETAILED_CITIES = ['Montréal', 'Montreal', 'Laval'];

async function findPostalCodeFromAddress(address: string, coordinates: NullableCoordinates): Promise<string | null> {
    try {
        if (typeof coordinates.lng !== 'number' || typeof coordinates.lat !== 'number') {
            return null;
        }

        // D'abord essayer avec l'adresse si elle existe
        if (address) {
            const forwardResponse = await geocodingService.forwardGeocode({
                query: address,
                limit: 1,
                countries: ['ca'],
                types: ['address'],
                proximity: [coordinates.lng, coordinates.lat]
            }).send();

            if (forwardResponse.body.features?.[0]?.context) {
                const postalCode = forwardResponse.body.features[0].context
                    .find(c => c.id.startsWith('postcode.'))?.text;
                if (postalCode) return postalCode;
            }
        }

        // Si pas trouvé avec l'adresse, essayer avec les coordonnées
        const reverseResponse = await geocodingService.reverseGeocode({
            query: [coordinates.lng, coordinates.lat],
            limit: 1,
            countries: ['ca'],
            types: ['address']
        }).send();

        if (reverseResponse.body.features?.[0]?.context) {
            const postalCode = reverseResponse.body.features[0].context
                .find(c => c.id.startsWith('postcode.'))?.text;
            return postalCode || null;
        }

        return null;
    } catch (error) {
        console.error('Erreur lors de la recherche du code postal:', error);
        return null;
    }
}

function normalizeCity(city: string): string {
    const cityLower = city.toLowerCase();
    if (cityLower.includes('montreal') || cityLower.includes('montréal')) {
        return 'Montréal';
    }
    return city;
}

router.get('/api/district-analysis', async (req, res) => {
    try {
        const clients = await Client.find({
            'coordinates.lng': { $exists: true, $ne: null },
            'coordinates.lat': { $exists: true, $ne: null }
        });

        console.log(`Analyse de ${clients.length} clients`);
        const districtGroups = new Map();
        const unidentifiedClients = [];
        let totalProcessed = 0;
        let totalUnidentified = 0;

        for (const client of clients) {
            try {
                if (!client.coordinates?.lng || !client.coordinates?.lat ||
                    typeof client.coordinates.lng !== 'number' ||
                    typeof client.coordinates.lat !== 'number') {
                    unidentifiedClients.push({
                        id: client._id,
                        name: `${client.givenName} ${client.familyName}`,
                        address: client.addressLine1,
                        reason: "Coordonnées manquantes ou invalides"
                    });
                    totalUnidentified++;
                    continue;
                }

                // Obtenir d'abord la ville via Mapbox
                const cityResponse = await geocodingService.reverseGeocode({
                    query: [client.coordinates.lng, client.coordinates.lat],
                    types: ['place'],
                    limit: 1,
                    countries: ['ca']
                }).send();

                let city = 'Unknown';
                if (cityResponse.body.features && cityResponse.body.features.length > 0) {
                    city = normalizeCity(cityResponse.body.features[0].text);
                }

                // Pour Montréal et Laval, utiliser le code postal
                if (DETAILED_CITIES.some(c => normalizeCity(c) === city)) {
                    let postalCode = client.addressLine1 ? extractPostalCode(client.addressLine1) : null;
                    if (!postalCode) {
                        postalCode = await findPostalCodeFromAddress(client.addressLine1 || '', client.coordinates);
                    }

                    if (postalCode) {
                        const districtInfo = findDistrictByPostalCode(postalCode);
                        if (districtInfo) {
                            const district = `${districtInfo.city}-${districtInfo.neighborhood}`;
                            if (!districtGroups.has(district)) {
                                districtGroups.set(district, {
                                    city: districtInfo.city,
                                    neighborhood: districtInfo.neighborhood,
                                    clients: [],
                                    count: 0
                                });
                            }

                            const group = districtGroups.get(district);
                            group.clients.push({
                                id: client._id,
                                name: `${client.givenName} ${client.familyName}`,
                                address: client.addressLine1,
                                coordinates: {
                                    lng: client.coordinates.lng,
                                    lat: client.coordinates.lat
                                }
                            });
                            group.count++;
                            totalProcessed++;
                            continue;
                        }
                    }
                }
                // Pour les autres villes, créer un district avec la ville comme quartier
                else if (city !== 'Unknown') {
                    const district = `${city}-${city}`;
                    if (!districtGroups.has(district)) {
                        districtGroups.set(district, {
                            city: city,
                            neighborhood: city,
                            clients: [],
                            count: 0
                        });
                    }

                    const group = districtGroups.get(district);
                    group.clients.push({
                        id: client._id,
                        name: `${client.givenName} ${client.familyName}`,
                        address: client.addressLine1,
                        coordinates: {
                            lng: client.coordinates.lng,
                            lat: client.coordinates.lat
                        }
                    });
                    group.count++;
                    totalProcessed++;
                    continue;
                }

                // Si on arrive ici, on n'a pas pu identifier le district
                unidentifiedClients.push({
                    id: client._id,
                    name: `${client.givenName} ${client.familyName}`,
                    address: client.addressLine1,
                    coordinates: {
                        lng: client.coordinates.lng,
                        lat: client.coordinates.lat
                    },
                    reason: "Ville non identifiée"
                });
                totalUnidentified++;

            } catch (error) {
                console.error(`Erreur pour le client ${client._id}:`, error);
                unidentifiedClients.push({
                    id: client._id,
                    name: `${client.givenName} ${client.familyName}`,
                    address: client.addressLine1,
                    reason: "Erreur lors de la géocodification"
                });
                totalUnidentified++;
            }
        }

        const districts = Array.from(districtGroups.entries()).map(([key, value]) => ({
            id: key,
            ...value
        }));

        console.log(`Analyse terminée:
            Total traité: ${totalProcessed}
            Non identifiés: ${totalUnidentified}
            Districts trouvés: ${districts.length}`);

        res.json({
            districts,
            unidentifiedClients,
            stats: {
                totalProcessed,
                totalUnidentified,
                totalDistrictsFound: districts.length
            }
        });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de l\'analyse des districts' });
    }
});

export default router;