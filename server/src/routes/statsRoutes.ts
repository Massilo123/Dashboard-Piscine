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

// Récupère tous les bookings Square pour une plage ≤31 jours (pagination incluse)
async function fetchSquareBookingsChunk(startAtMin: string, startAtMax: string): Promise<any[]> {
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

// Découpe la plage en chunks de 30 jours (limite Square) et combine les résultats
async function fetchSquareBookings(startDate: string, endDate: string): Promise<any[]> {
  const CHUNK_DAYS = 30;
  const chunks: { min: string; max: string }[] = [];

  const cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');

  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const minDate = cur.toISOString().split('T')[0];
    const maxDay = new Date(chunkEnd);
    maxDay.setDate(maxDay.getDate() + 1);

    chunks.push({
      min: `${minDate}T04:00:00.000Z`,
      max: `${maxDay.toISOString().split('T')[0]}T03:59:59.999Z`,
    });

    cur.setDate(cur.getDate() + CHUNK_DAYS);
  }

  const results = await Promise.all(chunks.map(c => fetchSquareBookingsChunk(c.min, c.max)));
  return results.flat();
}

type ServiceInfo = { name: string; price: number }; // price en cents CAD

// Résout les noms et prix de services depuis le catalogue Square (batch)
async function fetchServiceInfo(variationIds: string[]): Promise<Record<string, ServiceInfo>> {
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
    const result: Record<string, ServiceInfo> = {};
    for (const obj of data.objects || []) {
      if (obj.type === 'ITEM_VARIATION') {
        const parentId = obj.item_variation_data?.item_id;
        const name = (parentId && itemNames[parentId]) || obj.item_variation_data?.name || '';
        const price = obj.item_variation_data?.price_money?.amount ?? 0;
        result[obj.id] = { name, price: Number(price) };
      }
    }
    return result;
  } catch {
    return {};
  }
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

    // 4. Variation IDs → noms et prix de services
    const variationIds = [...new Set(
      bookings.flatMap(b =>
        ((b.appointment_segments || b.appointmentSegments || []) as any[])
          .map((s: any) => s.service_variation_id || s.serviceVariationId)
          .filter(Boolean)
      )
    )] as string[];
    const serviceInfo = await fetchServiceInfo(variationIds);

    // 5. Classification des services + calcul revenu catalogue
    const counts: Record<ServiceKey, number> = {
      ouvertureCreusee: 0, ouvertureHorsTerre: 0,
      fermetureCreusee: 0, fermetureHorsTerre: 0, autre: 0,
    };
    // Détail complet par nom de service
    const serviceDetail: Record<string, number> = {};
    let catalogRevenueCents = 0;

    for (const b of bookings) {
      const segs: any[] = b.appointment_segments || b.appointmentSegments || [];
      const varId = segs[0]?.service_variation_id || segs[0]?.serviceVariationId;
      const info = (varId && serviceInfo[varId]) || { name: '', price: 0 };
      counts[classifyService(info.name)]++;
      if (info.name) serviceDetail[info.name] = (serviceDetail[info.name] || 0) + 1;
      catalogRevenueCents += info.price;
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

    // 8. Revenus calculés depuis le catalogue Square (prix × nombre de services)
    const revenue = {
      total: catalogRevenueCents,
      currency: 'CAD',
      count: total,
      available: true,
    };

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
