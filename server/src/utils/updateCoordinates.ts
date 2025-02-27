import mongoose from 'mongoose';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import Client from '../models/Client';
import dotenv from 'dotenv';

dotenv.config();

const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);

const updateCoordinates = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connecté à MongoDB');

        // Récupérer tous les clients qui ont une adresse
        const clients = await Client.find({
            addressLine1: { $exists: true, $ne: '' }
        });

        console.log(`Mise à jour des coordonnées pour ${clients.length} clients`);

        for (const client of clients) {
            if (!client.addressLine1) continue;

            try {
                const response = await geocodingService.forwardGeocode({
                    query: client.addressLine1,
                    countries: ['ca'],
                    limit: 1,
                    types: ['address']
                }).send();

                if (response.body.features && response.body.features.length > 0) {
                    const coordinates = response.body.features[0].geometry.coordinates;
                    
                    await Client.updateOne(
                        { _id: client._id },
                        { 
                            $set: {
                                coordinates: {
                                    lng: coordinates[0],
                                    lat: coordinates[1]
                                }
                            }
                        }
                    );

                    console.log(`Coordonnées mises à jour pour ${client.givenName} (${client.addressLine1})`);
                } else {
                    console.log(`Aucune coordonnée trouvée pour ${client.givenName} (${client.addressLine1})`);
                }
            } catch (error) {
                console.error(`Erreur pour ${client.givenName}:`, error);
            }

            // Petit délai pour éviter de surcharger l'API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Mise à jour terminée');
        process.exit(0);

    } catch (error) {
        console.error('Erreur:', error);
        process.exit(1);
    }
};

updateCoordinates();