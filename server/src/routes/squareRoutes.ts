/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import squareClient from '../config/square';
import Client from '../models/Client';

const router = Router();

const sanitizeData = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ));
};

router.get('/bookings', async (req: Request, res: Response) => {
    try {
        const allBookings = [];
        const months = Array.from({length: 10}, (_, i) => i + 3);

        for (const month of months) {
            const startDate = new Date(2024, month - 1, 1);
            const endDate = new Date(2024, month, 0);
            endDate.setHours(23, 59, 59);

            console.log(`Récupération des réservations pour ${startDate.toISOString()} à ${endDate.toISOString()}`);

            const bookings = await squareClient.bookings.list({
                startAtMin: startDate.toISOString(),
                startAtMax: endDate.toISOString(),
                limit: 100
            });

            for await (const booking of bookings) {
                if (booking.customerId) {
                    try {
                        const customerResponse = await squareClient.customers.get({
                            customerId: booking.customerId
                        });

                        if (customerResponse.customer) {
                            const customer = customerResponse.customer;
                            
                            // Sauvegarder dans MongoDB
                            try {
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
                                        const { geocodeAndExtractLocation } = await import('../utils/geocodeAndExtractLocation');
                                        geocodeAndExtractLocation(updatedClient._id.toString()).catch(err => {
                                            console.error(`Erreur lors du géocodage pour ${customer.givenName}:`, err);
                                        });
                                    }
                                }
                            } catch (dbError) {
                                console.error(`Erreur MongoDB pour le client ${customer.id}:`, dbError);
                            }

                            // Pour la réponse API
                            allBookings.push({
                                bookingId: booking.id,
                                startAt: booking.startAt,
                                customerInfo: {
                                    fullName: `${customer.givenName || ''} ${customer.familyName || ''}`.trim(),
                                    address: customer.address ? {
                                        addressLine1: customer.address.addressLine1 || ''
                                    } : null,
                                    phoneNumber: customer.phoneNumber || ''
                                }
                            });
                        }

                    } catch (error) {
                        console.error(`Erreur client Square ${booking.customerId}:`, error);
                    }
                }
            }
        }

        const sanitizedData = sanitizeData(allBookings);

        res.json({
            success: true,
            data: sanitizedData,
            count: allBookings.length,
            period: {
                start: "2024-03-01T00:00:00.000Z",
                end: "2024-12-31T23:59:59.000Z"
            }
        });

    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
});

export default router;