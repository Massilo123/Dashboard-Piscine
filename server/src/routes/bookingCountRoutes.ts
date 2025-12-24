// Routes pour gérer les compteurs de rendez-vous
import { Router, Request, Response } from 'express';
import { updateAllBookingCounts, updateClientBookingCount } from '../utils/updateBookingCounts';
import Client from '../models/Client';

const router = Router();

/**
 * Route pour mettre à jour les compteurs de rendez-vous pour tous les clients
 * GET /api/booking-counts/update-all
 */
router.get('/update-all', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Démarrage de la mise à jour des compteurs de rendez-vous...');
    const result = await updateAllBookingCounts();
    
    res.json({
      success: result.success,
      updated: result.updated,
      errors: result.errors,
      message: result.message
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour des compteurs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route pour mettre à jour le compteur d'un client spécifique
 * POST /api/booking-counts/update-client
 * Body: { squareId: string }
 */
router.post('/update-client', async (req: Request, res: Response) => {
  try {
    const { squareId } = req.body;
    
    if (!squareId) {
      return res.status(400).json({
        success: false,
        error: 'squareId est requis'
      });
    }
    
    const result = await updateClientBookingCount(squareId);
    
    res.json({
      success: result.success,
      bookingCount: result.bookingCount,
      isFrequentClient: result.isFrequentClient
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du compteur du client:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route pour obtenir les statistiques des clients fréquents
 * GET /api/booking-counts/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const totalClients = await Client.countDocuments();
    const frequentClients = await Client.countDocuments({ isFrequentClient: true });
    const clientsWithBookings = await Client.countDocuments({ bookingCount: { $gt: 0 } });
    
    const averageBookings = await Client.aggregate([
      { $match: { bookingCount: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$bookingCount' } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalClients,
        frequentClients,
        clientsWithBookings,
        averageBookings: averageBookings.length > 0 ? Math.round(averageBookings[0].avg * 100) / 100 : 0
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route de debug pour vérifier le compteur d'un client spécifique
 * GET /api/booking-counts/debug/:squareId
 * ou
 * GET /api/booking-counts/debug?squareId=XXX ou ?givenName=XXX
 */
router.get('/debug/:squareId?', async (req: Request, res: Response) => {
  try {
    const squareId = req.params.squareId || req.query.squareId as string;
    const givenName = req.query.givenName as string;
    
    if (!squareId && !givenName) {
      return res.status(400).json({
        success: false,
        error: 'squareId ou givenName requis (paramètre ou query string)'
      });
    }
    
    // Trouver le client
    let client;
    if (squareId) {
      client = await Client.findOne({ squareId: squareId });
    } else if (givenName) {
      client = await Client.findOne({ givenName: givenName });
    }
    
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client non trouvé dans MongoDB'
      });
    }
    
    // Recompter les rendez-vous depuis Square API
    const { updateClientBookingCount } = await import('../utils/updateBookingCounts');
    let bookingCountResult;
    try {
      bookingCountResult = await updateClientBookingCount(client.squareId!);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Erreur lors du comptage: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        client: {
          _id: client._id.toString(),
          givenName: client.givenName,
          familyName: client.familyName,
          squareId: client.squareId,
          bookingCount: client.bookingCount,
          isFrequentClient: client.isFrequentClient
        }
      });
    }
    
    // Récupérer le client mis à jour
    const updatedClient = await Client.findOne({ squareId: client.squareId });
    
    res.json({
      success: true,
      client: {
        _id: client._id.toString(),
        givenName: client.givenName,
        familyName: client.familyName,
        squareId: client.squareId,
        phoneNumber: client.phoneNumber,
        addressLine1: client.addressLine1
      },
      before: {
        bookingCount: client.bookingCount,
        isFrequentClient: client.isFrequentClient
      },
      after: {
        bookingCount: bookingCountResult.bookingCount,
        isFrequentClient: bookingCountResult.isFrequentClient
      },
      updated: {
        bookingCount: updatedClient?.bookingCount,
        isFrequentClient: updatedClient?.isFrequentClient
      },
      changed: client.bookingCount !== bookingCountResult.bookingCount || 
               client.isFrequentClient !== bookingCountResult.isFrequentClient
    });
  } catch (error) {
    console.error('❌ Erreur dans la route de debug:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

export default router;

