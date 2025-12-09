// webhookRoutes.ts
import { Router, Request, Response } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
// Plus besoin des fonctions de cache - on utilise directement MongoDB maintenant

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

        // Géocoder automatiquement le client s'il a une adresse
        if (updatedClient && updatedClient.addressLine1 && updatedClient.addressLine1.trim() !== '') {
            const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
            geocodeAndExtractLocation(updatedClient._id.toString())
                .then((result) => {
                    // Plus besoin de mettre à jour le cache - city/district/sector sont déjà dans MongoDB
                    // Les routes lisent directement depuis MongoDB maintenant
                    console.log(`✅ Client géocodé et localisé: ${result.city}${result.district ? ` (${result.district})` : ''} [${result.sector}]`);
                })
                .catch(err => {
                    console.error(`Erreur lors du géocodage automatique pour ${customer.givenName}:`, err);
                });
        }

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
                console.log('🗑️ Client supprimé dans Square');
                if (data.object?.customer?.id) {
                    const client = await Client.findOne({ squareId: data.object.customer.id });
                    if (client) {
                        const clientId = client._id.toString();
                        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim();
                        console.log(`🗑️ Suppression du client ${clientId} (${clientName})`);
                        
                        // Plus besoin de retirer du cache - on utilise directement MongoDB maintenant
                        // Supprimer directement de MongoDB
                        await Client.deleteOne({ squareId: data.object.customer.id });
                        console.log(`✅ Client supprimé de MongoDB`);
                    } else {
                        console.log(`⚠️ Client avec squareId ${data.object.customer.id} non trouvé dans MongoDB`);
                    }
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