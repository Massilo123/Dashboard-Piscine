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

// Fonction pour extraire l'ID du client depuis différents formats de webhook
function extractCustomerId(data: any): string | null {
    // Format 1: data.object.customer.id (format standard Square)
    if (data?.object?.customer?.id) {
        return data.object.customer.id;
    }
    
    // Format 2: data.id (si l'objet customer est directement dans data)
    if (data?.id && data?.type === 'customer') {
        return data.id;
    }
    
    // Format 3: data.customer.id
    if (data?.customer?.id) {
        return data.customer.id;
    }
    
    // Format 4: data.object.id (si l'objet est directement le customer)
    if (data?.object?.id && (data?.object?.givenName || data?.object?.familyName)) {
        return data.object.id;
    }
    
    return null;
}

// Fonction pour extraire l'ID du client depuis un événement de booking
function extractCustomerIdFromBooking(data: any): string | null {
    // Format 1: data.object.booking.customerId (format standard Square)
    if (data?.object?.booking?.customerId) {
        return data.object.booking.customerId;
    }
    
    // Format 2: data.booking.customerId
    if (data?.booking?.customerId) {
        return data.booking.customerId;
    }
    
    // Format 3: data.object.customerId (si l'objet booking est directement dans object)
    if (data?.object?.customerId && data?.object?.id) {
        return data.object.customerId;
    }
    
    // Format 4: data.customerId (si l'objet booking est directement dans data)
    if (data?.customerId && data?.id) {
        return data.customerId;
    }
    
    return null;
}

// Fonction pour incrémenter le compteur de rendez-vous d'un client
async function incrementBookingCount(customerId: string) {
    try {
        const client = await Client.findOne({ squareId: customerId });
        if (!client) {
            console.warn(`⚠️ Client avec squareId ${customerId} non trouvé pour incrémenter le compteur`);
            return;
        }

        const newBookingCount = (client.bookingCount || 0) + 1;
        const isFrequentClient = newBookingCount >= 3;

        await Client.updateOne(
            { squareId: customerId },
            {
                $set: {
                    bookingCount: newBookingCount,
                    isFrequentClient: isFrequentClient
                }
            }
        );

        console.log(`📈 Compteur de rendez-vous incrémenté pour ${customerId}: ${client.bookingCount || 0} → ${newBookingCount}${isFrequentClient ? ' (client fréquent!)' : ''}`);
    } catch (error) {
        console.error(`❌ Erreur lors de l'incrémentation du compteur pour ${customerId}:`, error);
    }
}

// Fonction pour décrémenter le compteur de rendez-vous d'un client (quand un booking est annulé)
async function decrementBookingCount(customerId: string) {
    try {
        const client = await Client.findOne({ squareId: customerId });
        if (!client) {
            console.warn(`⚠️ Client avec squareId ${customerId} non trouvé pour décrémenter le compteur`);
            return;
        }

        const currentCount = client.bookingCount || 0;
        const newBookingCount = Math.max(0, currentCount - 1); // Ne pas aller en négatif
        const isFrequentClient = newBookingCount >= 3;

        await Client.updateOne(
            { squareId: customerId },
            {
                $set: {
                    bookingCount: newBookingCount,
                    isFrequentClient: isFrequentClient
                }
            }
        );

        console.log(`📉 Compteur de rendez-vous décrémenté pour ${customerId}: ${currentCount} → ${newBookingCount}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la décrémentation du compteur pour ${customerId}:`, error);
    }
}

// Fonction pour traiter un événement individuel
async function processWebhookEvent(type: string, data: any) {
    try {
        // Traiter les différents types d'événements
        switch (type) {
            case 'customer.created':
                console.log('✅ Nouveau client créé dans Square');
                const createdId = extractCustomerId(data);
                if (createdId) {
                    await upsertClientInMongo(createdId);
                    console.log(`✅ Client créé/mis à jour dans MongoDB: ${createdId}`);
                } else {
                    console.warn('⚠️ customer.created reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            case 'customer.updated':
                console.log('✅ Client mis à jour dans Square');
                const updatedId = extractCustomerId(data);
                if (updatedId) {
                    await upsertClientInMongo(updatedId);
                    console.log(`✅ Client mis à jour dans MongoDB: ${updatedId}`);
                } else {
                    console.warn('⚠️ customer.updated reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            case 'customer.deleted':
                console.log('🗑️ Client supprimé dans Square');
                const deletedId = extractCustomerId(data);
                if (deletedId) {
                    const client = await Client.findOne({ squareId: deletedId });
                    if (client) {
                        const clientId = client._id.toString();
                        const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim();
                        console.log(`🗑️ Suppression du client ${clientId} (${clientName})`);
                        
                        // Supprimer directement de MongoDB
                        await Client.deleteOne({ squareId: deletedId });
                        console.log(`✅ Client supprimé de MongoDB`);
                    } else {
                        console.log(`⚠️ Client avec squareId ${deletedId} non trouvé dans MongoDB`);
                    }
                } else {
                    console.warn('⚠️ customer.deleted reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            case 'booking.created':
                console.log('📅 Nouveau rendez-vous créé dans Square');
                const bookingCreatedCustomerId = extractCustomerIdFromBooking(data);
                if (bookingCreatedCustomerId) {
                    await incrementBookingCount(bookingCreatedCustomerId);
                } else {
                    console.warn('⚠️ booking.created reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            case 'booking.updated':
                // Pour booking.updated, on vérifie si le statut a changé
                // Si le booking passe de CANCELLED à un autre statut, on incrémente
                // Si le booking passe à CANCELLED, on décrémente
                console.log('📅 Rendez-vous mis à jour dans Square');
                const bookingUpdatedCustomerId = extractCustomerIdFromBooking(data);
                if (bookingUpdatedCustomerId) {
                    const booking = data?.object?.booking || data?.booking || data?.object;
                    const status = booking?.status;
                    const previousStatus = booking?.previousStatus || data?.previousValues?.status;
                    
                    // Si le booking était annulé et maintenant ne l'est plus, incrémenter
                    if (previousStatus === 'CANCELLED' && status && status !== 'CANCELLED') {
                        await incrementBookingCount(bookingUpdatedCustomerId);
                    }
                    // Si le booking devient annulé, décrémenter
                    else if (status === 'CANCELLED' && previousStatus && previousStatus !== 'CANCELLED') {
                        await decrementBookingCount(bookingUpdatedCustomerId);
                    } else {
                        console.log(`ℹ️ booking.updated sans changement de statut significatif (${previousStatus} → ${status})`);
                    }
                } else {
                    console.warn('⚠️ booking.updated reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            case 'booking.cancelled':
            case 'booking.canceled':
                console.log('❌ Rendez-vous annulé dans Square');
                const bookingCancelledCustomerId = extractCustomerIdFromBooking(data);
                if (bookingCancelledCustomerId) {
                    await decrementBookingCount(bookingCancelledCustomerId);
                } else {
                    console.warn('⚠️ booking.cancelled reçu mais pas d\'ID client trouvé. Structure data:', JSON.stringify(data, null, 2));
                }
                break;

            default:
                // Ignorer silencieusement les autres événements non gérés
                if (!type.startsWith('customer.') && !type.startsWith('booking.')) {
                    console.log(`ℹ️ Événement non géré ignoré: ${type}`);
                } else {
                    console.log(`⚠️ Événement non géré: ${type}`);
                }
        }
    } catch (error) {
        console.error(`❌ Erreur lors du traitement de l'événement ${type}:`, error);
        // Ne pas throw pour éviter de bloquer les autres événements
    }
}

// Endpoint pour recevoir les webhooks de Square
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        console.log('📥 Webhook reçu:', JSON.stringify(req.body, null, 2));
        
        // Square peut envoyer soit un seul événement, soit un tableau d'événements
        let events: Array<{ type: string; data: any }> = [];
        
        // Vérifier si c'est un tableau d'événements
        if (Array.isArray(req.body)) {
            events = req.body.map((event: any) => ({
                type: event.type || event.event_type || '',
                data: event.data || event
            }));
            console.log(`📦 ${events.length} événement(s) reçu(s) dans le webhook (format tableau)`);
        } 
        // Vérifier si c'est un objet avec un tableau d'événements (format Square)
        else if (req.body.data && Array.isArray(req.body.data)) {
            events = req.body.data.map((event: any) => ({
                type: event.type || event.event_type || req.body.type || '',
                data: event.data || event
            }));
            console.log(`📦 ${events.length} événement(s) reçu(s) dans req.body.data`);
        }
        // Sinon, traiter comme un seul événement (format standard Square)
        else if (req.body.type) {
            events = [{ 
                type: req.body.type, 
                data: req.body.data || req.body 
            }];
            console.log(`📦 1 événement reçu (format simple): ${req.body.type}`);
        }
        else {
            console.warn('⚠️ Format de webhook non reconnu. Clés disponibles:', Object.keys(req.body));
            console.warn('⚠️ Contenu complet:', JSON.stringify(req.body, null, 2));
            // Ne pas retourner d'erreur 400, mais plutôt 200 pour éviter que Square réessaie
            return res.status(200).json({ 
                success: false, 
                error: 'Format de webhook non reconnu',
                received: Object.keys(req.body)
            });
        }

        // Traiter chaque événement
        let processedCount = 0;
        for (const event of events) {
            if (event.type) {
                await processWebhookEvent(event.type, event.data);
                processedCount++;
            } else {
                console.warn('⚠️ Événement sans type ignoré:', event);
            }
        }

        console.log(`✅ Webhook traité: ${processedCount}/${events.length} événement(s) traité(s)`);
        res.status(200).json({ success: true, processed: processedCount, total: events.length });

    } catch (error) {
        console.error('❌ Erreur dans le webhook:', error);
        // Retourner 200 pour éviter que Square réessaie indéfiniment
        res.status(200).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;