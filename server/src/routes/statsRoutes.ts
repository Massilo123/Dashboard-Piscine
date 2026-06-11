import { Router, Request, Response } from 'express';
import Appointment from '../models/Appointment';

const router = Router();

const SQUARE_TOKEN = () => process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_HEADERS = () => ({
  Authorization: `Bearer ${SQUARE_TOKEN()}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-01-18',
});
const LOCATION_ID = 'L24K8X13MB1A7';

type ServiceKey = 'ouvertureCreusee' | 'ouvertureHorsTerre' | 'fermetureCreusee' | 'fermetureHorsTerre' | 'autre';

function classifyService(listingTitle: string, poolType: string): ServiceKey {
  const title = (listingTitle || '').toLowerCase();
  const pool = (poolType || '').toLowerCase();
  const isHorsTerre =
    title.includes('hors') || pool.includes('hors') || pool.includes('above') || pool.includes('ground');
  if (title.includes('ouverture')) return isHorsTerre ? 'ouvertureHorsTerre' : 'ouvertureCreusee';
  if (title.includes('fermeture')) return isHorsTerre ? 'fermetureHorsTerre' : 'fermetureCreusee';
  return 'autre';
}

function computeTimeline(
  appointments: any[],
  startDate: string,
  endDate: string
): { granularity: 'week' | 'month'; data: { label: string; appointments: number }[] } {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);

  if (diffDays <= 62) {
    // Weekly buckets
    const weekly: Record<string, number> = {};
    for (const apt of appointments) {
      if (!apt.scheduled_date) continue;
      const d = new Date(apt.scheduled_date + 'T12:00:00');
      const day = d.getDay(); // 0=Sun
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const key = monday.toISOString().split('T')[0];
      weekly[key] = (weekly[key] || 0) + 1;
    }
    // Fill all weeks in range
    const filled: Record<string, number> = {};
    const cur = new Date(start);
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      filled[key] = weekly[key] || 0;
      cur.setDate(cur.getDate() + 7);
    }
    const data = Object.entries(filled)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const d = new Date(key + 'T12:00:00');
        return {
          label: d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
          appointments: count,
        };
      });
    return { granularity: 'week', data };
  }

  // Monthly buckets
  const monthly: Record<string, number> = {};
  for (const apt of appointments) {
    if (!apt.scheduled_date) continue;
    const month = (apt.scheduled_date as string).slice(0, 7);
    monthly[month] = (monthly[month] || 0) + 1;
  }
  const filled: Record<string, number> = {};
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur.getFullYear() < end.getFullYear() || cur.getMonth() <= end.getMonth()) {
    const key = cur.toISOString().slice(0, 7);
    filled[key] = monthly[key] || 0;
    cur.setMonth(cur.getMonth() + 1);
    if (cur.getFullYear() > end.getFullYear() + 1) break;
  }
  const data = Object.entries(filled)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const d = new Date(key + '-01T12:00:00');
      return {
        label: d.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' }),
        appointments: count,
      };
    });
  return { granularity: 'month', data };
}

async function fetchSquareRevenue(startDate: string, endDate: string) {
  const beginTime = `${startDate}T00:00:00.000Z`;
  const endTime = `${endDate}T23:59:59.999Z`;
  let total = 0;
  let count = 0;
  let cursor: string | null = null;

  do {
    const url = new URL('https://connect.squareup.com/v2/payments');
    url.searchParams.set('begin_time', beginTime);
    url.searchParams.set('end_time', endTime);
    url.searchParams.set('location_id', LOCATION_ID);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);

    const resp = await fetch(url.toString(), { headers: SQUARE_HEADERS() });
    if (!resp.ok) throw new Error(`Square payments API ${resp.status}`);
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

/**
 * GET /api/stats/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate et endDate requis (YYYY-MM-DD)' });
    }

    // 1. Load appointments in range
    const appointments = await Appointment.find({
      scheduled_date: { $gte: startDate, $lte: endDate },
    }).lean();

    // 2. Unique clients (by phone)
    const phones = new Set((appointments as any[]).map((a) => (a.phone || '').replace(/\D/g, '')).filter(Boolean));

    // 3. Square booked count
    const squareBooked = (appointments as any[]).filter((a) => a.square_booked === true).length;

    // 4. Service classification
    const counts: Record<ServiceKey, number> = {
      ouvertureCreusee: 0,
      ouvertureHorsTerre: 0,
      fermetureCreusee: 0,
      fermetureHorsTerre: 0,
      autre: 0,
    };
    for (const apt of appointments as any[]) {
      counts[classifyService(apt.listing_title, apt.pool_type)]++;
    }

    const total = appointments.length;
    const serviceBreakdown = [
      { label: 'Ouverture créusée', count: counts.ouvertureCreusee },
      { label: 'Ouverture hors-terre', count: counts.ouvertureHorsTerre },
      { label: 'Fermeture créusée', count: counts.fermetureCreusee },
      { label: 'Fermeture hors-terre', count: counts.fermetureHorsTerre },
      { label: 'Autre', count: counts.autre },
    ]
      .filter((s) => s.count > 0)
      .map((s) => ({ ...s, percentage: total > 0 ? Math.round((s.count / total) * 100) : 0 }));

    // 5. Pool type aggregation
    const poolType = {
      creusee: counts.ouvertureCreusee + counts.fermetureCreusee,
      horsTerre: counts.ouvertureHorsTerre + counts.fermetureHorsTerre,
    };

    // 6. Sector breakdown
    const sectorMap: Record<string, number> = {};
    for (const apt of appointments as any[]) {
      const s = apt.sector || 'Non défini';
      sectorMap[s] = (sectorMap[s] || 0) + 1;
    }
    const sectors = Object.entries(sectorMap)
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => ({
        label,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    // 7. Timeline
    const timeline = computeTimeline(appointments as any[], startDate, endDate);

    // 8. Revenue from Square (optional, don't fail if unavailable)
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
        uniqueClients: phones.size,
        squareBooked,
        revenue,
      },
      services: {
        ...counts,
        fermeturesTotal: counts.fermetureCreusee + counts.fermetureHorsTerre,
        ouverturesTotal: counts.ouvertureCreusee + counts.ouvertureHorsTerre,
        breakdown: serviceBreakdown,
        poolType,
      },
      sectors,
      timeline,
    });
  } catch (error) {
    console.error('❌ Erreur stats overview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    });
  }
});

export default router;
