// syncRoutes.ts
import { Router } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
import { exec } from 'child_process';

const router = Router();

router.post('/sync-square-clients', async (req, res) => {
    try {
        const customers = await squareClient.customers.list();
        const { geocodeClient } = await import('../utils/geocodeClient');
        
        for await (const customer of customers) {
            if (customer.id) {
                const updatedClient = await Client.findOneAndUpdate(
                    { squareId: customer.id },
                    {
                        givenName: customer.givenName || '',
                        familyName: customer.familyName || '',
                        phoneNumber: customer.phoneNumber || '',
                        addressLine1: customer.address?.addressLine1 || '',
                        squareId: customer.id
                    },
                    { upsert: true, new: true }
                );

                // Géocoder automatiquement le client s'il a une adresse et pas de coordonnées
                if (updatedClient && updatedClient.addressLine1 && updatedClient.addressLine1.trim() !== '') {
                    const hasCoordinates = updatedClient.coordinates && 
                        typeof updatedClient.coordinates === 'object' &&
                        updatedClient.coordinates !== null &&
                        'lng' in updatedClient.coordinates &&
                        'lat' in updatedClient.coordinates &&
                        updatedClient.coordinates.lng != null &&
                        updatedClient.coordinates.lat != null;

                    if (!hasCoordinates) {
                        // Géocoder en arrière-plan (ne pas attendre)
                        geocodeClient(updatedClient._id.toString()).catch(err => {
                            console.error(`Erreur lors du géocodage pour ${customer.givenName}:`, err);
                        });
                        
                        // Petit délai pour éviter de surcharger l'API
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
        }

        res.json({ success: true, message: 'Synchronisation terminée. Géocodage en cours...' });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Erreur inconnue' 
        });
    }
});

export default router;