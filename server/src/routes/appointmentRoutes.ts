// Routes pour gérer les appointments (rendez-vous bookés par le bot)
import { Router, Request, Response } from 'express';
import Appointment from '../models/Appointment';
import squareClient from '../config/square';

const router = Router();

/**
 * Route pour récupérer les futurs rendez-vous
 * GET /api/appointments/future
 * Query params: ?viewed=true pour marquer comme vus
 */
router.get('/future', async (req: Request, res: Response) => {
  try {
    const crypto = require('crypto');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0]; // Format YYYY-MM-DD
    
    // Récupérer les appointments futurs (scheduled_date >= aujourd'hui)
    // scheduled_date est stocké comme string au format YYYY-MM-DD
    const appointments = await Appointment.find({
      $or: [
        { scheduled_date: { $gte: todayString } },
        { scheduled_date: { $exists: false } } // Inclure ceux sans date
      ]
    })
    .sort({ scheduled_date: 1, scheduled_time: 1 })
    .lean();

    // Ajouter un hash pour chaque appointment basé sur les données importantes
    const appointmentsWithHash = appointments.map((apt: any) => {
      // Créer un hash basé sur les champs importants qui peuvent changer
      const hashData = JSON.stringify({
        _id: apt._id.toString(),
        name: apt.name || '',
        phone: apt.phone || '',
        address: apt.address || '',
        scheduled_date: apt.scheduled_date || '',
        scheduled_time: apt.scheduled_time || '',
        status: apt.status || '',
        city: apt.city || '',
        sector: apt.sector || '',
        district: apt.district || '',
        listing_title: apt.listing_title || '',
        pool_type: apt.pool_type || '',
        important_notes: apt.important_notes || '',
        updated_at: apt.updated_at ? new Date(apt.updated_at).toISOString() : ''
      });
      
      const hash = crypto.createHash('md5').update(hashData).digest('hex');
      
      return {
        ...apt,
        dataHash: hash
      };
    });

    res.json({
      success: true,
      appointments: appointmentsWithHash,
      unviewedCount: appointments.length
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des appointments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route pour récupérer tous les appointments
 * GET /api/appointments
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit, skip } = req.query;
    
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const appointments = await Appointment.find(query)
      .sort({ scheduled_date: -1, scheduled_time: -1 })
      .limit(limit ? parseInt(limit as string) : 100)
      .skip(skip ? parseInt(skip as string) : 0)
      .lean();

    res.json({
      success: true,
      appointments
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des appointments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route pour obtenir le nombre d'appointments non vus ou modifiés
 * GET /api/appointments/unviewed-count
 * Query params: ?viewedHashes=hash1,hash2,hash3 (les hash des appointments déjà vus)
 */
router.get('/unviewed-count', async (req: Request, res: Response) => {
  try {
    const crypto = require('crypto');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0]; // Format YYYY-MM-DD
    
    // Récupérer tous les appointments futurs
    const appointments = await Appointment.find({
      $or: [
        { scheduled_date: { $gte: todayString } },
        { scheduled_date: { $exists: false } } // Inclure ceux sans date
      ]
    })
    .lean();

    // Récupérer les hash des appointments déjà vus depuis la query string
    const viewedHashesParam = req.query.viewedHashes as string;
    const viewedHashes = viewedHashesParam ? viewedHashesParam.split(',') : [];

    // Calculer les hash pour chaque appointment
    let newOrChangedCount = 0;
    appointments.forEach((apt: any) => {
      const hashData = JSON.stringify({
        _id: apt._id.toString(),
        name: apt.name || '',
        phone: apt.phone || '',
        address: apt.address || '',
        scheduled_date: apt.scheduled_date || '',
        scheduled_time: apt.scheduled_time || '',
        status: apt.status || '',
        city: apt.city || '',
        sector: apt.sector || '',
        district: apt.district || '',
        listing_title: apt.listing_title || '',
        pool_type: apt.pool_type || '',
        important_notes: apt.important_notes || '',
        updated_at: apt.updated_at ? new Date(apt.updated_at).toISOString() : ''
      });
      
      const hash = crypto.createHash('md5').update(hashData).digest('hex');
      
      // Si l'appointment n'a pas été vu ou a changé (hash différent)
      if (!viewedHashes.includes(hash)) {
        newOrChangedCount++;
      }
    });

    res.json({
      success: true,
      count: newOrChangedCount,
      total: appointments.length
    });
  } catch (error) {
    console.error('❌ Erreur lors du comptage des appointments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

/**
 * Route pour vérifier quels appointments du bot ont déjà été bookés dans Square.
 * On part des RDVs qu'on a déjà (avec leurs téléphones et dates), on cherche
 * directement ces clients dans Square par téléphone, puis on vérifie s'ils ont
 * un booking à la date demandée.
 *
 * GET /api/appointments/square-status
 * Retourne un tableau de { phone, date } confirmés dans Square
 */
router.get('/square-status', async (req: Request, res: Response) => {
  try {
    // 1. Récupérer les RDVs futurs depuis notre propre DB pour savoir qui chercher
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    const appointments = await Appointment.find({
      $or: [
        { scheduled_date: { $gte: todayString } },
        { scheduled_date: { $exists: false } },
      ],
    }).lean();

    // Normaliser en 10 chiffres (retirer le +1 ou 1 du début si présent)
    const normalize = (p: string) => {
      const digits = (p || '').replace(/\D/g, '');
      return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    };
    const targets = new Map<string, Set<string>>(); // phone normalisé → Set de dates
    for (const apt of appointments as any[]) {
      const phone = normalize(apt.phone);
      if (!phone || !apt.scheduled_date) continue;
      if (!targets.has(phone)) targets.set(phone, new Set());
      targets.get(phone)!.add(apt.scheduled_date);
    }

    if (targets.size === 0) {
      return res.json({ success: true, squareBookings: [] });
    }

    // 2. Pour chaque téléphone unique, chercher le client dans Square
    const confirmed: Array<{ phone: string; date: string }> = [];

    await Promise.all(
      [...targets.entries()].map(async ([phone, dates]) => {
        try {
          // Recherche Square par numéro de téléphone exact
          const searchResp = await squareClient.customers.search({
            query: {
              filter: {
                phoneNumber: { exact: phone },
              } as any,
            },
          });

          const customers: any[] =
            (searchResp as any).customers ??
            (searchResp as any).result?.customers ??
            [];

          if (customers.length === 0) return;

          // 3. Pour chaque client trouvé, vérifier ses bookings aux dates demandées
          await Promise.all(
            customers.map(async (customer: any) => {
              const customerId: string = customer.id;

              await Promise.all(
                [...dates].map(async (date) => {
                  try {
                    const bookResp = await squareClient.bookings.list({
                      customerId,
                      startAtMin: `${date}T00:00:00Z`,
                      startAtMax: `${date}T23:59:59Z`,
                    } as any);

                    const bookings: any[] =
                      (bookResp as any).bookings ??
                      (bookResp as any).result?.bookings ??
                      [];

                    const active = bookings.filter((b: any) => {
                      const status = (b.status || '').toUpperCase();
                      return status !== 'CANCELLED' && status !== 'CANCELLED_BY_SELLER' && status !== 'CANCELLED_BY_CUSTOMER';
                    });

                    if (active.length > 0) {
                      confirmed.push({ phone, date });
                    }
                  } catch {
                    // Ignorer les erreurs individuelles par date
                  }
                })
              );
            })
          );
        } catch {
          // Ignorer les erreurs individuelles par client
        }
      })
    );

    res.json({ success: true, squareBookings: confirmed });
  } catch (error) {
    console.error('❌ Erreur Square status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur Square API',
      squareBookings: [],
    });
  }
});

export default router;

