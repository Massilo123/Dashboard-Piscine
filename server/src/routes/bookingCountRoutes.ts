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

export default router;

