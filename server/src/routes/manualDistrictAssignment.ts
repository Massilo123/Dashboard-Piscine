import { Router, Request, Response } from 'express';
import Client from '../models/Client';

const router = Router();

router.post('/api/manual-district-assignment', async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, city, neighborhood } = req.body;

        if (!clientId || !city || !neighborhood) {
            res.status(400).json({
                success: false,
                error: 'Données manquantes'
            });
            return;
        }

        // Mettre à jour le client avec les nouvelles informations
        await Client.findByIdAndUpdate(clientId, {
            'manuallyAssigned': {
                city,
                neighborhood,
                assignedAt: new Date()
            }
        });

        res.json({
            success: true,
            data: {
                message: 'Client mis à jour avec succès'
            }
        });

    } catch (error) {
        console.error('Erreur lors de l\'assignation manuelle:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de la mise à jour'
        });
    }
});

export default router;