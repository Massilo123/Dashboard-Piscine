// webhookRoutes.ts
import { Router, Request, Response } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';
// Plus besoin des fonctions de cache - on utilise directement MongoDB maintenant

const router = Router();

// Fonction pour mettre à jour ou créer un client dans MongoDB
// Peut utiliser soit les données du webhook directement, soit récupérer depuis Square API
async function upsertClientInMongo(squareCustomerId: string, webhookCustomerData?: any) {
    try {
        let customer;
        
        // Si on a les données du webhook, les utiliser directement (plus rapide)
        if (webhookCustomerData && webhookCustomerData.id === squareCustomerId) {
            customer = webhookCustomerData;
            console.log(`📝 Utilisation des données du webhook pour ${squareCustomerId}`);
        } else if (webhookCustomerData) {
            // Si les données sont disponibles mais l'ID ne correspond pas, utiliser quand même
            console.log(`⚠️ ID mismatch: webhook=${webhookCustomerData.id}, expected=${squareCustomerId}, utilisation des données webhook`);
            customer = webhookCustomerData;
        } else {
            // Sinon, récupérer depuis Square API
            console.log(`📡 Récupération du client ${squareCustomerId} depuis Square API...`);
            try {
                const customerResponse = await squareClient.customers.get({
                    customerId: squareCustomerId
                });

                if (!customerResponse.customer) {
                    throw new Error('Client non trouvé dans Square');
                }

                customer = customerResponse.customer;
            } catch (apiError) {
                console.error(`❌ Erreur lors de la récupération depuis Square API:`, apiError);
                throw apiError;
            }
        }

        // Normaliser les noms de champs (Square peut utiliser given_name ou givenName)
        const givenName = customer.givenName || customer.given_name || '';
        const familyName = customer.familyName || customer.family_name || '';
        const phoneNumber = customer.phoneNumber || customer.phone_number || '';
        const addressLine1 = customer.address?.addressLine1 || customer.address?.address_line_1 || '';

        // Mettre à jour ou créer le client dans MongoDB
        const updatedClient = await Client.findOneAndUpdate(
            { squareId: customer.id },
            {
                givenName: givenName,
                familyName: familyName,
                phoneNumber: phoneNumber,
                addressLine1: addressLine1,
                squareId: customer.id
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Client ${updatedClient ? 'mis à jour' : 'créé'} dans MongoDB: ${givenName} ${familyName}`.trim());

        // Géocoder automatiquement le client s'il a une adresse
        if (updatedClient && updatedClient.addressLine1 && updatedClient.addressLine1.trim() !== '') {
            const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
            geocodeAndExtractLocation(updatedClient._id.toString())
                .then((result) => {
                    console.log(`✅ Client géocodé et localisé: ${result.city}${result.district ? ` (${result.district})` : ''} [${result.sector}]`);
                })
                .catch(err => {
                    console.error(`Erreur lors du géocodage automatique pour ${givenName}:`, err);
                });
        }

    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour du client:', error);
        throw error;
    }
}

// Fonction pour extraire l'ID du client depuis différents formats de webhook
function extractCustomerId(data: any): string | null {
    // Format Square standard: data.object.customer.id
    if (data?.object?.customer?.id) {
        return data.object.customer.id;
    }
    
    // Format Square: data.id (quand data.type === 'customer')
    if (data?.id && data?.type === 'customer') {
        return data.id;
    }
    
    // Format alternatif: data.customer.id
    if (data?.customer?.id) {
        return data.customer.id;
    }
    
    // Format alternatif: data.object.id (si l'objet est directement le customer)
    if (data?.object?.id && (data?.object?.givenName || data?.object?.familyName || data?.object?.given_name)) {
        return data.object.id;
    }
    
    // Format direct: data.id si c'est un objet customer
    if (data?.id && (data?.givenName || data?.familyName || data?.given_name)) {
        return data.id;
    }
    
    return null;
}

// Fonction pour extraire l'ID du client depuis un événement de booking
function extractCustomerIdFromBooking(data: any): string | null {
    // Format Square standard: data.object.booking.customer_id (avec underscore)
    if (data?.object?.booking?.customer_id) {
        return data.object.booking.customer_id;
    }
    
    // Format alternatif: data.object.booking.customerId (camelCase)
    if (data?.object?.booking?.customerId) {
        return data.object.booking.customerId;
    }
    
    // Format: data.booking.customer_id
    if (data?.booking?.customer_id) {
        return data.booking.customer_id;
    }
    
    // Format: data.booking.customerId
    if (data?.booking?.customerId) {
        return data.booking.customerId;
    }
    
    // Format: data.object.customer_id (si l'objet booking est directement dans object)
    if (data?.object?.customer_id && data?.object?.id) {
        return data.object.customer_id;
    }
    
    // Format: data.customer_id (si l'objet booking est directement dans data)
    if (data?.customer_id && data?.id) {
        return data.customer_id;
    }
    
    return null;
}

// Fonction pour incrémenter le compteur de rendez-vous d'un client
async function incrementBookingCount(customerId: string) {
    try {
        const client = await Client.findOne({ squareId: customerId });
        if (!client) {
            console.warn(`⚠️ Client avec squareId ${customerId} non trouvé pour incrémenter le compteur. Création du client...`);
            // Si le client n'existe pas, essayer de le créer depuis Square
            try {
                await upsertClientInMongo(customerId);
                // Réessayer après création
                const newClient = await Client.findOne({ squareId: customerId });
                if (!newClient) {
                    throw new Error('Impossible de créer le client');
                }
                // Continuer avec l'incrémentation
            } catch (createError) {
                console.error(`❌ Impossible de créer le client ${customerId}:`, createError);
                throw createError;
            }
        }

        // Récupérer le client (soit existant, soit nouvellement créé)
        const clientToUpdate = await Client.findOne({ squareId: customerId });
        if (!clientToUpdate) {
            throw new Error('Client introuvable après création');
        }

        const currentCount = clientToUpdate.bookingCount || 0;
        const newBookingCount = currentCount + 1;
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

        console.log(`📈 Compteur de rendez-vous incrémenté pour ${customerId}: ${currentCount} → ${newBookingCount}${isFrequentClient ? ' (client fréquent!)' : ''}`);
    } catch (error) {
        console.error(`❌ Erreur lors de l'incrémentation du compteur pour ${customerId}:`, error);
        throw error; // Re-throw pour que l'appelant puisse gérer l'erreur
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
async function processWebhookEvent(type: string, data: any): Promise<{ success: boolean; error?: string }> {
    try {
        // Traiter les différents types d'événements
        switch (type) {
            case 'customer.created':
                console.log('✅ Nouveau client créé dans Square');
                const createdId = extractCustomerId(data);
                console.log(`🔍 ID extrait: ${createdId || 'NON TROUVÉ'}`);
                if (createdId) {
                    // Utiliser les données du webhook directement si disponibles
                    const customerData = data?.object?.customer || data?.customer || null;
                    console.log(`📦 Données client disponibles: ${customerData ? 'OUI' : 'NON'}`);
                    try {
                        await upsertClientInMongo(createdId, customerData);
                        console.log(`✅ Client créé/mis à jour dans MongoDB: ${createdId}`);
                        return { success: true };
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
                        console.error(`❌ Erreur lors de la création du client ${createdId}:`, error);
                        return { success: false, error: errorMsg };
                    }
                } else {
                    const errorMsg = 'customer.created reçu mais pas d\'ID client trouvé';
                    console.warn(`⚠️ ${errorMsg}. Structure data:`, JSON.stringify(data, null, 2));
                    return { success: false, error: errorMsg };
                }

            case 'customer.updated':
                console.log('✅ Client mis à jour dans Square');
                const updatedId = extractCustomerId(data);
                console.log(`🔍 ID extrait: ${updatedId || 'NON TROUVÉ'}`);
                if (updatedId) {
                    // Utiliser les données du webhook directement si disponibles
                    const customerData = data?.object?.customer || data?.customer || null;
                    console.log(`📦 Données client disponibles: ${customerData ? 'OUI' : 'NON'}`);
                    try {
                        await upsertClientInMongo(updatedId, customerData);
                        console.log(`✅ Client mis à jour dans MongoDB: ${updatedId}`);
                        return { success: true };
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
                        console.error(`❌ Erreur lors de la mise à jour du client ${updatedId}:`, error);
                        return { success: false, error: errorMsg };
                    }
                } else {
                    const errorMsg = 'customer.updated reçu mais pas d\'ID client trouvé';
                    console.warn(`⚠️ ${errorMsg}. Structure data:`, JSON.stringify(data, null, 2));
                    return { success: false, error: errorMsg };
                }

            case 'customer.deleted':
                console.log('🗑️ Client supprimé dans Square');
                const deletedId = extractCustomerId(data);
                console.log(`🔍 ID client extrait: ${deletedId || 'NON TROUVÉ'}`);
                if (deletedId) {
                    try {
                        const client = await Client.findOne({ squareId: deletedId });
                        if (client) {
                            const clientId = client._id.toString();
                            const clientName = `${client.givenName || ''} ${client.familyName || ''}`.trim();
                            console.log(`🗑️ Suppression du client ${clientId} (${clientName})`);
                            
                            // Supprimer directement de MongoDB
                            await Client.deleteOne({ squareId: deletedId });
                            console.log(`✅ Client supprimé de MongoDB`);
                            return { success: true };
                        } else {
                            console.log(`⚠️ Client avec squareId ${deletedId} non trouvé dans MongoDB (déjà supprimé?)`);
                            // Retourner success même si le client n'existe pas (peut-être déjà supprimé)
                            return { success: true };
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
                        console.error(`❌ Erreur lors de la suppression du client ${deletedId}:`, error);
                        return { success: false, error: errorMsg };
                    }
                } else {
                    const errorMsg = 'customer.deleted reçu mais pas d\'ID client trouvé';
                    console.warn(`⚠️ ${errorMsg}. Structure data:`, JSON.stringify(data, null, 2));
                    return { success: false, error: errorMsg };
                }

            case 'booking.created':
                console.log('📅 Nouveau rendez-vous créé dans Square');
                const bookingCreatedCustomerId = extractCustomerIdFromBooking(data);
                console.log(`🔍 ID client extrait du booking: ${bookingCreatedCustomerId || 'NON TROUVÉ'}`);
                if (bookingCreatedCustomerId) {
                    try {
                        await incrementBookingCount(bookingCreatedCustomerId);
                        return { success: true };
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
                        console.error(`❌ Erreur lors de l'incrémentation du compteur pour ${bookingCreatedCustomerId}:`, error);
                        return { success: false, error: errorMsg };
                    }
                } else {
                    const errorMsg = 'booking.created reçu mais pas d\'ID client trouvé';
                    console.warn(`⚠️ ${errorMsg}. Structure data:`, JSON.stringify(data, null, 2));
                    return { success: false, error: errorMsg };
                }

            case 'booking.updated':
                // Pour booking.updated, on recompte tous les bookings du client
                // car Square n'envoie pas toujours les valeurs précédentes
                console.log('📅 Rendez-vous mis à jour dans Square');
                const bookingUpdatedCustomerId = extractCustomerIdFromBooking(data);
                console.log(`🔍 ID client extrait du booking: ${bookingUpdatedCustomerId || 'NON TROUVÉ'}`);
                if (bookingUpdatedCustomerId) {
                    // Vérifier le statut du booking pour logger l'information
                    const booking = data?.object?.booking || data?.booking || data?.object;
                    const status = booking?.status ? String(booking.status) : 'UNKNOWN';
                    const isCancelled = status === 'CANCELLED' ||
                                      status === 'CANCELLED_BY_SELLER' ||
                                      status === 'CANCELLED_BY_CUSTOMER';

                    if (isCancelled) {
                        console.log(`❌ Rendez-vous annulé (statut: ${status}) - recalcul du compteur en background...`);
                    } else {
                        console.log(`ℹ️ Rendez-vous mis à jour (statut: ${status}) - recalcul du compteur en background...`);
                    }

                    // Traiter en arrière-plan pour ne pas bloquer la réponse à Square (évite le 504)
                    import('../utils/updateBookingCounts').then(({ updateClientBookingCount }) => {
                        updateClientBookingCount(bookingUpdatedCustomerId)
                            .then(result => {
                                console.log(`✅ Compteur de rendez-vous recalculé pour ${bookingUpdatedCustomerId}: ${result.bookingCount} (fréquent: ${result.isFrequentClient})`);
                            })
                            .catch(err => {
                                console.error(`❌ Erreur lors du recalcul du compteur pour ${bookingUpdatedCustomerId}:`, err);
                            });
                    });

                    return { success: true };
                } else {
                    const errorMsg = 'booking.updated reçu mais pas d\'ID client trouvé';
                    console.warn(`⚠️ ${errorMsg}. Structure data:`, JSON.stringify(data, null, 2));
                    return { success: false, error: errorMsg };
                }

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
        
        // Si on arrive ici, l'événement n'a pas été traité (pas de return dans le switch)
        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`❌ Erreur lors du traitement de l'événement ${type}:`, error);
        // Ne pas throw pour éviter de bloquer les autres événements
        return { success: false, error: errorMsg };
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
        let successCount = 0;
        let errorCount = 0;
        
        for (const event of events) {
            if (event.type) {
                try {
                    const result = await processWebhookEvent(event.type, event.data);
                    processedCount++;
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.warn(`⚠️ Événement ${event.type} traité avec erreur: ${result.error}`);
                    }
                } catch (error) {
                    errorCount++;
                    processedCount++;
                    console.error(`❌ Erreur non catchée lors du traitement de ${event.type}:`, error);
                }
            } else {
                console.warn('⚠️ Événement sans type ignoré:', event);
            }
        }

        console.log(`✅ Webhook traité: ${successCount} succès, ${errorCount} erreurs sur ${processedCount}/${events.length} événement(s)`);
        res.status(200).json({ 
            success: errorCount === 0, 
            processed: processedCount, 
            successCount,
            errorCount,
            total: events.length 
        });

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