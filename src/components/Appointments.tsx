import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import API_CONFIG from '../config/api';
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
  status: string;
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

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_CONFIG.endpoints.appointmentsFuture);
      
      if (response.data.success) {
        setAppointments(response.data.appointments || []);
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

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Marquer comme vu quand les appointments sont chargés (une seule fois)
  useEffect(() => {
    if (appointments.length > 0 && !hasMarkedAsViewed.current) {
      hasMarkedAsViewed.current = true;
      handleView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.length]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-CA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    // Format HH:mm en format 12h
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
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
  const groupedAppointments = appointments.reduce((acc, appointment) => {
    const date = appointment.scheduled_date || 'Sans date';
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(appointment);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const sortedDates = Object.keys(groupedAppointments).sort((a, b) => {
    if (a === 'Sans date') return 1;
    if (b === 'Sans date') return -1;
    return new Date(a).getTime() - new Date(b).getTime();
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
                {appointments.length} {appointments.length === 1 ? 'rendez-vous' : 'rendez-vous'} programmé{appointments.length > 1 ? 's' : ''}
              </p>
            </div>
            {!hasViewed && appointments.length > 0 && (
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

        {appointments.length === 0 ? (
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
                  {groupedAppointments[date].map((appointment) => (
                    <div
                      key={appointment._id}
                      className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5 hover:border-cyan-500/50 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-white">
                              {appointment.name || 'Nom non disponible'}
                            </h3>
                            {getStatusBadge(appointment.status)}
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
                            <div className="flex items-center text-sm text-gray-300">
                              <Phone className="w-4 h-4 mr-2 text-cyan-400" />
                              <a 
                                href={`tel:${appointment.phone}`}
                                className="hover:text-cyan-300 transition-colors"
                              >
                                {appointment.phone}
                              </a>
                            </div>
                          )}
                          
                          {appointment.address && (
                            <div className="flex items-start text-sm text-gray-300">
                              <MapPin className="w-4 h-4 mr-2 text-cyan-400 mt-0.5 flex-shrink-0" />
                              <span>{appointment.address}</span>
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

                      {appointment.user_name && (
                        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center text-xs text-gray-500">
                          <User className="w-3 h-3 mr-1" />
                          <span>Booké par: {appointment.user_name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Appointments;

