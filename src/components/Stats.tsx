import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import API_CONFIG from '../config/api';
import {
  BarChart2, Users, DollarSign, Droplets, TrendingUp, Calendar,
  Waves, ChevronDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceBreakdownItem { label: string; count: number; percentage: number }
interface SectorItem          { label: string; count: number; percentage: number }
interface TimelinePoint       { label: string; appointments: number }

interface StatsData {
  period: { startDate: string; endDate: string };
  summary: {
    totalAppointments: number;
    uniqueClients: number;
    revenue: { total: number; currency: string; count: number; available: boolean };
  };
  services: {
    ouvertureCreusee: number;
    ouvertureHorsTerre: number;
    fermetureCreusee: number;
    fermetureHorsTerre: number;
    ouverturesTotal: number;
    fermeturesTotal: number;
    autre: number;
    breakdown: ServiceBreakdownItem[];
    autreDetails: ServiceBreakdownItem[];
    poolType: { creusee: number; horsTerre: number };
  };
  sectors: SectorItem[];
  timeline: { granularity: 'week' | 'month'; data: TimelinePoint[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getLastNDays = (n: number) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n + 1);
  return { start: toDateStr(start), end: toDateStr(end) };
};

const getCurrentMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
};

const getSeason = (year: number) => ({ start: `${year}-04-01`, end: `${year}-10-31` });

const fmtCurrency = (cents: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);

// ─── Sub-components ───────────────────────────────────────────────────────────

const KpiCard = ({
  icon, label, value, sub, border = 'border-indigo-500/30', textColor = 'text-white',
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  border?: string; textColor?: string;
}) => (
  <div className={`bg-gradient-to-br from-gray-900/60 to-gray-800/60 backdrop-blur-sm rounded-xl border ${border} p-5 flex flex-col gap-2`}>
    <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
      {icon}
      <span>{label}</span>
    </div>
    <div className={`text-3xl font-bold ${textColor}`}>{value}</div>
    {sub && <div className="text-xs text-gray-500">{sub}</div>}
  </div>
);

const HBar = ({
  label, count, percentage, barColor = 'bg-indigo-500', textColor = 'text-gray-300',
}: {
  label: string; count: number; percentage: number; barColor?: string; textColor?: string;
}) => (
  <div>
    <div className="flex justify-between items-center mb-1.5">
      <span className={`text-sm font-medium ${textColor}`}>{label}</span>
      <span className="text-sm text-gray-300 font-mono tabular-nums">
        {count} <span className="text-gray-600 text-xs">({percentage}%)</span>
      </span>
    </div>
    <div className="h-2.5 bg-gray-700/50 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
        style={{ width: `${Math.max(percentage, percentage > 0 ? 2 : 0)}%` }}
      />
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const Stats = () => {
  const year = new Date().getFullYear();
  const defaultSeason = year >= 2026 ? year - 1 : year;

  const [startDate, setStartDate] = useState(getSeason(defaultSeason).start);
  const [endDate,   setEndDate]   = useState(getSeason(defaultSeason).end);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [stats,     setStats]     = useState<StatsData | null>(null);
  const [activePreset, setActivePreset] = useState(`Saison ${defaultSeason}`);

  const presets = [
    { label: '30 jours',          getRange: () => getLastNDays(30) },
    { label: 'Ce mois',           getRange: () => getCurrentMonth() },
    { label: `Saison ${year}`,    getRange: () => getSeason(year) },
    { label: `Saison ${year - 1}`,getRange: () => getSeason(year - 1) },
    { label: `Saison ${year - 2}`,getRange: () => getSeason(year - 2) },
  ];

  const fetchStats = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(API_CONFIG.endpoints.statsOverview, {
        params: { startDate: start, endDate: end },
      });
      if (data.success) {
        setStats(data);
      } else {
        setError(data.error || 'Erreur lors du chargement');
      }
    } catch {
      setError('Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(startDate, endDate); }, []); // eslint-disable-line

  const handlePreset = (label: string, getRange: () => { start: string; end: string }) => {
    const r = getRange();
    setStartDate(r.start);
    setEndDate(r.end);
    setActivePreset(label);
    fetchStats(r.start, r.end);
  };

  // ── Derived display values ──────────────────────────────────────────────────

  const SERVICE_CONFIG: Record<string, { bar: string; text: string }> = {
    'Ouverture créusée':   { bar: 'bg-cyan-500',   text: 'text-cyan-300' },
    'Ouverture hors-terre':{ bar: 'bg-blue-500',   text: 'text-blue-300' },
    'Fermeture créusée':   { bar: 'bg-amber-500',  text: 'text-amber-300' },
    'Fermeture hors-terre':{ bar: 'bg-orange-500', text: 'text-orange-300' },
    'Autre':               { bar: 'bg-gray-500',   text: 'text-gray-400' },
  };

  const maxTimeline = stats
    ? Math.max(...stats.timeline.data.map(d => d.appointments), 1)
    : 1;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent mb-1">
            Statistiques & Performances
          </h1>
          <p className="text-gray-400 text-sm">Vue d'ensemble de votre activité par période</p>
        </div>

        {/* ── Date selector ── */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-xl border border-indigo-500/30 p-5">
          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => handlePreset(p.label, p.getRange)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  activePreset === p.label
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                    : 'bg-gray-800/50 text-gray-400 border-gray-700/50 hover:text-gray-300 hover:border-gray-600/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Du</span>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setActivePreset(''); }}
                className="bg-gray-800/70 border border-gray-700/50 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Au</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setActivePreset(''); }}
                className="bg-gray-800/70 border border-gray-700/50 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <button
              onClick={() => { setActivePreset(''); fetchStats(startDate, endDate); }}
              disabled={loading || !startDate || !endDate}
              className="px-4 py-1.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-300 rounded-lg text-sm font-medium border border-cyan-400/40 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ── Loading placeholder ── */}
        {loading && !stats && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mb-4" />
              <p className="text-gray-400">Chargement des statistiques…</p>
            </div>
          </div>
        )}

        {/* ── Stats content ── */}
        {stats && (
          <div className={`space-y-6 transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>

            {/* ── Row 1 : main KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard
                icon={<BarChart2 className="w-4 h-4 text-cyan-400" />}
                label="Services réalisés"
                value={stats.summary.totalAppointments}
                sub={`${stats.summary.uniqueClients} clients distincts`}
                border="border-cyan-500/30"
                textColor="text-cyan-300"
              />
              <KpiCard
                icon={<Users className="w-4 h-4 text-purple-400" />}
                label="Clients uniques"
                value={stats.summary.uniqueClients}
                sub="identifiés par téléphone"
                border="border-purple-500/30"
                textColor="text-purple-300"
              />
              <div className={`bg-gradient-to-br from-gray-900/60 to-gray-800/60 backdrop-blur-sm rounded-xl border border-emerald-500/30 p-5 flex flex-col gap-2 col-span-2 md:col-span-1`}>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Revenus Square</span>
                  {!stats.summary.revenue.available && (
                    <span className="text-gray-600 normal-case">(non dispo.)</span>
                  )}
                </div>
                <div className="text-3xl font-bold text-emerald-300">
                  {stats.summary.revenue.available
                    ? fmtCurrency(stats.summary.revenue.total)
                    : '—'}
                </div>
                {stats.summary.revenue.available && stats.summary.revenue.count > 0 && (
                  <div className="text-xs text-gray-500">
                    {stats.summary.revenue.count} paiements · moy.{' '}
                    {fmtCurrency(Math.round(stats.summary.revenue.total / stats.summary.revenue.count))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 2 : service type KPIs ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                {
                  label: 'Ouv. créusées', value: stats.services.ouvertureCreusee,
                  border: 'border-cyan-500/30', text: 'text-cyan-300',
                  icon: <Waves className="w-4 h-4 text-cyan-400" />,
                },
                {
                  label: 'Ouv. hors-terre', value: stats.services.ouvertureHorsTerre,
                  border: 'border-blue-500/30', text: 'text-blue-300',
                  icon: <Waves className="w-4 h-4 text-blue-400" />,
                },
                {
                  label: 'Ferm. créusées', value: stats.services.fermetureCreusee,
                  border: 'border-amber-500/30', text: 'text-amber-300',
                  icon: <Droplets className="w-4 h-4 text-amber-400" />,
                },
                {
                  label: 'Ferm. hors-terre', value: stats.services.fermetureHorsTerre,
                  border: 'border-orange-500/30', text: 'text-orange-300',
                  icon: <Droplets className="w-4 h-4 text-orange-400" />,
                },
                {
                  label: 'Ouvertures total', value: stats.services.ouverturesTotal,
                  border: 'border-teal-500/30', text: 'text-teal-300',
                  icon: <TrendingUp className="w-4 h-4 text-teal-400" />,
                  sub: `${stats.services.fermeturesTotal} fermetures`,
                },
              ].map(c => (
                <div key={c.label} className={`bg-gradient-to-br from-gray-900/60 to-gray-800/60 backdrop-blur-sm rounded-xl border ${c.border} p-4`}>
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-2">{c.icon}<span>{c.label}</span></div>
                  <div className={`text-2xl font-bold ${c.text}`}>{c.value}</div>
                  {c.sub && <div className="text-xs text-gray-600 mt-0.5">{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* ── Row 3 : service breakdown + sector ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Service breakdown */}
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-xl border border-indigo-500/30 p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-5 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-400" />
                  Répartition des services
                </h2>
                {stats.services.breakdown.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-6">Aucun service dans cette période</p>
                ) : (
                  <div className="space-y-4">
                    {stats.services.breakdown.map(item => (
                      <HBar
                        key={item.label}
                        label={item.label}
                        count={item.count}
                        percentage={item.percentage}
                        barColor={SERVICE_CONFIG[item.label]?.bar || 'bg-gray-500'}
                        textColor={SERVICE_CONFIG[item.label]?.text || 'text-gray-400'}
                      />
                    ))}
                  </div>
                )}

                {/* Pool type split */}
                {(stats.services.poolType.creusee + stats.services.poolType.horsTerre) > 0 && (
                  <div className="mt-6 pt-5 border-t border-gray-700/40 space-y-3">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Type de piscine</p>
                    {[
                      { label: 'Créusée / In-ground', val: stats.services.poolType.creusee, color: 'bg-cyan-500' },
                      { label: 'Hors-terre / Above-ground', val: stats.services.poolType.horsTerre, color: 'bg-blue-500' },
                    ].map(pt => {
                      const tot = stats.services.poolType.creusee + stats.services.poolType.horsTerre;
                      const pct = tot > 0 ? Math.round((pt.val / tot) * 100) : 0;
                      return (
                        <HBar key={pt.label} label={pt.label} count={pt.val} percentage={pct} barColor={pt.color} textColor="text-gray-400" />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sector breakdown */}
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-xl border border-indigo-500/30 p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-5 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  Par secteur géographique
                </h2>
                {stats.sectors.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-6">Aucune donnée de secteur</p>
                ) : (
                  <div className="space-y-4">
                    {stats.sectors.map((s, i) => {
                      const colors = ['bg-violet-500', 'bg-indigo-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-gray-500'];
                      return (
                        <HBar
                          key={s.label}
                          label={s.label}
                          count={s.count}
                          percentage={s.percentage}
                          barColor={colors[i % colors.length]}
                          textColor="text-gray-300"
                        />
                      );
                    })}
                  </div>
                )}

                {/* Détail des "Autre" services */}
                {stats.services.autreDetails.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-gray-700/40 space-y-3">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Détail — autres services</p>
                    {stats.services.autreDetails.map(s => (
                      <HBar key={s.label} label={s.label} count={s.count} percentage={s.percentage} barColor="bg-gray-500" textColor="text-gray-400" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Timeline ── */}
            {stats.timeline.data.length > 0 && (
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-xl border border-indigo-500/30 p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-6 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  Activité par {stats.timeline.granularity === 'week' ? 'semaine' : 'mois'}
                  <span className="text-gray-600 font-normal text-xs ml-1">
                    (max {maxTimeline} service{maxTimeline > 1 ? 's' : ''})
                  </span>
                </h2>

                {/* Bar chart */}
                <div className="relative">
                  {/* Y-axis guide lines */}
                  <div className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none">
                    {[1, 0.75, 0.5, 0.25, 0].map(frac => (
                      <div key={frac} className="w-full border-t border-gray-700/30 relative">
                        <span className="absolute -top-2 -left-1 text-xs text-gray-700 select-none">
                          {frac === 0 ? 0 : Math.round(maxTimeline * frac)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bars */}
                  <div className="flex items-end gap-1 pl-5 h-48 overflow-x-auto">
                    {stats.timeline.data.map(point => {
                      const hPct = maxTimeline > 0 ? (point.appointments / maxTimeline) * 100 : 0;
                      const isEmpty = point.appointments === 0;
                      return (
                        <div key={point.label} className="flex flex-col items-center gap-1 flex-1 min-w-[28px] group relative">
                          {/* Tooltip */}
                          {!isEmpty && (
                            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 mb-1 bg-gray-800 border border-gray-600/50 rounded-md px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity shadow-lg">
                              <span className="font-semibold text-cyan-300">{point.appointments}</span>
                              <span className="text-gray-400"> service{point.appointments > 1 ? 's' : ''}</span>
                            </div>
                          )}

                          {/* Bar container */}
                          <div className="w-full flex items-end" style={{ height: '152px' }}>
                            <div
                              className={`w-full rounded-t-sm transition-all duration-700 ${
                                isEmpty
                                  ? 'bg-gray-800/30'
                                  : 'bg-gradient-to-t from-cyan-700 to-cyan-400 hover:from-cyan-600 hover:to-cyan-300 cursor-default'
                              }`}
                              style={{ height: isEmpty ? '4px' : `${Math.max(hPct, 3)}%` }}
                            />
                          </div>

                          {/* Label */}
                          <span className="text-xs text-gray-600 truncate w-full text-center select-none leading-tight pb-0.5">
                            {point.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Période info footer ── */}
            <div className="flex items-center gap-2 text-xs text-gray-600 pb-4">
              <ChevronDown className="w-3 h-3" />
              <span>
                Période : {new Date(stats.period.startDate + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' → '}
                {new Date(stats.period.endDate + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-gray-700">·</span>
              <span>Données issues des rendez-vous enregistrés par le bot</span>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Stats;
