import { Router, Request, Response } from 'express';
import Client from '../models/Client';

const router = Router();

const LOCATION_ID = 'L24K8X13MB1A7';
const HEADERS = () => ({
  Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-01-18',
});

type ServiceKey = 'ouvertureCreusee' | 'ouvertureHorsTerre' | 'fermetureCreusee' | 'fermetureHorsTerre' | 'autre';

function classifyService(name: string): ServiceKey {
  const n = (name || '').toLowerCase();
  const isHorsTerre = n.includes('hors') || n.includes('above') || n.includes('ground');
  if (n.includes('ouverture') || n.includes('opening')) return isHorsTerre ? 'ouvertureHorsTerre' : 'ouvertureCreusee';
  if (n.includes('fermeture') || n.includes('closing'))  return isHorsTerre ? 'fermetureHorsTerre' : 'fermetureCreusee';
  return 'autre';
}

// Convertit un timestamp UTC en date locale Montréal (UTC-4 EDT / UTC-5 EST)
// Simplification : on utilise UTC-4 (saison de piscine = été)
function utcToMontrealDate(utcString: string): string {
  const d = new Date(utcString);
  d.setHours(d.getHours() - 4);
  return d.toISOString().split('T')[0];
}

// Récupère tous les bookings Square pour la plage de dates (pagination incluse)
async function fetchSquareBookings(startDate: string, endDate: string): Promise<any[]> {
  // Montréal EDT = UTC-4 → minuit local = 04:00 UTC
  const startAtMin = `${startDate}T04:00:00.000Z`;
  // Dernier jour : fin de journée locale = lendemain 03:59:59 UTC
  const endDay = new Date(endDate + 'T12:00:00Z');
  endDay.setDate(endDay.getDate() + 1);
  const startAtMax = `${endDay.toISOString().split('T')[0]}T03:59:59.999Z`;

  const all: any[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL('https://connect.squareup.com/v2/bookings');
    url.searchParams.set('location_id', LOCATION_ID);
    url.searchParams.set('start_at_min', startAtMin);
    url.searchParams.set('start_at_max', startAtMax);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const resp = await fetch(url.toString(), { headers: HEADERS() });
    if (!resp.ok) throw new Error(`Square bookings API ${resp.status}: ${await resp.text()}`);
    const data: any = await resp.json();

    for (const b of data.bookings || []) {
      const status = (b.status || '').toUpperCase();
      if (['CANCELLED', 'CANCELLED_BY_SELLER', 'CANCELLED_BY_CUSTOMER', 'DECLINED', 'NO_SHOW'].includes(status)) continue;
      all.push(b);
    }
    cursor = data.cursor || null;
  } while (cursor);

  return all;
}

// Résout les noms de services depuis le catalogue Square (batch)
async function fetchServiceNames(variationIds: string[]): Promise<Record<string, string>> {
  if (variationIds.length === 0) return {};
  try {
    const resp = await fetch('https://connect.squareup.com/v2/catalog/batch-retrieve', {
      method: 'POST',
      headers: HEADERS(),
      body: JSON.stringify({ object_ids: variationIds, include_related_objects: true }),
    });
    if (!resp.ok) return {};
    const data: any = await resp.json();

    // Les noms sont sur l'objet ITEM parent (pas la variation)
    const itemNames: Record<string, string> = {};
    for (const obj of data.related_objects || []) {
      if (obj.type === 'ITEM' && obj.item_data?.name) itemNames[obj.id] = obj.item_data.name;
    }
    const result: Record<string, string> = {};
    for (const obj of data.objects || []) {
      if (obj.type === 'ITEM_VARIATION') {
        const parentId = obj.item_variation_data?.item_id;
        result[obj.id] = (parentId && itemNames[parentId]) || obj.item_variation_data?.name || '';
      }
    }
    return result;
  } catch {
    return {};
  }
}

// Revenus Square (paiements complétés dans la plage)
async function fetchSquareRevenue(startDate: string, endDate: string) {
  // Montréal UTC-4
  const beginTime = `${startDate}T04:00:00.000Z`;
  const endDay = new Date(endDate + 'T12:00:00Z');
  endDay.setDate(endDay.getDate() + 1);
  const endTime = `${endDay.toISOString().split('T')[0]}T03:59:59.999Z`;

  let total = 0, count = 0;
  let cursor: string | null = null;
  do {
    const url = new URL('https://connect.squareup.com/v2/payments');
    url.searchParams.set('begin_time', beginTime);
    url.searchParams.set('end_time', endTime);
    url.searchParams.set('location_id', LOCATION_ID);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);

    const resp = await fetch(url.toString(), { headers: HEADERS() });
    if (!resp.ok) throw new Error(`Square payments ${resp.status}`);
    const data: any = await resp.json();

    for (const p of data.payments || []) {
      if (p.status === 'COMPLETED' && p.amount_money?.amount) {
        total += Number(p.amount_money.amount);
        count++;
      }
    }
    cursor = data.cursor || null;
  } while (cursor);

  return { total, currency: 'CAD', count, available: true };
}

function computeTimeline(
  localDates: string[],
  startDate: string,
  endDate: string,
): { granularity: 'week' | 'month'; data: { label: string; appointments: number }[] } {
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

  if (diffDays <= 62) {
    // Semaines
    const weekly: Record<string, number> = {};
    for (const d of localDates) {
      const dt = new Date(d + 'T12:00:00');
      const mon = new Date(dt);
      mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const key = mon.toISOString().split('T')[0];
      weekly[key] = (weekly[key] || 0) + 1;
    }
    const filled: Record<string, number> = {};
    const cur = new Date(start);
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      filled[key] = weekly[key] || 0;
      cur.setDate(cur.getDate() + 7);
    }
    return {
      granularity: 'week',
      data: Object.entries(filled)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => ({
          label: new Date(key + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
          appointments: count,
        })),
    };
  }

  // Mois
  const monthly: Record<string, number> = {};
  for (const d of localDates) monthly[d.slice(0, 7)] = (monthly[d.slice(0, 7)] || 0) + 1;
  const filled: Record<string, number> = {};
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 7);
    filled[key] = monthly[key] || 0;
    cur.setMonth(cur.getMonth() + 1);
  }
  return {
    granularity: 'month',
    data: Object.entries(filled)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({
        label: new Date(key + '-01T12:00:00').toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' }),
        appointments: count,
      })),
  };
}

/**
 * GET /api/stats/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Source de vérité : Square Bookings API
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate et endDate requis (YYYY-MM-DD)' });
    }

    // 1. Bookings Square
    const bookings = await fetchSquareBookings(startDate, endDate);
    const total = bookings.length;

    // 2. Dates locales (Montréal) de chaque booking
    const localDates = bookings.map(b => utcToMontrealDate(b.start_at || b.startAt || ''));

    // 3. Clients uniques (par customer_id)
    const uniqueCustomerIds = new Set(
      bookings.map(b => b.customer_id || b.customerId).filter(Boolean)
    );

    // 4. Variation IDs → noms de services
    const variationIds = [...new Set(
      bookings.flatMap(b =>
        ((b.appointment_segments || b.appointmentSegments || []) as any[])
          .map((s: any) => s.service_variation_id || s.serviceVariationId)
          .filter(Boolean)
      )
    )] as string[];
    const serviceNames = await fetchServiceNames(variationIds);

    // 5. Classification des services
    const counts: Record<ServiceKey, number> = {
      ouvertureCreusee: 0, ouvertureHorsTerre: 0,
      fermetureCreusee: 0, fermetureHorsTerre: 0, autre: 0,
    };
    // Détail complet par nom de service
    const serviceDetail: Record<string, number> = {};

    for (const b of bookings) {
      const segs: any[] = b.appointment_segments || b.appointmentSegments || [];
      const varId = segs[0]?.service_variation_id || segs[0]?.serviceVariationId;
      const svcName = (varId && serviceNames[varId]) || '';
      counts[classifyService(svcName)]++;
      if (svcName) serviceDetail[svcName] = (serviceDetail[svcName] || 0) + 1;
    }

    const serviceBreakdown = [
      { label: 'Ouverture créusée',   count: counts.ouvertureCreusee },
      { label: 'Ouverture hors-terre',count: counts.ouvertureHorsTerre },
      { label: 'Fermeture créusée',   count: counts.fermetureCreusee },
      { label: 'Fermeture hors-terre',count: counts.fermetureHorsTerre },
      { label: 'Autre',               count: counts.autre },
    ]
      .filter(s => s.count > 0)
      .map(s => ({ ...s, percentage: total > 0 ? Math.round((s.count / total) * 100) : 0 }));

    // Détail des "autres" services par nom réel
    const autreDetails = Object.entries(serviceDetail)
      .filter(([name]) => classifyService(name) === 'autre')
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => ({ label, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }));

    // 6. Secteurs (lookup MongoDB par squareId)
    const customerIds = [...uniqueCustomerIds];
    let sectors: { label: string; count: number; percentage: number }[] = [];
    try {
      const clients = await Client.find({ squareId: { $in: customerIds } }).select('squareId sector').lean();
      const clientSectorMap = new Map((clients as any[]).map(c => [c.squareId, c.sector]));
      const sectorMap: Record<string, number> = {};
      for (const b of bookings) {
        const cid = b.customer_id || b.customerId;
        const sector = clientSectorMap.get(cid) || 'Non défini';
        sectorMap[sector] = (sectorMap[sector] || 0) + 1;
      }
      sectors = Object.entries(sectorMap)
        .sort(([, a], [, b]) => b - a)
        .map(([label, count]) => ({ label, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }));
    } catch { /* secteurs optionnels */ }

    // 7. Timeline
    const timeline = computeTimeline(localDates, startDate, endDate);

    // 8. Revenus Square
    let revenue = { total: 0, currency: 'CAD', count: 0, available: false };
    try {
      revenue = await fetchSquareRevenue(startDate, endDate);
    } catch (e) {
      console.warn('⚠️  Revenus Square non disponibles:', (e as Error).message);
    }

    res.json({
      success: true,
      period: { startDate, endDate },
      summary: {
        totalAppointments: total,
        uniqueClients: uniqueCustomerIds.size,
        revenue,
      },
      services: {
        ...counts,
        ouverturesTotal: counts.ouvertureCreusee + counts.ouvertureHorsTerre,
        fermeturesTotal: counts.fermetureCreusee + counts.fermetureHorsTerre,
        breakdown: serviceBreakdown,
        autreDetails,
        poolType: {
          creusee:  counts.ouvertureCreusee  + counts.fermetureCreusee,
          horsTerre: counts.ouvertureHorsTerre + counts.fermetureHorsTerre,
        },
      },
      sectors,
      timeline,
    });
  } catch (error) {
    console.error('❌ Erreur stats overview:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
  }
});

export default router;
