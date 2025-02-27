// syncRoutes.ts
import { Router } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
import { exec } from 'child_process';

const router = Router();

router.post('/sync-square-clients', async (req, res) => {
    try {
        const customers = await squareClient.customers.list();
        
        for await (const customer of customers) {
            if (customer.id) {
                await Client.findOneAndUpdate(
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
            }
        }

        // Lancer la mise à jour des coordonnées
        exec('npm run update-coords', (error, stdout, stderr) => {
            if (error) {
                console.error(`Erreur mise à jour coordonnées: ${error}`);
            }
            console.log(`Mise à jour coordonnées réussie: ${stdout}`);
        });

        res.json({ success: true, message: 'Synchronisation terminée' });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Erreur inconnue' 
        });
    }
});

export default router;