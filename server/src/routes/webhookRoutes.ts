// webhookRoutes.ts
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import squareClient from '../config/square';
import Client from '../models/Client';

const router = Router();

// Fonction pour mettre à jour ou créer un client dans MongoDB
async function upsertClientInMongo(squareCustomerId: string) {
    try {
        // Récupérer les informations du client depuis Square
        const customerResponse = await squareClient.customers.get({
            customerId: squareCustomerId
        });

        if (!customerResponse.customer) {
            throw new Error('Client non trouvé dans Square');
        }

        const customer = customerResponse.customer;

        // Mettre à jour ou créer le client dans MongoDB
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

        // Lancer la mise à jour des coordonnées uniquement pour ce client
        exec(`npm run update-coords ${customer.id}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erreur lors de la mise à jour des coordonnées: ${error}`);
                return;
            }
            console.log(`Mise à jour des coordonnées pour le client ${customer.givenName}:`);
            console.log(stdout);
        });

    } catch (error) {
        console.error('Erreur lors de la mise à jour du client:', error);
        throw error;
    }
}

// Endpoint pour recevoir les webhooks de Square
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        console.log('Webhook reçu:', JSON.stringify(req.body, null, 2));
        const { type, data } = req.body;

        // Vérifier la signature du webhook (à implémenter pour la sécurité)
        // TODO: Ajouter la vérification de signature

        // Traiter les différents types d'événements
        switch (type) {
            case 'customer.created':
                console.log('Nouveau client créé dans Square');
                if (data.object?.customer?.id) {
                    await upsertClientInMongo(data.object.customer.id);
                }
                break;

            case 'customer.updated':
                console.log('Client mis à jour dans Square');
                if (data.object?.customer?.id) {
                    await upsertClientInMongo(data.object.customer.id);
                }
                break;

            case 'customer.deleted':
                console.log('Client supprimé dans Square');
                if (data.object?.customer?.id) {
                    await Client.deleteOne({ squareId: data.object.customer.id });
                }
                break;

            default:
                console.log(`Événement non géré: ${type}`);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erreur dans le webhook:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;