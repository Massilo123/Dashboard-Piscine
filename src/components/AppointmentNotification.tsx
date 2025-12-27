import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import API_CONFIG from '../config/api';
import { Bell } from 'lucide-react';

const AppointmentNotification = () => {
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Ne pas afficher la notification si on est déjà sur la page des appointments
    if (location.pathname === '/appointments') {
      setUnviewedCount(0);
      setLoading(false);
      return;
    }

    fetchUnviewedCount();
    
    // Rafraîchir toutes les 30 secondes pour détecter les changements
    const interval = setInterval(() => {
      if (location.pathname !== '/appointments') {
        fetchUnviewedCount();
      }
    }, 30000);
    
    // Écouter l'événement de visualisation
    const handleViewed = () => {
      setUnviewedCount(0);
    };
    
    window.addEventListener('appointments_viewed', handleViewed);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('appointments_viewed', handleViewed);
    };
  }, [location.pathname]);

  const fetchUnviewedCount = async () => {
    try {
      // Récupérer les hash des appointments déjà vus depuis sessionStorage
      const viewedHashes = sessionStorage.getItem('appointments_viewed_hashes');
      const viewedHashesArray = viewedHashes ? viewedHashes.split(',') : [];
      
      // Construire l'URL avec les hash vus
      const url = viewedHashesArray.length > 0
        ? `${API_CONFIG.endpoints.appointmentsUnviewedCount}?viewedHashes=${viewedHashesArray.join(',')}`
        : API_CONFIG.endpoints.appointmentsUnviewedCount;
      
      const response = await axios.get(url);
      
      if (response.data.success) {
        const count = response.data.count || 0;
        setUnviewedCount(count);
      }
    } catch (err) {
      console.error('Erreur lors de la récupération du nombre de rendez-vous:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || unviewedCount === 0) {
    return null;
  }

  return (
    <Link
      to="/appointments"
      className="relative inline-flex items-center justify-center p-2 rounded-md text-cyan-300 hover:text-cyan-200 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border border-transparent hover:border-cyan-500/30 transition-all duration-200"
      title={`${unviewedCount} nouveau${unviewedCount > 1 ? 'x' : ''} rendez-vous`}
    >
      <Bell className="h-5 w-5 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] animate-pulse" />
      {unviewedCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full border-2 border-gray-900 shadow-lg animate-bounce">
          {unviewedCount > 9 ? '9+' : unviewedCount}
        </span>
      )}
    </Link>
  );
};

export default AppointmentNotification;

