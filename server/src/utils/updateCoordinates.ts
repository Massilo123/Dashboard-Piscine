import mongoose from 'mongoose';
import mbxClient from '@mapbox/mapbox-sdk';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import Client from '../models/Client';
import dotenv from 'dotenv';

dotenv.config();

const baseClient = mbxClient({ accessToken: process.env.MAPBOX_TOKEN! });
const geocodingService = mbxGeocoding(baseClient);

// Récupère l'argument passé en ligne de commande (ID client s'il existe)
const clientId = process.argv[2];

const updateCoordinates = async (targetClientId?: string) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connecté à MongoDB');

        let clients;
        
        if (targetClientId) {
            // Mode ciblé: uniquement le client spécifié
            clients = await Client.find({
                squareId: targetClientId,
                addressLine1: { $exists: true, $ne: '' }
            });
            
            if (clients.length === 0) {
                console.log(`Aucun client trouvé avec l'ID ${targetClientId} ou adresse manquante`);
                process.exit(0);
            }
        } else {
            // Mode complet: tous les clients avec adresse
            clients = await Client.find({
                addressLine1: { $exists: true, $ne: '' }
            });
        }

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

            // N'ajoutez le délai que si nous traitons plusieurs clients
            if (!targetClientId) {
                // Petit délai pour éviter de surcharger l'API
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log('Mise à jour terminée');
        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('Erreur:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Démarrer la mise à jour avec l'ID client s'il est fourni
updateCoordinates(clientId);