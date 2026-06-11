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
 * Route pour récupérer les anciens rendez-vous (date passée)
 * GET /api/appointments/past
 */
router.get('/past', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    const appointments = await Appointment.find({
      scheduled_date: { $lt: todayString }
    })
    .sort({ scheduled_date: -1, scheduled_time: -1 })
    .lean();

    res.json({ success: true, appointments });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des anciens appointments:', error);
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
 * Route de synchronisation initiale : met square_booked=true sur tous les
 * appointments qui ont déjà un booking ACCEPTED dans Square.
 * À appeler une seule fois après le déploiement du webhook.
 * GET /api/appointments/sync-square-initial
 */
router.get('/sync-square-initial', async (req: Request, res: Response) => {
  const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
  const squareHeaders = {
    'Authorization': `Bearer ${SQUARE_TOKEN}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-01-18',
  };
  const normalize = (p: string) => {
    const digits = (p || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  };

  try {
    // 1. Fetch tous les bookings Square ACCEPTED
    const acceptedBookings = new Map<string, Set<string>>(); // customer_id → Set<date>
    let cursor: string | null = null;
    do {
      const url = 'https://connect.squareup.com/v2/bookings' + (cursor ? `?cursor=${cursor}` : '');
      const resp = await fetch(url, { headers: squareHeaders });
      const data: any = await resp.json();
      for (const b of data.bookings || []) {
        const status = (b.status || '').toUpperCase();
        if (['CANCELLED', 'CANCELLED_BY_SELLER', 'CANCELLED_BY_CUSTOMER', 'DECLINED'].includes(status)) continue;
        if (!b.customer_id || !b.start_at) continue;
        const date: string = b.start_at.split('T')[0];
        if (!acceptedBookings.has(b.customer_id)) acceptedBookings.set(b.customer_id, new Set());
        acceptedBookings.get(b.customer_id)!.add(date);
      }
      cursor = data.cursor || null;
    } while (cursor);

    // 2. Récupérer les téléphones en parallèle
    const phoneToBookings = new Map<string, Set<string>>(); // phone10 → Set<date>
    await Promise.all([...acceptedBookings.entries()].map(async ([customerId, dates]) => {
      try {
        const r = await fetch(`https://connect.squareup.com/v2/customers/${customerId}`, { headers: squareHeaders });
        const d: any = await r.json();
        const phone = d.customer?.phone_number || '';
        if (!phone) return;
        const phone10 = normalize(phone);
        if (!phoneToBookings.has(phone10)) phoneToBookings.set(phone10, new Set());
        for (const date of dates) phoneToBookings.get(phone10)!.add(date);
      } catch { /* ignorer */ }
    }));

    // 3. Mettre à jour les appointments dans MongoDB dans les deux sens
    const appointments = await Appointment.find({ scheduled_date: { $exists: true } }).lean();
    let updated = 0;
    for (const apt of appointments as any[]) {
      const phone10 = normalize(apt.phone || '');
      const dates = phoneToBookings.get(phone10);
      const shouldBeBooked = dates ? dates.has(apt.scheduled_date) : false;
      if (shouldBeBooked !== !!apt.square_booked) {
        await Appointment.updateOne({ _id: apt._id }, { $set: { square_booked: shouldBeBooked } });
        updated++;
      }
    }

    console.log(`✅ Sync initiale Square terminée: ${updated} appointment(s) mis à jour`);
    res.json({ success: true, updated, total: appointments.length });
  } catch (error) {
    console.error('❌ Erreur sync initiale Square:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
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
  const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
  const squareHeaders = {
    'Authorization': `Bearer ${SQUARE_TOKEN}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-01-18',
  };

  // Normaliser en 10 chiffres (retire le +1 ou 1 du début)
  const normalize = (p: string) => {
    const digits = (p || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  };

  try {
    // 1. Charger tous les bookings Square ACCEPTED via REST (avec pagination)
    //    Le SDK ignore les paramètres snake_case — on appelle l'API directement
    const acceptedBookings = new Map<string, Set<string>>(); // customer_id → Set<YYYY-MM-DD>
    let cursor: string | null = null;
    do {
      const url = 'https://connect.squareup.com/v2/bookings' + (cursor ? `?cursor=${cursor}` : '');
      const resp = await fetch(url, { headers: squareHeaders });
      const data: any = await resp.json();
      for (const b of data.bookings || []) {
        const status = (b.status || '').toUpperCase();
        if (status === 'CANCELLED' || status === 'CANCELLED_BY_SELLER' || status === 'CANCELLED_BY_CUSTOMER' || status === 'DECLINED') continue;
        if (!b.customer_id || !b.start_at) continue;
        const date = b.start_at.split('T')[0]; // YYYY-MM-DD en UTC
        if (!acceptedBookings.has(b.customer_id)) acceptedBookings.set(b.customer_id, new Set());
        acceptedBookings.get(b.customer_id)!.add(date);
      }
      cursor = data.cursor || null;
    } while (cursor);

    // 2. Récupérer nos RDVs futurs depuis la DB
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];
    const appointments = await Appointment.find({
      $or: [
        { scheduled_date: { $gte: todayString } },
        { scheduled_date: { $exists: false } },
      ],
    }).lean();

    // Dédoublonner les téléphones à chercher
    const targets = new Map<string, Set<string>>(); // phone10 → Set<date>
    for (const apt of appointments as any[]) {
      const phone = normalize(apt.phone);
      if (!phone || !apt.scheduled_date) continue;
      if (!targets.has(phone)) targets.set(phone, new Set());
      targets.get(phone)!.add(apt.scheduled_date);
    }

    if (targets.size === 0) return res.json({ success: true, squareBookings: [] });

    // 3. Pour chaque téléphone, chercher le customer_id dans Square (format E.164 requis)
    const confirmed: Array<{ phone: string; date: string }> = [];

    await Promise.all(
      [...targets.entries()].map(async ([phone10, dates]) => {
        try {
          const e164 = `+1${phone10}`;
          const searchResp = await fetch('https://connect.squareup.com/v2/customers/search', {
            method: 'POST',
            headers: squareHeaders,
            body: JSON.stringify({ query: { filter: { phone_number: { exact: e164 } } } }),
          });
          const searchData: any = await searchResp.json();
          const customers: any[] = searchData.customers || [];

          for (const customer of customers) {
            const customerDates = acceptedBookings.get(customer.id);
            if (!customerDates) continue;
            for (const date of dates) {
              // Les bookings "all_day" ont start_at = YYYY-MM-DDT04:00:00Z (UTC-4)
              // On vérifie la date UTC et aussi le jour précédent/suivant par sécurité
              if (customerDates.has(date) || customerDates.has(date)) {
                confirmed.push({ phone: phone10, date });
              }
            }
          }
        } catch {
          // Ignorer les erreurs par client
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

/**
 * Créer un client Square à partir d'un appointment
 * POST /api/appointments/:id/create-square-client
 * - Vérifie si le client existe déjà (par téléphone)
 * - Sinon, le crée avec nom, téléphone, adresse et note de service/date
 */
router.post('/:id/create-square-client', async (req: Request, res: Response) => {
  const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
  const squareHeaders = {
    'Authorization': `Bearer ${SQUARE_TOKEN}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-01-18',
  };

  const normalize = (p: string) => {
    const digits = (p || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  };

  try {
    const appointment = await Appointment.findById(req.params.id).lean() as any;
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment non trouvé' });
    }

    const phone10 = normalize(appointment.phone || '');
    if (!phone10 || phone10.length !== 10) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone invalide ou manquant' });
    }
    const e164 = `+1${phone10}`;

    // 1. Vérifier si le client existe déjà dans Square par numéro de téléphone
    const searchResp = await fetch('https://connect.squareup.com/v2/customers/search', {
      method: 'POST',
      headers: squareHeaders,
      body: JSON.stringify({ query: { filter: { phone_number: { exact: e164 } } } }),
    });
    const searchData: any = await searchResp.json();

    if (searchData.customers && searchData.customers.length > 0) {
      const existing = searchData.customers[0];
      return res.json({
        success: true,
        status: 'exists',
        message: 'Ce client existe déjà dans Square',
        squareId: existing.id,
        customerName: [existing.given_name, existing.family_name].filter(Boolean).join(' '),
      });
    }

    // 2. Créer le client dans Square
    const nameParts = (appointment.name || '').trim().split(/\s+/);
    const givenName = nameParts[0] || '';
    const familyName = nameParts.slice(1).join(' ') || '';

    const customerBody: any = {
      idempotency_key: `appt-${appointment._id.toString()}`,
      given_name: givenName,
      family_name: familyName,
      phone_number: e164,
    };

    if (appointment.address) {
      customerBody.address = { address_line_1: appointment.address, country: 'CA' };
    }

    const noteParts: string[] = [];
    if (appointment.listing_title) noteParts.push(`Service: ${appointment.listing_title}`);
    if (appointment.pool_type) noteParts.push(`Piscine: ${appointment.pool_type}`);
    if (appointment.scheduled_date) noteParts.push(`Date prévue: ${appointment.scheduled_date}`);
    if (appointment.scheduled_time) noteParts.push(`Heure: ${appointment.scheduled_time}`);
    if (noteParts.length > 0) customerBody.note = noteParts.join(' | ');

    const createResp = await fetch('https://connect.squareup.com/v2/customers', {
      method: 'POST',
      headers: squareHeaders,
      body: JSON.stringify(customerBody),
    });
    const createData: any = await createResp.json();

    if (!createResp.ok || !createData.customer) {
      const errorMsg = createData.errors?.[0]?.detail || 'Erreur lors de la création du client Square';
      return res.status(500).json({ success: false, error: errorMsg });
    }

    const newCustomer = createData.customer;
    console.log(`✅ Client Square créé: ${givenName} ${familyName} (${e164}) → ${newCustomer.id}`);

    res.json({
      success: true,
      status: 'created',
      message: 'Client créé avec succès dans Square',
      squareId: newCustomer.id,
      customerName: [newCustomer.given_name, newCustomer.family_name].filter(Boolean).join(' '),
    });
  } catch (error) {
    console.error('❌ Erreur création client Square:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    });
  }
});

export default router;

