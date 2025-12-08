// webhookRoutes.ts
import { Router, Request, Response } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
import { 
  addClientToByCityCache,
  updateClientInByCityCache,
  removeClientFromByCityCache,
  addClientToForMapCache,
  updateClientInForMapCache,
  removeClientFromForMapCache
} from './clientByCityRoutes';

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

        // Vérifier si le client existe déjà
        const existingClient = await Client.findOne({ squareId: customer.id });
        const isNewClient = !existingClient;

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
            const { geocodeClient } = await import('../utils/geocodeClient');
            geocodeClient(updatedClient._id.toString())
                .then(() => {
                    // Après géocodage, mettre à jour le cache (ajouter si nouveau, mettre à jour si existant)
                    if (isNewClient) {
                        addClientToByCityCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de l\'ajout au cache by-city:', err);
                        });
                        addClientToForMapCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de l\'ajout au cache for-map:', err);
                        });
                    } else {
                        updateClientInByCityCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de la mise à jour du cache by-city:', err);
                        });
                        updateClientInForMapCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de la mise à jour du cache for-map:', err);
                        });
                    }
                })
                .catch(err => {
                    console.error(`Erreur lors du géocodage automatique pour ${customer.givenName}:`, err);
                    // Même si le géocodage échoue, essayer de mettre à jour le cache
                    if (isNewClient) {
                        addClientToByCityCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de l\'ajout au cache by-city:', err);
                        });
                        // For-map nécessite des coordonnées, donc on ne l'ajoute pas si le géocodage échoue
                    } else {
                        updateClientInByCityCache(updatedClient._id.toString()).catch(err => {
                            console.error('Erreur lors de la mise à jour du cache by-city:', err);
                        });
                        // For-map nécessite des coordonnées, donc on ne le met pas à jour si le géocodage échoue
                    }
                });
        } else {
            // Même sans adresse, essayer de mettre à jour le cache
            if (isNewClient) {
                addClientToByCityCache(updatedClient._id.toString()).catch(err => {
                    console.error('Erreur lors de l\'ajout au cache by-city:', err);
                });
                // For-map nécessite des coordonnées, donc on ne l'ajoute pas sans adresse
            } else {
                updateClientInByCityCache(updatedClient._id.toString()).catch(err => {
                    console.error('Erreur lors de la mise à jour du cache by-city:', err);
                });
                // For-map nécessite des coordonnées, donc on ne le met pas à jour sans adresse
            }
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
                        
                        // IMPORTANT: Retirer du cache AVANT de supprimer de MongoDB
                        try {
                            await removeClientFromByCityCache(clientId);
                            console.log(`✅ Client retiré du cache by-city`);
                        } catch (err) {
                            console.error('❌ Erreur lors de la suppression du cache by-city:', err);
                        }
                        
                        try {
                            await removeClientFromForMapCache(clientId);
                            console.log(`✅ Client retiré du cache for-map`);
                        } catch (err) {
                            console.error('❌ Erreur lors de la suppression du cache for-map:', err);
                        }
                        
                        // Supprimer de MongoDB après avoir retiré du cache
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