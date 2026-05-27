import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import API_CONFIG from '../config/api';
import { importantNotesToItems } from '../utils/importantNotesItems';
import { ImportantNotesCollapsible } from './ImportantNotesCollapsible';
import { Calendar, Clock, MapPin, Phone, User, Building, CheckCircle, AlertCircle } from 'lucide-react';

interface Appointment {
  _id: string;
  name: string;
  phone: string;
  address: string;
  scheduled_date: string;
  scheduled_time: string;
  sector: string;
  district: string | null;
  city: string;
  user_name: string;
  user_id: string;
  conversation_id: string;
  listing_title: string;
  pool_type: string;
  important_notes?: string | string[];
  status: string;
  square_booked: boolean;
  extracted_at: string;
  created_at: string;
  updated_at: string;
  dataHash?: string; // Hash pour détecter les changements
}


const Appointments = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasViewed, setHasViewed] = useState(false);
  const hasMarkedAsViewed = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const hasFetchedPast = useRef(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const fetchPastAppointments = async () => {
    if (hasFetchedPast.current) return;
    hasFetchedPast.current = true;
    setLoadingPast(true);
    try {
      const response = await axios.get(API_CONFIG.endpoints.appointmentsPast);
      if (response.data.success) {
        setPastAppointments(Array.isArray(response.data.appointments) ? response.data.appointments : []);
      }
    } catch (err) {
      console.error('Erreur historique:', err);
    } finally {
      setLoadingPast(false);
    }
  };

  const handleTogglePast = () => {
    if (!showPast && !hasFetchedPast.current) fetchPastAppointments();
    setShowPast(prev => !prev);
  };

  const handleView = () => {
    setHasViewed(true);
    sessionStorage.setItem('appointments_viewed', 'true');
    
    // Stocker les hash de tous les appointments actuels pour détecter les changements futurs
    const currentHashes = appointments
      .map(apt => apt.dataHash)
      .filter(hash => hash) // Filtrer les hash vides
      .join(',');
    
    if (currentHashes) {
      sessionStorage.setItem('appointments_viewed_hashes', currentHashes);
    }
    
    // Déclencher un événement personnalisé pour mettre à jour la notification
    window.dispatchEvent(new Event('appointments_viewed'));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await axios.get(API_CONFIG.endpoints.appointmentsFuture);
        if (response.data.success) {
          setAppointments(Array.isArray(response.data.appointments) ? response.data.appointments : []);
        } else {
          setError('Erreur lors de la récupération des rendez-vous');
        }
      } catch (err) {
        console.error('Erreur:', err);
        setError('Impossible de charger les rendez-vous');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Calculer la date d'aujourd'hui à chaque rendu pour s'assurer que le filtre est toujours à jour
  // Pas de useMemo ici car on veut recalculer à chaque rendu pour avoir la date actuelle
  const getTodayString = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0]; // Format YYYY-MM-DD
  };

  // Filtrer les appointments pour exclure ceux dont la date est passée
  // Ce filtre s'applique automatiquement à chaque rendu, donc au chargement de la page
  const filteredAppointments = useMemo(() => {
    const list = Array.isArray(appointments) ? appointments : [];
    const todayString = getTodayString();
    return list.filter((appointment) => {
      // Garder les appointments sans date
      if (!appointment.scheduled_date) {
        return true;
      }
      // Exclure les appointments dont la date est strictement inférieure à aujourd'hui
      return appointment.scheduled_date >= todayString;
    });
  }, [appointments]);

  // Marquer comme vu quand les appointments sont chargés (une seule fois)
  useEffect(() => {
    if (filteredAppointments.length > 0 && !hasMarkedAsViewed.current) {
      hasMarkedAsViewed.current = true;
      handleView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAppointments.length]);

  const formatDate = (dateString: string) => {
    if (!dateString || typeof dateString !== 'string') return 'N/A';
    const ymd = dateString.slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) {
      const d = new Date(dateString);
      return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('fr-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime())
      ? 'N/A'
      : date.toLocaleDateString('fr-CA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
  };

  const formatTime = (timeString: string) => {
    if (timeString == null || timeString === '') return 'N/A';
    const s = typeof timeString === 'string' ? timeString : String(timeString);
    const [hours, minutes = '00'] = s.split(':');
    const hour = parseInt(hours, 10);
    if (Number.isNaN(hour)) return 'N/A';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes.padStart(2, '0').slice(0, 2)} ${ampm}`;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    
    if (statusLower === 'confirmed') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Confirmé
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
        <AlertCircle className="w-3 h-3 mr-1" />
        {status || 'En attente'}
      </span>
    );
  };

  // Grouper les appointments par date
  const groupedAppointments = filteredAppointments.reduce((acc, appointment) => {
    const date = appointment.scheduled_date || 'Sans date';
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(appointment);
    return acc;
  }, {} as Record<string, Appointment[]>);

  // Grouper les anciens appointments par date
  const groupedPastAppointments = pastAppointments.reduce((acc, appointment) => {
    const date = appointment.scheduled_date || 'Sans date';
    if (!acc[date]) acc[date] = [];
    acc[date].push(appointment);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const sortedPastDates = Object.keys(groupedPastAppointments).sort((a, b) => {
    if (a === 'Sans date') return 1;
    if (b === 'Sans date') return -1;
    return b.localeCompare(a); // Plus récent en premier
  });

  // Trier les groupes par date de booking la plus récente dans chaque groupe (descendant)
  const sortedDates = Object.keys(groupedAppointments).sort((a, b) => {
    if (a === 'Sans date') return 1;
    if (b === 'Sans date') return -1;
    const maxA = Math.max(...groupedAppointments[a].map(apt => new Date(apt.created_at || 0).getTime()));
    const maxB = Math.max(...groupedAppointments[b].map(apt => new Date(apt.created_at || 0).getTime()));
    return maxB - maxA;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mb-4"></div>
          <p className="text-gray-300">Chargement des rendez-vous...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent mb-2">
                Rendez-vous à venir
              </h1>
              <p className="text-gray-400">
                {filteredAppointments.length} {filteredAppointments.length === 1 ? 'rendez-vous' : 'rendez-vous'} programmé{filteredAppointments.length > 1 ? 's' : ''}
              </p>
            </div>
            {!hasViewed && filteredAppointments.length > 0 && (
              <button
                onClick={handleView}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-300 rounded-md text-sm font-medium border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-200 backdrop-blur-sm"
              >
                Marquer comme vu
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {filteredAppointments.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Aucun rendez-vous à venir</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-lg border border-indigo-500/30 shadow-lg shadow-indigo-500/10 p-6">
                <h2 className="text-xl font-semibold text-cyan-300 mb-4 flex items-center">
                  <Calendar className="w-5 h-5 mr-2" />
                  {date === 'Sans date' ? 'Sans date' : formatDate(date)}
                </h2>
                
                <div className="space-y-4">
                  {[...groupedAppointments[date]].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map((appointment) => {
                    const noteItems = importantNotesToItems(appointment.important_notes);
                    const isInSquare = appointment.square_booked === true;
                    return (
                    <div
                      key={appointment._id}
                      className={`rounded-lg p-5 transition-all duration-300 ${
                        isInSquare
                          ? 'bg-emerald-950/40 border-2 border-emerald-400/70 shadow-md shadow-emerald-500/20'
                          : 'bg-gray-800/50 border border-gray-700/50 hover:border-cyan-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-white">
                              {appointment.name || 'Nom non disponible'}
                            </h3>
                            {getStatusBadge(appointment.status)}
                            {isInSquare ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/50 shadow-sm shadow-emerald-500/20">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Booké Square
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700/40 text-gray-500 border border-gray-600/30">
                                À rentrer Square
                              </span>
                            )}
                          </div>
                          
                          <div className="text-sm text-gray-400 mb-3">
                            {appointment.listing_title && (
                              <span className="inline-block px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded mr-2 mb-2">
                                {appointment.listing_title}
                              </span>
                            )}
                            {appointment.pool_type && (
                              <span className="inline-block px-2 py-1 bg-purple-500/20 text-purple-300 rounded mr-2 mb-2">
                                {appointment.pool_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          {appointment.phone && (
                            <div
                              className="flex items-center text-sm text-gray-300 cursor-pointer select-none group"
                              onClick={() => copyToClipboard(appointment.phone, `phone_${appointment._id}`)}
                            >
                              <Phone className="w-4 h-4 mr-2 text-cyan-400 flex-shrink-0" />
                              {copiedId === `phone_${appointment._id}` ? (
                                <span className="text-green-400 font-medium">Copié !</span>
                              ) : (
                                <span className="group-hover:text-cyan-300 transition-colors">{appointment.phone}</span>
                              )}
                            </div>
                          )}

                          {appointment.address && (
                            <div
                              className="flex items-start text-sm text-gray-300 cursor-pointer select-none group"
                              onClick={() => copyToClipboard(appointment.address, `addr_${appointment._id}`)}
                            >
                              <MapPin className="w-4 h-4 mr-2 text-cyan-400 mt-0.5 flex-shrink-0" />
                              {copiedId === `addr_${appointment._id}` ? (
                                <span className="text-green-400 font-medium">Copié !</span>
                              ) : (
                                <span className="group-hover:text-cyan-300 transition-colors">{appointment.address}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {appointment.scheduled_time && (
                            <div className="flex items-center text-sm text-gray-300">
                              <Clock className="w-4 h-4 mr-2 text-cyan-400" />
                              <span>{formatTime(appointment.scheduled_time)}</span>
                            </div>
                          )}
                          
                          {(appointment.city || appointment.sector) && (
                            <div className="flex items-center text-sm text-gray-300">
                              <Building className="w-4 h-4 mr-2 text-cyan-400" />
                              <span>
                                {appointment.city || ''}
                                {appointment.city && appointment.sector && ' - '}
                                {appointment.sector || ''}
                                {appointment.district && ` (${appointment.district})`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {noteItems.length > 0 && (
                        <ImportantNotesCollapsible items={noteItems} className="mt-4" />
                      )}

                      {appointment.user_name && (
                        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center gap-1.5 text-xs text-gray-500">
                          <User className="w-3 h-3 shrink-0" />
                          <span>Booké par : {appointment.user_name}</span>
                          {appointment.created_at && (
                            <>
                              <span className="text-gray-600">·</span>
                              <span className="text-gray-500">
                                {new Date(appointment.created_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                                {' à '}
                                {new Date(appointment.created_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Historique des anciens rendez-vous */}
        <div className="mt-10">
          <button
            onClick={handleTogglePast}
            className="w-full flex items-center justify-between px-5 py-3 bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/50 hover:border-gray-600/60 rounded-lg transition-all duration-200 text-left group"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300 transition-colors">
                Historique des anciens rendez-vous
              </span>
              {hasFetchedPast.current && (
                <span className="text-xs text-gray-600 ml-1">
                  ({pastAppointments.length})
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPast && (
            <div className="mt-4">
              {loadingPast ? (
                <div className="flex items-center justify-center py-10">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-600"></div>
                </div>
              ) : pastAppointments.length === 0 ? (
                <p className="text-center text-gray-600 py-8 text-sm">Aucun ancien rendez-vous</p>
              ) : (
                <div className="space-y-4">
                  {sortedPastDates.map((date) => (
                    <div key={date} className="bg-gray-900/30 backdrop-blur-sm rounded-lg border border-gray-700/30 p-5">
                      <h2 className="text-base font-semibold text-gray-500 mb-3 flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        {date === 'Sans date' ? 'Sans date' : formatDate(date)}
                      </h2>
                      <div className="space-y-3">
                        {groupedPastAppointments[date].map((appointment) => {
                          const noteItems = importantNotesToItems(appointment.important_notes);
                          const isInSquare = appointment.square_booked === true;
                          return (
                            <div
                              key={appointment._id}
                              className="rounded-lg p-4 bg-gray-800/30 border border-gray-700/30 opacity-70"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h3 className="text-sm font-semibold text-gray-300">
                                      {appointment.name || 'Nom non disponible'}
                                    </h3>
                                    {isInSquare && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Booké Square
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {appointment.listing_title && (
                                      <span className="inline-block px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500/70 rounded mr-1 mb-1">
                                        {appointment.listing_title}
                                      </span>
                                    )}
                                    {appointment.pool_type && (
                                      <span className="inline-block px-1.5 py-0.5 bg-purple-500/10 text-purple-500/70 rounded mr-1 mb-1">
                                        {appointment.pool_type}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500">
                                <div className="space-y-1">
                                  {appointment.phone && (
                                    <div
                                      className="flex items-center cursor-pointer group/copy"
                                      onClick={() => copyToClipboard(appointment.phone, `past_phone_${appointment._id}`)}
                                    >
                                      <Phone className="w-3 h-3 mr-1.5 text-gray-600 flex-shrink-0" />
                                      {copiedId === `past_phone_${appointment._id}` ? (
                                        <span className="text-green-500">Copié !</span>
                                      ) : (
                                        <span className="group-hover/copy:text-gray-400 transition-colors">{appointment.phone}</span>
                                      )}
                                    </div>
                                  )}
                                  {appointment.address && (
                                    <div
                                      className="flex items-start cursor-pointer group/copy"
                                      onClick={() => copyToClipboard(appointment.address, `past_addr_${appointment._id}`)}
                                    >
                                      <MapPin className="w-3 h-3 mr-1.5 text-gray-600 mt-0.5 flex-shrink-0" />
                                      {copiedId === `past_addr_${appointment._id}` ? (
                                        <span className="text-green-500">Copié !</span>
                                      ) : (
                                        <span className="group-hover/copy:text-gray-400 transition-colors">{appointment.address}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  {appointment.scheduled_time && (
                                    <div className="flex items-center">
                                      <Clock className="w-3 h-3 mr-1.5 text-gray-600" />
                                      <span>{formatTime(appointment.scheduled_time)}</span>
                                    </div>
                                  )}
                                  {(appointment.city || appointment.sector) && (
                                    <div className="flex items-center">
                                      <Building className="w-3 h-3 mr-1.5 text-gray-600" />
                                      <span>
                                        {appointment.city || ''}
                                        {appointment.city && appointment.sector && ' - '}
                                        {appointment.sector || ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {noteItems.length > 0 && (
                                <ImportantNotesCollapsible items={noteItems} className="mt-3" />
                              )}

                              {appointment.user_name && (
                                <div className="mt-3 pt-3 border-t border-gray-700/30 flex items-center gap-1.5 text-xs text-gray-600">
                                  <User className="w-3 h-3 shrink-0" />
                                  <span>Booké par : {appointment.user_name}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Appointments;

