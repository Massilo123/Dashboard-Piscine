// webhookRoutes.ts
import { Router, Request, Response } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
// Plus besoin des fonctions de cache - on utilise directement MongoDB maintenant

const router = Router();

// Stocker les derniers webhooks reçus pour le debug (max 50)
const recentWebhooks: Array<{
    timestamp: string;
    type: string;
    data: any;
    processed: boolean;
    error?: string;
}> = [];

// Endpoint pour voir les derniers webhooks reçus (debug)
router.get('/webhook/debug', (req: Request, res: Response) => {
    console.log(`🔍 Debug webhook appelé - Total dans l'historique: ${recentWebhooks.length}`);
    const last20 = recentWebhooks.slice(-20).reverse();
    console.log(`📋 Retour des 20 derniers webhooks`);
    
    res.json({
        success: true,
        total: recentWebhooks.length,
        webhooks: last20,
        serverTime: new Date().toISOString()
    });
});

// Fonction pour mettre à jour ou créer un client dans MongoDB
async function upsertClientInMongo(squareCustomerId: string) {
    try {
        console.log(`🔍 Récupération du client ${squareCustomerId} depuis Square...`);
        
        // Récupérer les informations du client depuis Square
        const customerResponse = await squareClient.customers.get({
            customerId: squareCustomerId
        });

        if (!customerResponse.customer) {
            throw new Error(`Client ${squareCustomerId} non trouvé dans Square`);
        }

        const customer = customerResponse.customer;
        console.log(`📋 Données client reçues: ${customer.givenName || ''} ${customer.familyName || ''} (${customer.id})`);

        // Initialiser les champs de comptage de rendez-vous s'ils n'existent pas
        const clientData: any = {
            givenName: customer.givenName || '',
            familyName: customer.familyName || '',
            phoneNumber: customer.phoneNumber || '',
            addressLine1: customer.address?.addressLine1 || '',
            squareId: customer.id
        };

        // S'assurer que bookingCount et isFrequentClient sont initialisés
        // On ne les met pas à jour ici car ils seront mis à jour par les webhooks booking
        // Mais on s'assure qu'ils existent avec des valeurs par défaut
        const existingClient = await Client.findOne({ squareId: customer.id });
        if (!existingClient || existingClient.bookingCount === undefined) {
            clientData.bookingCount = 0;
            clientData.isFrequentClient = false;
        }

        // Mettre à jour ou créer le client dans MongoDB
        console.log(`💾 Sauvegarde du client dans MongoDB...`);
        const updatedClient = await Client.findOneAndUpdate(
            { squareId: customer.id },
            clientData,
            { upsert: true, new: true }
        );

        console.log(`✅ Client sauvegardé dans MongoDB: ${updatedClient._id}`);

        // Géocoder automatiquement le client s'il a une adresse (en arrière-plan, ne bloque pas)
        if (updatedClient && updatedClient.addressLine1 && updatedClient.addressLine1.trim() !== '') {
            const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
            geocodeAndExtractLocation(updatedClient._id.toString())
                .then((result) => {
                    console.log(`✅ Client géocodé et localisé: ${result.city}${result.district ? ` (${result.district})` : ''} [${result.sector}]`);
                })
                .catch(err => {
                    console.error(`⚠️ Erreur lors du géocodage automatique pour ${customer.givenName}:`, err);
                    // Le géocodage est optionnel, on ne fait pas échouer la création du client
                });
        } else {
            console.log(`ℹ️ Client sans adresse, pas de géocodage nécessaire`);
        }

        return updatedClient;

    } catch (error) {
        console.error(`❌ Erreur dans upsertClientInMongo pour ${squareCustomerId}:`, error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack}`);
            }
        }
        throw error;
    }
}

// Endpoint pour recevoir les webhooks de Square
router.post('/webhook', async (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    const webhookLog = {
        timestamp,
        type: req.body?.type || 'unknown',
        data: req.body,
        processed: false,
        error: undefined as string | undefined
    };
    
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔔 [${timestamp}] WEBHOOK REÇU`);
        console.log(`${'='.repeat(80)}`);
        console.log('📦 Body complet:', JSON.stringify(req.body, null, 2));
        const { type, data } = req.body;
        console.log(`📌 Type d'événement: ${type}`);
        
        // Ajouter à l'historique AVANT le traitement
        recentWebhooks.push(webhookLog);
        console.log(`📝 Webhook ajouté à l'historique (total: ${recentWebhooks.length})`);
        if (recentWebhooks.length > 50) {
            recentWebhooks.shift(); // Garder seulement les 50 derniers
            console.log(`📝 Historique limité à 50 webhooks`);
        }

        // Vérifier la signature du webhook (à implémenter pour la sécurité)
        // TODO: Ajouter la vérification de signature

        // Traiter les différents types d'événements
        switch (type) {
            case 'customer.created':
                console.log('👤 Nouveau client créé dans Square');
                if (data.object?.customer?.id) {
                    const customerId = data.object.customer.id;
                    console.log(`📋 Traitement du client ${customerId}...`);
                    try {
                        await upsertClientInMongo(customerId);
                        console.log(`✅ Client ${customerId} créé/mis à jour dans MongoDB avec succès`);
                    } catch (error) {
                        console.error(`❌ Erreur lors de la création du client ${customerId} dans MongoDB:`, error);
                        // Log détaillé de l'erreur
                        if (error instanceof Error) {
                            console.error(`   Message: ${error.message}`);
                            console.error(`   Stack: ${error.stack}`);
                        }
                        // Ne pas faire échouer le webhook - Square va retry de toute façon
                    }
                } else {
                    console.log(`⚠️ Événement customer.created sans customer.id:`, data.object);
                }
                break;

            case 'customer.updated':
                console.log('👤 Client mis à jour dans Square');
                if (data.object?.customer?.id) {
                    const customerId = data.object.customer.id;
                    console.log(`📋 Mise à jour du client ${customerId}...`);
                    try {
                        await upsertClientInMongo(customerId);
                        console.log(`✅ Client ${customerId} mis à jour dans MongoDB avec succès`);
                    } catch (error) {
                        console.error(`❌ Erreur lors de la mise à jour du client ${customerId} dans MongoDB:`, error);
                        // Ne pas faire échouer le webhook
                    }
                } else {
                    console.log(`⚠️ Événement customer.updated sans customer.id:`, data.object);
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

            case 'booking.created':
            case 'booking.updated':
                console.log(`\n${'='.repeat(80)}`);
                console.log(`📅 ÉVÉNEMENT BOOKING: ${type}`);
                console.log(`${'='.repeat(80)}`);
                console.log(`📋 Structure complète de data:`, JSON.stringify(data, null, 2));
                console.log(`📋 Données booking reçues:`, JSON.stringify(data.object?.booking, null, 2));
                
                // Vérifier différentes structures possibles
                const booking = data.object?.booking || data.booking || data.object;
                const customerId = booking?.customerId || data.object?.customerId;
                
                console.log(`🔍 Analyse de la structure:`);
                console.log(`   - data.object?.booking existe: ${!!data.object?.booking}`);
                console.log(`   - data.booking existe: ${!!data.booking}`);
                console.log(`   - customerId trouvé: ${customerId || 'NON TROUVÉ'}`);
                
                if (customerId) {
                    const bookingId = booking?.id || data.object?.booking?.id;
                    const bookingStatus = booking?.status || data.object?.booking?.status;
                    
                    console.log(`🔍 Détails du booking:`);
                    console.log(`   - Booking ID: ${bookingId}`);
                    console.log(`   - Customer ID: ${customerId}`);
                    console.log(`   - Status: ${bookingStatus}`);
                    console.log(`   - Start At: ${data.object.booking.startAt}`);
                    
                    // Vérifier si le booking est annulé
                    const isCancelled = bookingStatus && String(bookingStatus) === 'CANCELLED';
                    
                    if (isCancelled && type === 'booking.updated') {
                        console.log(`⚠️ Booking annulé, recompter tous les rendez-vous...`);
                        // Si annulé, recompter depuis l'API
                        const { updateClientBookingCount } = await import('../utils/updateBookingCounts');
                        try {
                            const result = await updateClientBookingCount(customerId);
                            console.log(`✅ Compteur recalculé après annulation: ${result.bookingCount} rendez-vous`);
                        } catch (error) {
                            console.error(`❌ Erreur lors du recalcul:`, error);
                        }
                    } else if (type === 'booking.created') {
                        // Mettre à jour le compteur pour ce client
                        const { updateClientBookingCount } = await import('../utils/updateBookingCounts');
                        try {
                            console.log(`🔄 Mise à jour du compteur pour le client ${customerId}...`);
                            const result = await updateClientBookingCount(customerId);
                            console.log(`✅ Compteur mis à jour pour le client ${customerId}: ${result.bookingCount} rendez-vous (fréquent: ${result.isFrequentClient})`);
                            webhookLog.processed = true;
                        } catch (error) {
                            console.error(`❌ Erreur lors de la mise à jour du compteur pour ${customerId}:`, error);
                            webhookLog.error = error instanceof Error ? error.message : 'Erreur inconnue';
                        }
                    } else if (type === 'booking.updated') {
                        // Pour les mises à jour, recompter directement
                        const { updateClientBookingCount } = await import('../utils/updateBookingCounts');
                        try {
                            console.log(`🔄 Mise à jour du compteur pour le client ${customerId}...`);
                            const result = await updateClientBookingCount(customerId);
                            console.log(`✅ Compteur mis à jour: ${result.bookingCount} rendez-vous (fréquent: ${result.isFrequentClient})`);
                            webhookLog.processed = true;
                        } catch (error) {
                            console.error(`❌ Erreur lors de la mise à jour du compteur:`, error);
                            webhookLog.error = error instanceof Error ? error.message : 'Erreur inconnue';
                        }
                    }
                } else {
                    console.log(`⚠️ Événement booking sans customerId - Structure complète:`, JSON.stringify(data, null, 2));
                    webhookLog.error = 'customerId non trouvé dans les données du webhook';
                }
                break;

            default:
                console.log(`⚠️ Événement non géré: ${type}`);
        }

        webhookLog.processed = true;
        console.log(`✅ Webhook traité avec succès`);
        console.log(`${'='.repeat(80)}\n`);
        
        res.status(200).json({ success: true }); // Always return 200 for webhooks

    } catch (error) {
        webhookLog.error = error instanceof Error ? error.message : 'Erreur inconnue';
        webhookLog.processed = false;
        console.error('❌ Erreur dans le webhook:', error);
        console.log(`${'='.repeat(80)}\n`);
        
        // Toujours retourner 200 pour éviter que Square ne réessaie indéfiniment
        res.status(200).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;