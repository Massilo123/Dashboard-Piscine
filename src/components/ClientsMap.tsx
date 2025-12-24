import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Users, Loader2, Phone, ChevronDown, Navigation, Navigation2, Search, X } from 'lucide-react';
import API_CONFIG from '../config/api';

// Fix pour les icônes Leaflet avec Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Client {
  _id: string;
  name: string;
  phoneNumber?: string;
  address: string;
  coordinates: {
    lng: number;
    lat: number;
  };
  sector?: string;
  city?: string;
  district?: string;
}

const SECTOR_COLORS: Record<string, string> = {
  'Montréal': '#3B82F6',      // Bleu
  'Laval': '#8B5CF6',         // Violet
  'Rive Nord': '#10B981',     // Vert
  'Rive Sud': '#F59E0B',      // Orange
  'Autres': '#6B7280',        // Gris
  'Non assignés': '#EF4444'   // Rouge
};

function getSectorColor(sector: string | undefined): string {
  if (!sector) return SECTOR_COLORS['Non assignés'];
  return SECTOR_COLORS[sector] || SECTOR_COLORS['Autres'];
}

// Helper functions pour générer des icônes SVG stylisées
function getLocationIcon(color: string = '#60a5fa'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 3px ${color}80);">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>`;
}

function getPhoneIcon(color: string = '#60a5fa'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 3px ${color}80);">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
  </svg>`;
}

function getCityIcon(color: string = '#9ca3af'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 2px ${color}60);">
    <path d="M3 21h18"></path>
    <path d="M5 21V7l8-4v18"></path>
    <path d="M19 21V11l-6-4"></path>
    <path d="M9 9v0"></path>
    <path d="M9 12v0"></path>
    <path d="M9 15v0"></path>
    <path d="M9 18v0"></path>
  </svg>`;
}

function getDistrictIcon(color: string = '#9ca3af'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 2px ${color}60);">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>`;
}

function getSearchIcon(color: string = '#fbbf24'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 3px ${color}80);">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
  </svg>`;
}

function getPositionIcon(color: string = '#22d3ee'): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 3px ${color}80);">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>`;
}

// Fonction helper pour générer le contenu de popup compact pour mobile
function getClientPopupContent(client: Client, isHighlighted: boolean = false): string {
  const color = getSectorColor(client.sector);
  // Détecter si on est sur mobile (évalué à chaque appel)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640; // sm breakpoint
  
  if (isMobile) {
    // Version compacte pour mobile
    return `
      <div style="min-width: 150px; max-width: 200px;">
        ${isHighlighted ? `<div style="margin-bottom: 4px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.2)); border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; font-weight: 600; font-size: 10px; text-shadow: 0 0 4px rgba(245, 158, 11, 0.8);">${getSearchIcon('#fbbf24')}<span>Client sélectionné</span></div>` : ''}
        <strong style="background: linear-gradient(135deg, #a78bfa, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 6px rgba(139, 92, 246, 0.6); display: block; margin-top: ${isHighlighted ? '4px' : '0'}; font-size: 13px; line-height: 1.2;">${client.name}</strong>
        ${client.address ? `<div style="margin-top: 4px; color: #d1d5db; font-size: 11px; display: flex; align-items: center; line-height: 1.3;">${getLocationIcon('#60a5fa')}<span style="word-break: break-word;">${client.address}</span></div>` : ''}
        ${client.phoneNumber ? `<div style="margin-top: 3px; color: #60a5fa; font-size: 11px; text-shadow: 0 0 3px rgba(96, 165, 250, 0.6); display: flex; align-items: center;">${getPhoneIcon('#60a5fa')}<span>${client.phoneNumber}</span></div>` : ''}
        ${client.sector ? `<div style="margin-top: 4px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; background: ${color}20; border: 1px solid ${color}50; color: ${color}; font-weight: 600; font-size: 10px; text-shadow: 0 0 4px ${color}80;">${getLocationIcon(color)}<span>${client.sector}</span></div>` : ''}
      </div>
    `;
  } else {
    // Version normale pour desktop
    return `
      <div style="min-width: 200px;">
        ${isHighlighted ? `<div style="margin-bottom: 8px; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.2)); border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; font-weight: 600; font-size: 12px; text-shadow: 0 0 6px rgba(245, 158, 11, 0.8); box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);">${getSearchIcon('#fbbf24')}<span>Client sélectionné</span></div>` : ''}
        <strong style="background: linear-gradient(135deg, #a78bfa, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 8px rgba(139, 92, 246, 0.6); display: block; margin-top: ${isHighlighted ? '8px' : '0'};">${client.name}</strong>
        ${client.address ? `<div style="margin-top: 8px; color: #d1d5db; font-size: 13px; display: flex; align-items: center;">${getLocationIcon('#60a5fa')}<span>${client.address}</span></div>` : ''}
        ${client.phoneNumber ? `<div style="margin-top: 6px; color: #60a5fa; font-size: 13px; text-shadow: 0 0 4px rgba(96, 165, 250, 0.6); display: flex; align-items: center;">${getPhoneIcon('#60a5fa')}<span>${client.phoneNumber}</span></div>` : ''}
        ${client.city ? `<div style="margin-top: 6px; color: #9ca3af; font-size: 12px; display: flex; align-items: center;">${getCityIcon('#9ca3af')}<span>${client.city}</span></div>` : ''}
        ${client.district ? `<div style="margin-top: 6px; color: #9ca3af; font-size: 12px; display: flex; align-items: center;">${getDistrictIcon('#9ca3af')}<span>${client.district}</span></div>` : ''}
        ${client.sector ? `<div style="margin-top: 8px; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; background: ${color}20; border: 1px solid ${color}50; color: ${color}; font-weight: 600; font-size: 12px; text-shadow: 0 0 6px ${color}80; box-shadow: 0 0 8px ${color}40;">${getLocationIcon(color)}<span>${client.sector}</span></div>` : ''}
      </div>
    `;
  }
}

const ClientsMap: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const clientsHashRef = useRef<string>(''); // Hash des clients pour éviter la recréation inutile
  const hasCheckedChangesRef = useRef<boolean>(false); // Pour éviter de vérifier plusieurs fois les changements
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(false); // État séparé pour le chargement de la carte
  const [error, setError] = useState<string | null>(null);
  const [sectorStats, setSectorStats] = useState<Record<string, number>>({});
  const [missingClients, setMissingClients] = useState<Array<{_id: string, name: string, address: string, reason: string}>>([]);
  const [totalWithCoordinates, setTotalWithCoordinates] = useState<number>(0);
  
  const [clientsWithoutCoordinates, setClientsWithoutCoordinates] = useState<Array<{_id: string, name: string, phoneNumber?: string, address: string, hasAddress?: boolean, reason?: string}>>([]);
  const [showWithoutCoordinates, setShowWithoutCoordinates] = useState(false);
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const [geocodingResult, setGeocodingResult] = useState<{successCount: number, failCount: number} | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null);
  const highlightedMarkerRef = useRef<L.Marker | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [showFrequentOnly, setShowFrequentOnly] = useState(false);
  const allClientsRef = useRef<Client[]>([]); // Stocker tous les clients pour le filtrage

  // Fonction pour charger depuis le cache
  // Fonction pour sauvegarder seulement le timestamp (les données viennent du cache MongoDB)
  const saveTimestamp = (timestamp: string) => {
    try {
      localStorage.setItem('clientsMapLastUpdate', timestamp);
      setLastUpdate(timestamp);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du timestamp:', error);
    }
  };

  // Fonction pour vérifier les changements et récupérer les clients modifiés
  const checkForChanges = async (): Promise<{ hasChanges: boolean; changedClients?: Client[] }> => {
    try {
      const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
      if (!cachedTimestamp) {
        console.log('⚠️ Pas de timestamp en cache, chargement complet nécessaire');
        return { hasChanges: true }; // Pas de cache, charger tout
      }

      console.log(`🔍 Vérification des changements depuis: ${cachedTimestamp}`);
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/by-city-changes?since=${encodeURIComponent(cachedTimestamp)}`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`📊 Résultat de la vérification: hasChanges=${result.hasChanges}, message=${result.message || 'N/A'}`);
        
        // Toujours mettre à jour le timestamp avec celui retourné par le serveur
        // pour éviter de redétecter les mêmes clients modifiés précédemment
        if (result.lastUpdate) {
          saveTimestamp(result.lastUpdate);
        }
        
        if (result.hasChanges && result.clientsForMap) {
          // Convertir les clients formatés pour la carte
          const changedClients: Client[] = result.clientsForMap.map((c: any) => ({
            _id: c._id,
            name: c.name,
            phoneNumber: c.phoneNumber,
            address: c.address,
            coordinates: c.coordinates,
            sector: c.sector,
            city: c.city,
            district: c.district
          }));
          return { hasChanges: true, changedClients };
        }
        return { hasChanges: result.hasChanges };
      }
      // En cas d'erreur de l'API, ne pas recharger (garder le cache)
      console.warn('⚠️ Erreur lors de la vérification des changements, conservation du cache');
      return { hasChanges: false }; // Ne pas recharger en cas d'erreur
    } catch (error) {
      console.error('Erreur lors de la vérification des changements:', error);
      // En cas d'erreur réseau, ne pas recharger (garder le cache)
      return { hasChanges: false }; // Ne pas recharger en cas d'erreur
    }
  };

  // Fonction pour mettre à jour seulement les clients modifiés sur la carte
  const updateMapWithChangedClients = (changedClients: Client[]) => {
    if (!mapRef.current || changedClients.length === 0) {
      return;
    }

    console.log(`🔄 Mise à jour de ${changedClients.length} client(s) sur la carte`);

    // Mettre à jour tous les clients d'abord
    setClients(prevClients => {
      const updated = [...prevClients];
      
      changedClients.forEach((changedClient) => {
        if (!changedClient.coordinates?.lat || !changedClient.coordinates?.lng) {
          return; // Ignorer les clients sans coordonnées
        }

        // Chercher si un marqueur existe déjà pour ce client
        const existingMarkerIndex = markersRef.current.findIndex((marker) => {
          return (marker as any).clientId === changedClient._id;
        });

        if (existingMarkerIndex >= 0) {
          // Mettre à jour le marqueur existant
          const existingMarker = markersRef.current[existingMarkerIndex];
          const markerLat = (existingMarker as any).getLatLng().lat;
          const markerLng = (existingMarker as any).getLatLng().lng;

          // Vérifier si les coordonnées ont changé
          if (markerLat !== changedClient.coordinates.lat || markerLng !== changedClient.coordinates.lng) {
            // Déplacer le marqueur
            existingMarker.setLatLng([changedClient.coordinates.lat, changedClient.coordinates.lng]);
            console.log(`📍 Marqueur déplacé pour ${changedClient.name}`);
          }

          // Mettre à jour la popup
          existingMarker.setPopupContent(getClientPopupContent(changedClient));
        } else {
          // Nouveau client, créer un nouveau marqueur
          const color = getSectorColor(changedClient.sector);
          
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
              background-color: ${color};
              width: 9px;
              height: 9px;
              border-radius: 50%;
              border: 1.5px solid rgba(255, 255, 255, 0.9);
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            "></div>`,
            iconSize: [9, 9],
            iconAnchor: [4.5, 4.5]
          });

          const marker = L.marker([changedClient.coordinates.lat, changedClient.coordinates.lng], {
            icon: customIcon
          }).addTo(mapRef.current);

          (marker as any).clientId = changedClient._id;

          marker.bindPopup(getClientPopupContent(changedClient));

          markersRef.current.push(marker);
          console.log(`➕ Nouveau marqueur ajouté pour ${changedClient.name}`);
        }

        // Mettre à jour le client dans la liste
        const existingIndex = updated.findIndex(c => c._id === changedClient._id);
        if (existingIndex >= 0) {
          updated[existingIndex] = changedClient;
        } else {
          updated.push(changedClient);
        }
      });

      // Mettre à jour le hash après toutes les mises à jour
      const newHash = updated.map(c => `${c._id}-${c.coordinates?.lat || ''}-${c.coordinates?.lng || ''}-${c.name || ''}-${c.address || ''}`).sort().join('|');
      clientsHashRef.current = newHash;
      
      // Sauvegarder le cache après toutes les mises à jour
      // Calculer les statistiques par secteur depuis les clients mis à jour
      const stats: Record<string, number> = {};
      updated.forEach((client: Client) => {
        const sector = client.sector || 'Non assignés';
        stats[sector] = (stats[sector] || 0) + 1;
      });
      
      // Mettre à jour les statistiques dans l'état pour qu'elles soient affichées correctement
      setSectorStats(stats);
      
      // Sauvegarder le timestamp
      const updateTimestamp = new Date().toISOString();
      saveTimestamp(updateTimestamp);
      console.log('✅ Timestamp mis à jour après modification incrémentale');
      console.log('📊 Statistiques mises à jour:', stats);
      
      return updated;
    });
  };

  // Fonction fetchClients - charge depuis l'API qui utilise le cache MongoDB
  const fetchClients = async (forceRefresh: boolean = false, frequentOnlyOverride?: boolean) => {
    try {
      setLoading(true);
      
      // Utiliser la valeur override si fournie, sinon utiliser l'état actuel
      const shouldFilterFrequent = frequentOnlyOverride !== undefined ? frequentOnlyOverride : showFrequentOnly;
      
      // Si pas de rechargement forcé, vérifier les changements
      if (!forceRefresh) {
        const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
        
        if (cachedTimestamp) {
          const hasChanges = await checkForChanges();
          
          if (!hasChanges.hasChanges) {
            // Pas de changements, charger depuis l'API (qui utilise le cache MongoDB)
            console.log('✅ Aucun changement détecté, chargement depuis le cache MongoDB');
            // Le timestamp est déjà mis à jour dans checkForChanges() avec celui du serveur
          }
          // Si hasChanges est true, continuer pour charger depuis l'API
        }
      }

      // Charger depuis l'API (qui utilise le cache MongoDB côté serveur)
      const url = `${API_CONFIG.baseUrl}/api/clients/for-map${shouldFilterFrequent ? '?frequentOnly=true' : ''}`;
      console.log(`📦 Chargement des clients depuis: ${url} (filtre fréquents: ${shouldFilterFrequent})`);
      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        // Comparer les IDs pour détecter les suppressions
        const newClientIds = new Set(result.clients.map((c: Client) => c._id));
        
        // Retirer les marqueurs des clients supprimés
        if (mapRef.current) {
          markersRef.current = markersRef.current.filter((marker) => {
            const clientId = (marker as any).clientId;
            if (!newClientIds.has(clientId)) {
              // Client supprimé, retirer le marqueur
              mapRef.current?.removeLayer(marker);
              marker.remove();
              console.log(`🗑️ Marqueur retiré pour le client supprimé: ${clientId}`);
              return false;
            }
            return true;
          });
        }
        
        setClients(result.clients);
        allClientsRef.current = result.clients; // Sauvegarder tous les clients
        setMissingClients(result.missingClients || []);

        // Calculer les statistiques par secteur
        const stats: Record<string, number> = {};
        result.clients.forEach((client: Client) => {
          const sector = client.sector || 'Non assignés';
          stats[sector] = (stats[sector] || 0) + 1;
        });
        setSectorStats(stats);
        
        // Obtenir le timestamp de dernière mise à jour
        try {
          const lastUpdateResponse = await fetch(`${API_CONFIG.baseUrl}/api/clients/last-update`);
          const lastUpdateResult = await lastUpdateResponse.json();
          if (lastUpdateResult.success && lastUpdateResult.lastUpdate) {
            // Sauvegarder seulement le timestamp
            saveTimestamp(lastUpdateResult.lastUpdate);
            console.log('✅ Timestamp sauvegardé');
          }
        } catch (cacheError) {
          console.error('Erreur lors de la sauvegarde du timestamp:', cacheError);
        }
        
        setTotalWithCoordinates(result.totalWithCoordinates || 0);
        
        // Charger la liste des clients sans coordonnées depuis l'API
        if (result.withoutCoordinates && result.withoutCoordinates > 0) {
          fetchClientsWithoutCoordinates();
        }
        
        // Afficher un message si des clients ne peuvent pas être affichés
        console.log('📊 Résultats de la carte:', {
          total: result.total,
          totalInDatabase: result.totalInDatabase,
          totalWithCoordinates: result.totalWithCoordinates,
          withoutCoordinates: result.withoutCoordinates,
          missingClients: result.missingClients?.length || 0
        });
        
        if (result.missingClients && result.missingClients.length > 0) {
          console.warn(`⚠️ ${result.missingClients.length} client(s) avec coordonnées ne sont pas affichés sur la carte`);
          console.table(result.missingClients.slice(0, 20));
        }
        if (result.withoutCoordinates && result.withoutCoordinates > 0) {
          console.log(`ℹ️ ${result.withoutCoordinates} client(s) ne peuvent pas être affichés sur la carte (sans coordonnées GPS)`);
        }
      } else {
        setError(result.error || 'Erreur lors du chargement des clients');
      }
    } catch (err) {
      console.error('Erreur lors du chargement des clients:', err);
      setError('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Charger depuis l'API (qui utilise le cache MongoDB côté serveur)
    // Ce useEffect ne doit s'exécuter qu'une seule fois au montage du composant
    const loadInitialData = async () => {
      // Si on a déjà vérifié les changements, ne pas re-vérifier (évite les rechargements quand on revient sur la page)
      if (hasCheckedChangesRef.current) {
        console.log('✅ Déjà initialisé, pas de re-vérification');
        return;
      }
      
      const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
      
      if (cachedTimestamp) {
        // Vérifier les changements en arrière-plan UNE SEULE FOIS (sans bloquer l'UI)
        hasCheckedChangesRef.current = true;
        checkForChanges().then((result) => {
          if (result.hasChanges) {
            if (result.changedClients && result.changedClients.length > 0) {
              console.log(`🔄 ${result.changedClients.length} client(s) modifié(s), mise à jour incrémentale...`);
              // Mettre à jour seulement les clients modifiés
              updateMapWithChangedClients(result.changedClients);
              // Mettre à jour le timestamp
              saveTimestamp(new Date().toISOString());
            } else {
              console.log('🔄 Changements détectés, rechargement complet...');
              fetchClients(true); // Forcer le rechargement complet
            }
          } else {
            console.log('✅ Aucun changement détecté');
            // Le timestamp est déjà mis à jour dans checkForChanges() avec celui du serveur
          }
        }).catch((err) => {
          console.error('Erreur lors de la vérification des changements:', err);
        });
      }
      
      // Charger depuis l'API (qui utilise le cache MongoDB)
      hasCheckedChangesRef.current = true;
      fetchClients();
    };
    
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Tableau de dépendances vide pour s'exécuter une seule fois

  // Fonction pour charger les clients sans coordonnées
  const fetchClientsWithoutCoordinates = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/without-coordinates`);
      const result = await response.json();
      if (result.success) {
        setClientsWithoutCoordinates(result.clients || []);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des clients sans coordonnées:', err);
    }
  };

  // Fonction pour obtenir la position de l'utilisateur
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }

    // Vérifier que la carte est prête
    if (!mapRef.current) {
      setError('La carte n\'est pas encore chargée. Veuillez patienter...');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setUserLocation(location);
        
        // Centrer la carte sur la position de l'utilisateur avec animation
        if (mapRef.current) {
          // Utiliser flyTo pour une animation plus fluide
          mapRef.current.flyTo([latitude, longitude], 12, {
            duration: 1.0
          });
          
          // Alternative si flyTo ne fonctionne pas
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.setView([latitude, longitude], 12, {
                animate: true,
                duration: 0.5
              });
            }
          }, 100);
        }
        
        // Ajouter ou mettre à jour le marqueur de position
        if (mapRef.current) {
          if (userLocationMarkerRef.current) {
            // Mettre à jour le marqueur existant
            userLocationMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            // Créer un nouveau marqueur pour la position de l'utilisateur
            const userIcon = L.divIcon({
              className: 'user-location-marker',
              html: `<div style="
                background-color: #3B82F6;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                animation: pulse 2s infinite;
              "></div>
              <style>
                @keyframes pulse {
                  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                  70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
              </style>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            const marker = L.marker([latitude, longitude], {
              icon: userIcon,
              zIndexOffset: 1000 // S'assurer que le marqueur est au-dessus des autres
            }).addTo(mapRef.current);

            marker.bindPopup(`<div style="min-width: 200px;"><strong style="background: linear-gradient(135deg, #22d3ee, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 8px rgba(34, 211, 238, 0.6); display: flex; align-items: center;">${getPositionIcon('#22d3ee')}<span>Votre position</span></strong></div>`).openPopup();
            userLocationMarkerRef.current = marker;
          }
        }
        
        console.log('✅ Position de l\'utilisateur obtenue:', location);
      },
      (error) => {
        console.error('Erreur de géolocalisation:', error);
        let errorMessage = 'Impossible d\'obtenir votre position';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permission de géolocalisation refusée';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Position indisponible';
            break;
          case error.TIMEOUT:
            // Ne pas afficher d'erreur pour les timeouts lors du bouton "Ma position"
            console.log('⏱️ Timeout de géolocalisation - réessayez');
            return; // Sortir silencieusement sans afficher d'erreur
          default:
            errorMessage = 'Erreur de géolocalisation';
        }
        setError(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000, // Augmenter le timeout à 15 secondes
        maximumAge: 5000 // Accepter des positions jusqu'à 5 secondes d'âge
      }
    );
  };

  // Fonction pour activer/désactiver le suivi de position en temps réel
  const toggleLocationTracking = () => {
    if (isTrackingLocation) {
      // Arrêter le suivi
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTrackingLocation(false);
      console.log('📍 Suivi de position désactivé');
    } else {
      // Démarrer le suivi
      if (!navigator.geolocation) {
        setError('La géolocalisation n\'est pas supportée par votre navigateur');
        return;
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = { lat: latitude, lng: longitude };
          setUserLocation(location);
          
          // Mettre à jour le marqueur
          if (userLocationMarkerRef.current && mapRef.current) {
            userLocationMarkerRef.current.setLatLng([latitude, longitude]);
            // Optionnel: centrer la carte sur la position (peut être désactivé si gênant)
            // mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
          } else if (mapRef.current) {
            // Créer le marqueur s'il n'existe pas
            const userIcon = L.divIcon({
              className: 'user-location-marker',
              html: `<div style="
                background-color: #3B82F6;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                animation: pulse 2s infinite;
              "></div>
              <style>
                @keyframes pulse {
                  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                  70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
              </style>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            const marker = L.marker([latitude, longitude], {
              icon: userIcon,
              zIndexOffset: 1000
            }).addTo(mapRef.current);

            marker.bindPopup(`<div style="min-width: 200px;"><strong style="background: linear-gradient(135deg, #22d3ee, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 8px rgba(34, 211, 238, 0.6); display: flex; align-items: center;">${getPositionIcon('#22d3ee')}<span>Votre position (suivi actif)</span></strong></div>`);
            userLocationMarkerRef.current = marker;
          }
          
          console.log('📍 Position mise à jour:', location);
        },
        (error) => {
          // Ne pas afficher d'erreur pour les timeouts (c'est normal lors des interactions rapides)
          if (error.code === error.TIMEOUT) {
            console.log('⏱️ Timeout de géolocalisation (normal lors des interactions rapides)');
            return; // Ignorer les timeouts silencieusement
          }
          
          // Ne pas afficher d'erreur si l'utilisateur refuse la permission
          if (error.code === error.PERMISSION_DENIED) {
            console.log('ℹ️ Permission de géolocalisation refusée');
            setIsTrackingLocation(false);
            return;
          }
          
          // Pour les autres erreurs, juste logger
          console.warn('⚠️ Erreur de suivi de position:', error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Augmenter le timeout à 15 secondes
          maximumAge: 5000 // Accepter des positions jusqu'à 5 secondes d'âge
        }
      );
      
      setIsTrackingLocation(true);
      console.log('📍 Suivi de position activé');
    }
  };

  // Fonction pour filtrer les clients en temps réel
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    
    if (!value.trim()) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    const searchLower = value.toLowerCase().trim();
    
    // Filtrer les clients qui correspondent
    const matchingClients = clients.filter(client => {
      const nameMatch = client.name?.toLowerCase().includes(searchLower);
      const phoneMatch = client.phoneNumber?.toLowerCase().includes(searchLower);
      const addressMatch = client.address?.toLowerCase().includes(searchLower);
      
      return (nameMatch || phoneMatch || addressMatch) && client.coordinates?.lat && client.coordinates?.lng;
    }).slice(0, 10); // Limiter à 10 résultats
    
    setSearchSuggestions(matchingClients);
    setShowSuggestions(matchingClients.length > 0);
  };

  // Fonction pour afficher un client sur la carte
  const handleSelectClient = (client: Client) => {
    if (!mapRef.current || !client.coordinates?.lat || !client.coordinates?.lng) return;
    
    // Fermer les suggestions
    setShowSuggestions(false);
    setSearchTerm(client.name || '');
    
    // Faire défiler vers la carte pour qu'elle soit visible à l'écran
    if (mapWrapperRef.current) {
      mapWrapperRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
    
    // Centrer la carte sur le client avec un zoom moins élevé pour voir plus de contexte
    mapRef.current.setView(
      [client.coordinates.lat, client.coordinates.lng],
      12,
      { animate: true, duration: 0.5 }
    );
    
    // Trouver le marqueur existant
    const existingMarker = markersRef.current.find(marker => {
      return (marker as any).clientId === client._id;
    });
    
    if (existingMarker) {
      // Ouvrir la popup du marqueur
      existingMarker.openPopup();
      
      // Mettre en évidence le marqueur (créer un marqueur temporaire plus grand)
      if (highlightedMarkerRef.current) {
        highlightedMarkerRef.current.remove();
      }
      
      const highlightIcon = L.divIcon({
        className: 'highlighted-marker',
        html: `<div style="
          background-color: #F59E0B;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 4px solid white;
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.5), 0 4px 12px rgba(0,0,0,0.5);
          animation: pulse-highlight 1.5s infinite;
        "></div>
        <style>
          @keyframes pulse-highlight {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.5), 0 4px 12px rgba(0,0,0,0.5); }
            50% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.3), 0 4px 12px rgba(0,0,0,0.5); }
          }
        </style>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      
      const highlightMarker = L.marker(
        [client.coordinates.lat, client.coordinates.lng],
        { icon: highlightIcon, zIndexOffset: 2000 }
      ).addTo(mapRef.current);
      
      highlightMarker.bindPopup(getClientPopupContent(client, true)).openPopup();
      
      highlightedMarkerRef.current = highlightMarker;
      setHighlightedClientId(client._id);
      
      // Retirer la surbrillance après 15 secondes
      setTimeout(() => {
        if (highlightedMarkerRef.current) {
          highlightedMarkerRef.current.remove();
          highlightedMarkerRef.current = null;
          setHighlightedClientId(null);
        }
      }, 15000);
      
      console.log('✅ Client sélectionné:', client.name);
    } else {
      console.warn('⚠️ Client sélectionné mais marqueur non trouvé sur la carte');
    }
  };

  // Fermer les suggestions quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Activer le suivi automatiquement au chargement
  useEffect(() => {
    // Activer le suivi de position automatiquement si le navigateur le supporte
    if (navigator.geolocation) {
      // Démarrer le suivi automatiquement
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = { lat: latitude, lng: longitude };
          setUserLocation(location);
          setIsTrackingLocation(true);
          
          // Mettre à jour le marqueur
          if (userLocationMarkerRef.current && mapRef.current) {
            userLocationMarkerRef.current.setLatLng([latitude, longitude]);
          } else if (mapRef.current) {
            // Créer le marqueur s'il n'existe pas
            const userIcon = L.divIcon({
              className: 'user-location-marker',
              html: `<div style="
                background-color: #3B82F6;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                animation: pulse 2s infinite;
              "></div>
              <style>
                @keyframes pulse {
                  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                  70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
              </style>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            const marker = L.marker([latitude, longitude], {
              icon: userIcon,
              zIndexOffset: 1000
            }).addTo(mapRef.current);

            marker.bindPopup(`<div style="min-width: 200px;"><strong style="background: linear-gradient(135deg, #22d3ee, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 8px rgba(34, 211, 238, 0.6); display: flex; align-items: center;">${getPositionIcon('#22d3ee')}<span>Votre position (suivi actif)</span></strong></div>`);
            userLocationMarkerRef.current = marker;
          }
          
          console.log('📍 Position mise à jour automatiquement:', location);
        },
        (error) => {
          // Ne pas afficher d'erreur pour les timeouts (c'est normal lors des interactions rapides)
          if (error.code === error.TIMEOUT) {
            console.log('⏱️ Timeout de géolocalisation (normal lors des interactions rapides)');
            return; // Ignorer les timeouts silencieusement
          }
          
          // Ne pas afficher d'erreur si l'utilisateur refuse la permission
          if (error.code === error.PERMISSION_DENIED) {
            console.log('ℹ️ Permission de géolocalisation refusée');
            setIsTrackingLocation(false);
            return;
          }
          
          // Pour les autres erreurs, juste logger sans afficher à l'utilisateur
          console.warn('⚠️ Erreur de suivi automatique:', error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Augmenter le timeout à 15 secondes
          maximumAge: 5000 // Accepter des positions jusqu'à 5 secondes d'âge
        }
      );
      
      setIsTrackingLocation(true);
      console.log('📍 Suivi de position activé automatiquement');
    }
    
    // Nettoyer le suivi lors du démontage
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Fonction pour géocoder les clients sans coordonnées
  const handleGeocodeMissing = async () => {
    if (geocodingInProgress) return;
    
    setGeocodingInProgress(true);
    setGeocodingResult(null);
    
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/geocode-missing`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result.success) {
        setGeocodingResult({
          successCount: result.successCount,
          failCount: result.failCount
        });
        
        // Recharger les clients après géocodage (forcer le refresh)
        setTimeout(() => {
          localStorage.removeItem('clientsMapLastUpdate');
          fetchClients(true);
        }, 2000);
      } else {
        alert(`Erreur: ${result.error}`);
      }
    } catch (err) {
      console.error('Erreur lors du géocodage:', err);
      alert('Erreur lors du géocodage');
    } finally {
      setGeocodingInProgress(false);
    }
  };

  useEffect(() => {
    // Ne créer la carte que si on a des clients avec coordonnées et que le chargement des données est terminé
    if (!mapContainerRef.current || loading) {
      return;
    }

    // Si on n'a pas de clients, ne pas créer la carte
    if (clients.length === 0) {
      // Si la carte existe déjà, la garder (ne pas la supprimer)
      if (mapRef.current) {
        setMapLoading(false);
        return;
      }
      return;
    }
    
    // Créer un hash des clients pour vérifier s'ils ont changé
    // Inclure aussi les coordonnées et les informations importantes
    const clientsHash = clients
      .map(c => `${c._id}-${c.coordinates?.lat || ''}-${c.coordinates?.lng || ''}-${c.name || ''}-${c.address || ''}`)
      .sort()
      .join('|');
    
    // Si la carte existe déjà et que les clients n'ont pas changé, ne pas la recréer
    // Cette vérification empêche la recréation de la carte quand on revient sur la page
    if (mapRef.current && clientsHashRef.current === clientsHash && markersRef.current.length === clients.length) {
      console.log('✅ Carte déjà créée avec les mêmes clients, pas de recréation (retour sur la page)');
      setMapLoading(false);
      return;
    }
    
    // Si la carte existe mais que le hash est vide, c'est qu'on vient de charger depuis le cache
    // Dans ce cas, ne pas recréer si la carte existe déjà
    if (mapRef.current && !clientsHashRef.current && clientsHash) {
      // Mettre à jour le hash sans recréer la carte
      clientsHashRef.current = clientsHash;
      console.log('✅ Carte existante, mise à jour du hash seulement');
      setMapLoading(false);
      return;
    }
    
    // Vérifier si les clients ont changé
    const clientsChanged = clientsHashRef.current !== clientsHash;
    
    // Si la carte existe déjà et que les clients ont changé, mettre à jour seulement les marqueurs
    if (mapRef.current && clientsChanged) {
      console.log('🔄 Mise à jour des marqueurs (clients ont changé)');
      setMapLoading(true);
      
      // Créer un Map des clients existants par ID pour comparaison rapide
      const existingClientIds = new Set(markersRef.current.map((marker, idx) => {
        const clientId = (marker as any).clientId;
        return clientId;
      }));
      
      const newClientIds = new Set(clients.map(c => c._id));
      
      // Retirer les marqueurs des clients qui n'existent plus
      markersRef.current = markersRef.current.filter((marker, idx) => {
        const clientId = (marker as any).clientId;
        if (!newClientIds.has(clientId)) {
          if (mapRef.current) {
            mapRef.current.removeLayer(marker);
          }
          marker.remove();
          return false;
        }
        return true;
      });
      
      // Filtrer les clients par secteur si un secteur est sélectionné
      const filteredClients = selectedSector 
        ? clients.filter(client => (client.sector || 'Non assignés') === selectedSector)
        : clients;

      // Retirer les marqueurs qui ne correspondent plus au filtre
      markersRef.current = markersRef.current.filter((marker) => {
        const clientId = (marker as any).clientId;
        const clientExists = filteredClients.some(c => c._id === clientId);
        if (!clientExists && mapRef.current) {
          mapRef.current.removeLayer(marker);
          marker.remove();
          return false;
        }
        return true;
      });

      // Ajouter ou mettre à jour les marqueurs pour les nouveaux clients ou ceux qui ont changé
      filteredClients.forEach((client) => {
        if (!client.coordinates?.lat || !client.coordinates?.lng) {
          return; // Ignorer les clients sans coordonnées
        }
        
        // Chercher si un marqueur existe déjà pour ce client
        let existingMarker = markersRef.current.find((marker) => {
          return (marker as any).clientId === client._id;
        });
        
        if (existingMarker) {
          // Vérifier si les coordonnées ont changé
          const markerLat = (existingMarker as any).getLatLng().lat;
          const markerLng = (existingMarker as any).getLatLng().lng;
          
          if (markerLat !== client.coordinates.lat || markerLng !== client.coordinates.lng) {
            // Les coordonnées ont changé, mettre à jour le marqueur
            existingMarker.setLatLng([client.coordinates.lat, client.coordinates.lng]);
            
            // Mettre à jour la popup si nécessaire
            existingMarker.setPopupContent(getClientPopupContent(client));
          }
        } else {
          // Nouveau client, créer un nouveau marqueur
          const color = getSectorColor(client.sector);
          
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
              background-color: ${color};
              width: 9px;
              height: 9px;
              border-radius: 50%;
              border: 1.5px solid rgba(255, 255, 255, 0.9);
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            "></div>`,
            iconSize: [9, 9],
            iconAnchor: [4.5, 4.5]
          });

          const marker = L.marker([client.coordinates.lat, client.coordinates.lng], {
            icon: customIcon
          }).addTo(mapRef.current);

          // Stocker l'ID du client dans le marqueur pour référence future
          (marker as any).clientId = client._id;

          marker.bindPopup(getClientPopupContent(client));

          markersRef.current.push(marker);
        }
      });
    
    // Mettre à jour le hash
    clientsHashRef.current = clientsHash;
      setMapLoading(false);
      return;
    }

    // Filtrer les clients par secteur si un secteur est sélectionné
    const filteredClients = selectedSector 
      ? clients.filter(client => (client.sector || 'Non assignés') === selectedSector)
      : clients;

    // Si on arrive ici, c'est qu'on doit créer la carte pour la première fois
    if (mapRef.current) {
      // La carte existe déjà mais on doit la recréer (cas rare)
      markersRef.current.forEach(marker => {
        if (mapRef.current) {
          mapRef.current.removeLayer(marker);
        }
        marker.remove();
      });
      markersRef.current = [];
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Vérifier que le conteneur est vide
    if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    setMapLoading(true);

    // Calculer le centre de la carte (moyenne des coordonnées) avec les clients filtrés
    const lats = filteredClients.map(c => c.coordinates?.lat).filter(Boolean) as number[];
    const lngs = filteredClients.map(c => c.coordinates?.lng).filter(Boolean) as number[];
    
    if (lats.length === 0 || lngs.length === 0) {
      setMapLoading(false);
      return;
    }
    
    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

    // Créer la carte
    const map = L.map(mapContainerRef.current, {
      preferCanvas: true
    }).setView([centerLat, centerLng], 10);
    mapRef.current = map;

    // Ajouter les tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Créer des marqueurs colorés par secteur (utiliser les clients filtrés)
    filteredClients.forEach((client) => {
      if (!client.coordinates?.lat || !client.coordinates?.lng) {
        return; // Ignorer les clients sans coordonnées
      }
      
      const color = getSectorColor(client.sector);
      
      // Créer une icône personnalisée avec la couleur du secteur
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          background-color: ${color};
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        "></div>`,
        iconSize: [9, 9],
        iconAnchor: [4.5, 4.5]
      });

      const marker = L.marker([client.coordinates.lat, client.coordinates.lng], {
        icon: customIcon
      }).addTo(map);

      // Stocker l'ID du client dans le marqueur
      (marker as any).clientId = client._id;

      // Popup avec informations du client
      marker.bindPopup(getClientPopupContent(client));

      markersRef.current.push(marker);
    });
    
    // Mettre à jour le hash
    clientsHashRef.current = clientsHash;
    setMapLoading(false);

    return () => {
      // Nettoyage lors du démontage du composant
      if (mapRef.current) {
        // Retirer tous les marqueurs de clients
        markersRef.current.forEach(marker => {
          if (mapRef.current) {
            mapRef.current.removeLayer(marker);
          }
          marker.remove();
        });
        markersRef.current = [];
        
        // Retirer le marqueur de position de l'utilisateur
        if (userLocationMarkerRef.current) {
          if (mapRef.current) {
            mapRef.current.removeLayer(userLocationMarkerRef.current);
          }
          userLocationMarkerRef.current.remove();
          userLocationMarkerRef.current = null;
        }
        
        // Retirer le marqueur de surbrillance
        if (highlightedMarkerRef.current) {
          if (mapRef.current) {
            mapRef.current.removeLayer(highlightedMarkerRef.current);
          }
          highlightedMarkerRef.current.remove();
          highlightedMarkerRef.current = null;
        }
        
        // Retirer la carte
        mapRef.current.remove();
        mapRef.current = null;
      }
      
      // Arrêter le suivi de position si actif
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      
      // Nettoyer le conteneur
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, [clients, loading, selectedSector]);

  const sortedSectors = Object.entries(sectorStats)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-[calc(100vh-5rem-2rem)] bg-transparent p-0 overflow-y-auto overflow-x-hidden -my-4">
      <div className="w-full max-w-full sm:max-w-5xl mx-auto flex flex-col min-h-0 overflow-x-hidden px-2 sm:px-4 py-2 sm:py-3 pb-32 sm:pb-40">
        {/* Header */}
        <div className="mb-3 sm:mb-4 flex-shrink-0 w-full min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
            <div className="p-2 sm:p-2.5 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg border border-indigo-400/40 shadow-lg shadow-indigo-500/30 backdrop-blur-sm flex-shrink-0">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-300 drop-shadow-[0_0_6px_rgba(139,92,246,1)]" />
              </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] truncate">
                Carte des Clients
              </h1>
              <p className="text-gray-300 text-xs sm:text-sm mt-1">
                {loading ? (
                  <span className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Chargement...</span>
                ) : (
                  <>
                    <span className="text-gray-300">
                      {selectedSector 
                        ? clients.filter(client => (client.sector || 'Non assignés') === selectedSector).length 
                        : clients.length} clients affichés
                      {selectedSector && ` (${selectedSector})`}
                    </span>
                      {totalWithCoordinates > 0 && totalWithCoordinates !== clients.length && !selectedSector && (
                      <span className="text-cyan-400 ml-1 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                          ({totalWithCoordinates - clients.length} manquants)
                        </span>
                      )}
                    </>
                  )}
                </p>
            </div>
              </div>
            </div>
            
        {/* Statistiques par secteur */}
        <div className="mb-3 sm:mb-4 flex-shrink-0 bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 w-full min-w-0">
          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg border border-indigo-400/40 shadow-sm shadow-indigo-500/30 backdrop-blur-sm flex-shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              </div>
              <h2 className="text-sm sm:text-base md:text-lg font-semibold bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_4px_rgba(139,92,246,0.4)]">
                Répartition par Secteur
              </h2>
            </div>
            
            {/* Switch pour filtrer les clients fréquents */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={showFrequentOnly}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setShowFrequentOnly(newValue);
                    // Recharger les données avec le nouveau filtre (passer la nouvelle valeur directement)
                    fetchClients(true, newValue);
                  }}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-all duration-300 ease-in-out ${
                  showFrequentOnly 
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg shadow-purple-500/50' 
                    : 'bg-gray-700 border border-gray-600'
                }`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all duration-300 ease-in-out transform ${
                    showFrequentOnly ? 'translate-x-5' : 'translate-x-0'
                  } shadow-md`}></div>
                </div>
              </div>
              <span className="text-xs sm:text-sm text-gray-300 group-hover:text-cyan-300 transition-colors duration-200 hidden sm:inline">
                3+ rendez-vous
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {sortedSectors.map(([sector, count]) => {
              const color = getSectorColor(sector);
              return (
                <button
                  key={sector}
                  onClick={() => {
                    // Toggle: si le secteur est déjà sélectionné, désélectionner
                    setSelectedSector(selectedSector === sector ? null : sector);
                  }}
                  className={`group relative bg-gradient-to-br from-gray-900/95 to-gray-800/85 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 backdrop-blur-sm cursor-pointer focus:outline-none ${
                    selectedSector === sector
                      ? '-translate-y-0.5'
                      : ''
                  }`}
                  style={{
                    borderLeftColor: color + (selectedSector === sector ? '80' : '50'),
                    borderLeftWidth: '3px',
                    borderColor: selectedSector === sector ? color + '60' : 'rgba(139, 92, 246, 0.15)',
                    boxShadow: selectedSector === sector 
                      ? `0 0 20px ${color}40, 0 0 10px ${color}20` 
                      : `0 0 10px ${color}15`,
                    outline: 'none'
                  }}
                >
                  <div className="flex items-center justify-between gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
                      <div
                        className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0"
                        style={{ 
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`
                        }}
                      ></div>
                      <div 
                        className="text-xs sm:text-sm md:text-base font-medium truncate"
                        style={{ 
                          color: color + 'FF',
                          textShadow: `0 0 4px ${color}80`
                        }}
                      >
                        {sector}
            </div>
          </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-gray-100 font-bold text-base sm:text-lg md:text-xl leading-none drop-shadow-[0_0_4px_rgba(139,92,246,0.3)]">{count}</div>
                      <div className="text-gray-400 text-[10px] sm:text-xs md:text-sm mt-0.5 leading-none">clients</div>
                    </div>
                  </div>
                  {/* Effet de brillance au survol - reste visible si sélectionné */}
                  <div 
                    className={`absolute inset-0 rounded-lg transition-opacity duration-200 pointer-events-none ${
                      selectedSector === sector ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${color}20 0%, transparent 60%)`,
                      boxShadow: `inset 0 0 30px ${color}30`
                    }}
                  ></div>
                </button>
              );
            })}
        </div>

          {/* Section d'information sur les clients manquants */}
          <div className="mt-0.5 pt-0.5 border-t border-cyan-500/20 hidden">
            {missingClients.length > 0 ? (
              <>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-cyan-400 font-semibold text-xs drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                    ⚠️ {missingClients.length} client(s) avec coordonnées non affichés
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto rounded border border-cyan-500/20 bg-gray-900/40 backdrop-blur-sm">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900/90 backdrop-blur-sm">
                      <tr className="border-b border-cyan-500/20">
                        <th className="text-left py-1 px-2 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Nom</th>
                        <th className="text-left py-1 px-2 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Adresse</th>
                        <th className="text-left py-1 px-2 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Raison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingClients.slice(0, 10).map((client) => (
                        <tr key={client._id} className="border-b border-gray-800/50 hover:bg-cyan-500/5 transition-colors">
                          <td className="py-1 px-2 text-gray-200 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">{client.name}</td>
                          <td className="py-1 px-2 text-gray-400 text-xs">{client.address}</td>
                          <td className="py-1 px-2 text-cyan-400 text-xs drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">{client.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {missingClients.length > 10 && (
                    <p className="text-gray-400 text-xs mt-1 px-2 pb-1">
                      ... et <span className="text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]">{missingClients.length - 10}</span> autres (voir les logs serveur)
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Carte */}
        <div ref={mapWrapperRef} className="mb-3 sm:mb-4 h-[400px] sm:h-[500px] md:h-[600px] bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden shadow-lg shadow-indigo-500/5 flex flex-col w-full min-w-0 flex-shrink-0">
          {loading || mapLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400 animate-spin mx-auto mb-2 drop-shadow-[0_0_8px_rgba(34,211,238,1)]" />
                <p className="text-cyan-300 text-xs sm:text-sm drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]">
                  {loading ? 'Chargement des données...' : 'Chargement de la carte...'}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-rose-400 mb-2 font-semibold text-sm drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]">Erreur</p>
                <p className="text-rose-300 text-sm drop-shadow-[0_0_3px_rgba(244,63,94,0.5)]">{error}</p>
              </div>
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              className="h-full w-full rounded-lg"
              style={{ zIndex: 1 }}
            />
          )}
        </div>

        {/* Section de contrôle - Recherche */}
        <div className="mb-3 sm:mb-4 flex-shrink-0 relative z-10 w-full min-w-0">
          {/* Barre de recherche */}
          <div className="relative z-[10000] w-full min-w-0">
            <div className="relative w-full min-w-0">
              <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] z-10" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchSuggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchSuggestions.length > 0) {
                    handleSelectClient(searchSuggestions[0]);
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
                placeholder="Rechercher..."
                className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-900/60 border border-indigo-500/30 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 transition-all duration-200 relative z-10"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSearchSuggestions([]);
                    setShowSuggestions(false);
                    setHighlightedClientId(null);
                    if (highlightedMarkerRef.current) {
                      highlightedMarkerRef.current.remove();
                      highlightedMarkerRef.current = null;
                    }
                  }}
                  className="absolute right-1.5 sm:right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-rose-400 transition-colors hover:drop-shadow-[0_0_4px_rgba(244,63,94,0.8)] p-0.5 z-20"
                >
                  <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-3.5 md:w-3.5" />
                </button>
              )}
            </div>
            
            {/* Liste des suggestions */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 z-[9999] w-full mt-1 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-80 sm:max-h-96 overflow-y-auto"
              >
                {searchSuggestions.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border-b border-indigo-500/20 last:border-b-0 transition-all duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-semibold text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.4)] truncate">{client.name}</div>
                        {client.phoneNumber && (
                          <div className="text-xs sm:text-sm text-gray-400 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.6)] flex-shrink-0" />
                            <span className="truncate">{client.phoneNumber}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="text-xs sm:text-sm text-gray-400 truncate">{client.address}</div>
                        )}
                      </div>
                      {client.sector && (
                        <div
                          className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium border backdrop-blur-sm flex-shrink-0 self-start sm:ml-2"
                          style={{
                            backgroundColor: getSectorColor(client.sector) + '20',
                            color: getSectorColor(client.sector),
                            borderColor: getSectorColor(client.sector) + '50',
                            boxShadow: `0 0 8px ${getSectorColor(client.sector)}50`
                          }}
                        >
                          {client.sector}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {searchTerm && searchSuggestions.length === 0 && (
              <div className="absolute top-full left-0 right-0 z-[9999] w-full mt-1 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-rose-500/30 rounded-lg shadow-xl shadow-rose-500/20 p-4 text-center text-gray-400">
                Aucun client trouvé
              </div>
            )}
          </div>
          
          {/* Barre d'actions - Boutons avec espacement égal */}
          <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 mt-3 sm:mt-4 flex-shrink-0 w-full min-w-0 flex-wrap">
            <button
              onClick={getUserLocation}
              className="px-2 sm:px-4 py-1.5 sm:py-2.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-200 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 backdrop-blur-sm flex-shrink-0"
              title="Afficher ma position"
            >
              <Navigation className="h-3.5 w-3.5 sm:h-5 sm:w-5 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
              <span className="text-[10px] sm:text-sm whitespace-nowrap">Position</span>
            </button>
            <button
              onClick={toggleLocationTracking}
              className={`px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 border shadow-lg hover:-translate-y-0.5 backdrop-blur-sm flex-shrink-0 ${
                isTrackingLocation
                  ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-emerald-200 border-emerald-400/40 shadow-emerald-500/20 hover:shadow-emerald-500/40'
                  : 'bg-gradient-to-r from-gray-700/20 to-gray-600/20 hover:from-gray-700/30 hover:to-gray-600/30 text-gray-300 border-gray-500/40 shadow-gray-500/10 hover:shadow-gray-500/20'
              }`}
              title={isTrackingLocation ? 'Arrêter le suivi' : 'Suivre ma position en temps réel'}
            >
              <Navigation2 className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${isTrackingLocation ? 'drop-shadow-[0_0_4px_rgba(16,185,129,0.8)]' : ''}`} />
              <span className="text-[10px] sm:text-sm whitespace-nowrap">Suivi</span>
            </button>
            <button
              onClick={async () => {
                // Forcer un recalcul complet du cache MongoDB avec toutes les requêtes HERE
                console.log('🔄 Recalcul complet du cache MongoDB...');
                
                try {
                  setLoading(true);
                  setError(null);
                  
                  // Appeler la route qui force un recalcul complet
                  const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/for-map/update-cache`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  });

                  const result = await response.json();

                  if (result.success) {
                    // Supprimer le timestamp pour forcer une vérification complète
                    localStorage.removeItem('clientsMapLastUpdate');
                    
                    // Réinitialiser les flags
                    hasCheckedChangesRef.current = false;
                    clientsHashRef.current = '';
                    
                    // Réinitialiser les états
                    setClients([]);
                    setSectorStats({});
                    setMissingClients([]);
                    setTotalWithCoordinates(0);
                    
                    // Retirer tous les marqueurs de la carte
                    if (mapRef.current) {
                      markersRef.current.forEach(marker => {
                        if (mapRef.current) {
                          mapRef.current.removeLayer(marker);
                        }
                        marker.remove();
                      });
                      markersRef.current = [];
                    }
                    
                    // Recharger depuis le cache MongoDB mis à jour
                    await fetchClients(true);
                    
                    alert(`✅ Cache MongoDB mis à jour avec succès !\n${result.total || 0} clients traités.\n${result.totalInDatabase || 0} clients dans la base de données.`);
                  } else {
                    throw new Error(result.error || 'Erreur lors de la mise à jour du cache');
                  }
                } catch (err) {
                  console.error('Erreur lors du recalcul du cache:', err);
                  setError(err instanceof Error ? err.message : 'Erreur lors du recalcul du cache');
                  alert(`❌ Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="px-2 sm:px-4 py-1.5 sm:py-2.5 bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 disabled:cursor-not-allowed text-rose-200 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 border border-rose-400/40 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 backdrop-blur-sm flex-shrink-0"
              title="Recalculer complètement le cache MongoDB (fait ~500 requêtes HERE API)"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 sm:h-5 sm:w-5 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)] animate-spin" />
                  <span className="text-[10px] sm:text-sm whitespace-nowrap">Calcul...</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 sm:h-5 sm:w-5 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]" />
                  <span className="text-[10px] sm:text-sm whitespace-nowrap">Reboot</span>
                </>
              )}
            </button>
          </div>
        </div>
          
        {/* Section des clients sans coordonnées - Masquée pour économiser l'espace */}
        {/* {clientsWithoutCoordinates.length > 0 && (
          <div className="mt-1 sm:mt-2 md:mt-3 bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg border border-cyan-500/20 overflow-hidden shadow-lg shadow-cyan-500/5">
            <div className="p-1.5 sm:p-2 md:p-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  <span className="text-cyan-400 font-semibold text-[10px] sm:text-xs drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                    ⚠️ {clientsWithoutCoordinates.length} client(s) sans coordonnées GPS
                  </span>
                  <span className="text-gray-400 text-[9px] sm:text-xs">
                    (ne peuvent pas être affichés)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {clientsWithoutCoordinates.filter(c => c.hasAddress).length > 0 && (
                    <button
                      onClick={handleGeocodeMissing}
                      disabled={geocodingInProgress}
                      className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 disabled:cursor-not-allowed text-indigo-200 rounded-lg text-xs font-medium transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 backdrop-blur-sm"
                    >
                      {geocodingInProgress ? 'Géocodage...' : `Géocoder ${clientsWithoutCoordinates.filter(c => c.hasAddress).length}`}
                    </button>
                  )}
                  <button
                    onClick={() => setShowWithoutCoordinates(!showWithoutCoordinates)}
                    className="p-1.5 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 rounded-lg transition-all duration-200 border border-gray-600/30 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 backdrop-blur-sm"
                  >
                    <ChevronDown 
                      className={`h-4 w-4 text-gray-400 hover:text-cyan-400 transition-all ${showWithoutCoordinates ? 'transform rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>
              
              {geocodingResult && (
                <div className={`p-2 rounded-lg mb-1.5 text-xs border shadow-sm backdrop-blur-sm ${
                  geocodingResult.successCount > 0 
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-emerald-500/40 shadow-emerald-500/20' 
                    : 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 border-rose-500/40 shadow-rose-500/20'
                }`}>
                  <p>
                    {geocodingResult.successCount > 0 && (
                      <span className="text-emerald-300 drop-shadow-[0_0_4px_rgba(16,185,129,0.8)]">✅ {geocodingResult.successCount} géocodés</span>
                    )}
                    {geocodingResult.failCount > 0 && (
                      <span className="text-rose-300 ml-2 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]">❌ {geocodingResult.failCount} échec(s)</span>
                    )}
                  </p>
                </div>
              )}
              
              <div className="text-xs text-gray-400">
                {clientsWithoutCoordinates.filter(c => c.hasAddress).length > 0 && (
                  <span className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                    {clientsWithoutCoordinates.filter(c => c.hasAddress).length} avec adresse
                  </span>
                )}
                {clientsWithoutCoordinates.filter(c => !c.hasAddress).length > 0 && (
                  <span className="ml-2 text-gray-400">
                    {clientsWithoutCoordinates.filter(c => !c.hasAddress).length} sans adresse
                  </span>
                )}
              </div>
            </div>
            
            {showWithoutCoordinates && (
              <div className="max-h-80 overflow-y-auto border-t border-cyan-500/20 bg-gray-900/30 backdrop-blur-sm">
                <div className="p-2.5">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900/90 backdrop-blur-sm z-10">
                      <tr className="border-b border-cyan-500/20">
                        <th className="text-left py-1 px-1.5 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Nom</th>
                        <th className="text-left py-1 px-1.5 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Téléphone</th>
                        <th className="text-left py-1 px-1.5 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Adresse</th>
                        <th className="text-left py-1 px-1.5 text-cyan-300 text-xs font-semibold drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Raison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsWithoutCoordinates.map((client) => (
                        <tr key={client._id} className="border-b border-gray-800/50 hover:bg-cyan-500/5 transition-colors">
                          <td className="py-1 px-1.5 text-gray-200 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">{client.name || 'Sans nom'}</td>
                          <td className="py-1 px-1.5 text-gray-400">
                            {client.phoneNumber ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" />
                                {client.phoneNumber}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-1 px-1.5 text-gray-400 text-xs">{client.address}</td>
                          <td className="py-1 px-1.5 text-cyan-400 text-xs drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">
                            {client.reason || (client.hasAddress ? 'Adresse présente mais non géocodée' : 'Aucune adresse')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )} */}
      </div>
    </div>
  );
};

export default ClientsMap;

