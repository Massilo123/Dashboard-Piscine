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


const ClientsMap: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
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
  
  // Calculer le total de clients affichés
  const totalClients = clients.length;
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

  // Fonction pour charger depuis le cache
  const loadFromCache = (): boolean => {
    try {
      const cached = localStorage.getItem('clientsMapCache');
      const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
      
      if (cached && cachedTimestamp) {
        const cacheData = JSON.parse(cached);
        const cachedClients = cacheData.clients || [];
        
        // Ne charger que si on a des clients avec coordonnées
        if (cachedClients.length > 0) {
          setClients(cachedClients);
          setSectorStats(cacheData.sectorStats || {});
          setMissingClients(cacheData.missingClients || []);
          setTotalWithCoordinates(cacheData.totalWithCoordinates || 0);
          setLastUpdate(cachedTimestamp);
          return true;
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement du cache:', error);
    }
    return false;
  };

  // Fonction pour sauvegarder dans le cache
  const saveToCache = (clientsData: Client[], stats: Record<string, number>, missing: Array<{_id: string, name: string, address: string, reason: string}>, totalWithCoords: number, timestamp: string) => {
    try {
      localStorage.setItem('clientsMapCache', JSON.stringify({
        clients: clientsData,
        sectorStats: stats,
        missingClients: missing,
        totalWithCoordinates: totalWithCoords
      }));
      localStorage.setItem('clientsMapLastUpdate', timestamp);
      setLastUpdate(timestamp);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du cache:', error);
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
          const color = getSectorColor(changedClient.sector);
          const popupContent = `
            <div style="min-width: 200px;">
              <strong>${changedClient.name}</strong><br/>
              ${changedClient.address ? `<small>${changedClient.address}</small><br/>` : ''}
              ${changedClient.phoneNumber ? `<small>📞 ${changedClient.phoneNumber}</small><br/>` : ''}
              ${changedClient.city ? `<small>🏙️ ${changedClient.city}</small><br/>` : ''}
              ${changedClient.district ? `<small>🏘️ ${changedClient.district}</small><br/>` : ''}
              ${changedClient.sector ? `<small style="color: ${color}; font-weight: bold;">📍 ${changedClient.sector}</small>` : ''}
            </div>
          `;
          existingMarker.setPopupContent(popupContent);
        } else {
          // Nouveau client, créer un nouveau marqueur
          const color = getSectorColor(changedClient.sector);
          
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
              background-color: ${color};
              width: 12px;
              height: 12px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });

          const marker = L.marker([changedClient.coordinates.lat, changedClient.coordinates.lng], {
            icon: customIcon
          }).addTo(mapRef.current);

          (marker as any).clientId = changedClient._id;

          const popupContent = `
            <div style="min-width: 200px;">
              <strong>${changedClient.name}</strong><br/>
              ${changedClient.address ? `<small>${changedClient.address}</small><br/>` : ''}
              ${changedClient.phoneNumber ? `<small>📞 ${changedClient.phoneNumber}</small><br/>` : ''}
              ${changedClient.city ? `<small>🏙️ ${changedClient.city}</small><br/>` : ''}
              ${changedClient.district ? `<small>🏘️ ${changedClient.district}</small><br/>` : ''}
              ${changedClient.sector ? `<small style="color: ${color}; font-weight: bold;">📍 ${changedClient.sector}</small>` : ''}
            </div>
          `;
          marker.bindPopup(popupContent);

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
      
      // Obtenir les clients sans coordonnées depuis le cache
      const cachedMissing = localStorage.getItem('clientsMapMissing');
      const missingClients = cachedMissing ? JSON.parse(cachedMissing) : [];
      
      // Sauvegarder dans le cache
      const updateTimestamp = new Date().toISOString();
      saveToCache(updated, stats, missingClients, updated.length, updateTimestamp);
      console.log('✅ Cache de la carte mis à jour après modification incrémentale');
      console.log('📊 Statistiques mises à jour:', stats);
      
      return updated;
    });
  };

  // Fonction fetchClients accessible depuis le bouton
  const fetchClients = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      
      // Si pas de rechargement forcé, vérifier le cache
      if (!forceRefresh) {
        const cached = localStorage.getItem('clientsMapCache');
        const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
        
        // Si on a déjà un cache, vérifier les changements
        if (cached && cachedTimestamp) {
          const hasChanges = await checkForChanges();
          
          if (!hasChanges) {
            // Pas de changements, charger depuis le cache
            if (loadFromCache()) {
              setLoading(false);
              console.log('✅ Données de la carte chargées depuis le cache (aucun changement détecté)');
              
              // Charger quand même les clients sans coordonnées (peuvent changer)
              fetchClientsWithoutCoordinates();
              return;
            }
          }
          // Si hasChanges est true, continuer pour charger depuis l'API
        }
      }

      // Charger depuis l'API
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/for-map`);
      const result = await response.json();

      if (result.success) {
        setClients(result.clients);
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
            // Sauvegarder dans le cache
            saveToCache(
              result.clients,
              stats,
              result.missingClients || [],
              result.totalWithCoordinates || 0,
              lastUpdateResult.lastUpdate
            );
            console.log('✅ Données de la carte sauvegardées dans le cache');
          }
        } catch (cacheError) {
          console.error('Erreur lors de la sauvegarde du cache:', cacheError);
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
    // Charger immédiatement depuis le cache si disponible
    // Ce useEffect ne doit s'exécuter qu'une seule fois au montage du composant
    const loadInitialData = async () => {
      // Si on a déjà vérifié les changements, ne pas re-vérifier (évite les rechargements quand on revient sur la page)
      if (hasCheckedChangesRef.current) {
        console.log('✅ Déjà initialisé, pas de re-vérification');
        return;
      }
      
      const cached = localStorage.getItem('clientsMapCache');
      const cachedTimestamp = localStorage.getItem('clientsMapLastUpdate');
      
      if (cached && cachedTimestamp) {
        console.log('📦 Chargement immédiat depuis le cache...');
        if (loadFromCache()) {
          setLoading(false);
          console.log('✅ Données de la carte chargées depuis le cache');
          
          // Charger les clients sans coordonnées
          fetchClientsWithoutCoordinates();
          
          // Vérifier les changements en arrière-plan UNE SEULE FOIS (sans bloquer l'UI)
          // Mais ne recharger que si des changements sont détectés
          hasCheckedChangesRef.current = true;
          checkForChanges().then((result) => {
            if (result.hasChanges) {
              if (result.changedClients && result.changedClients.length > 0) {
                console.log(`🔄 ${result.changedClients.length} client(s) modifié(s), mise à jour incrémentale...`);
                // Mettre à jour seulement les clients modifiés
                updateMapWithChangedClients(result.changedClients);
                // Mettre à jour le timestamp du cache
                localStorage.setItem('clientsMapLastUpdate', new Date().toISOString());
              } else {
                console.log('🔄 Changements détectés mais pas de clients avec coordonnées, rechargement complet...');
                fetchClients(true); // Forcer le rechargement complet
              }
            } else {
              console.log('✅ Aucun changement détecté, conservation du cache');
            }
          }).catch((err) => {
            console.error('Erreur lors de la vérification des changements:', err);
            // En cas d'erreur, garder le cache (ne pas recharger)
          });
          
          return;
        }
      }
      
      // Si pas de cache, charger depuis l'API
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
          mapRef.current.flyTo([latitude, longitude], 15, {
            duration: 1.0
          });
          
          // Alternative si flyTo ne fonctionne pas
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.setView([latitude, longitude], 15, {
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

            marker.bindPopup('<strong>📍 Votre position</strong>').openPopup();
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

            marker.bindPopup('<strong>📍 Votre position (suivi actif)</strong>');
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
    
    // Centrer la carte sur le client
    mapRef.current.setView(
      [client.coordinates.lat, client.coordinates.lng],
      15,
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
      
      highlightMarker.bindPopup(`
        <div style="min-width: 200px;">
          <strong style="color: #F59E0B;">🔍 Client sélectionné</strong><br/>
          <strong>${client.name}</strong><br/>
          ${client.address ? `<small>${client.address}</small><br/>` : ''}
          ${client.phoneNumber ? `<small>📞 ${client.phoneNumber}</small><br/>` : ''}
          ${client.city ? `<small>🏙️ ${client.city}</small><br/>` : ''}
          ${client.district ? `<small>🏘️ ${client.district}</small><br/>` : ''}
          ${client.sector ? `<small style="color: ${getSectorColor(client.sector)}; font-weight: bold;">📍 ${client.sector}</small>` : ''}
        </div>
      `).openPopup();
      
      highlightedMarkerRef.current = highlightMarker;
      setHighlightedClientId(client._id);
      
      // Retirer la surbrillance après 5 secondes
      setTimeout(() => {
        if (highlightedMarkerRef.current) {
          highlightedMarkerRef.current.remove();
          highlightedMarkerRef.current = null;
          setHighlightedClientId(null);
        }
      }, 5000);
      
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

            marker.bindPopup('<strong>📍 Votre position (suivi actif)</strong>');
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
          localStorage.removeItem('clientsMapCache');
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
      
      // Ajouter ou mettre à jour les marqueurs pour les nouveaux clients ou ceux qui ont changé
      clients.forEach((client) => {
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
            const color = getSectorColor(client.sector);
            const popupContent = `
              <div style="min-width: 200px;">
                <strong>${client.name}</strong><br/>
                ${client.address ? `<small>${client.address}</small><br/>` : ''}
                ${client.phoneNumber ? `<small>📞 ${client.phoneNumber}</small><br/>` : ''}
                ${client.city ? `<small>🏙️ ${client.city}</small><br/>` : ''}
                ${client.district ? `<small>🏘️ ${client.district}</small><br/>` : ''}
                ${client.sector ? `<small style="color: ${color}; font-weight: bold;">📍 ${client.sector}</small>` : ''}
              </div>
            `;
            existingMarker.setPopupContent(popupContent);
          }
        } else {
          // Nouveau client, créer un nouveau marqueur
          const color = getSectorColor(client.sector);
          
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
              background-color: ${color};
              width: 12px;
              height: 12px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });

          const marker = L.marker([client.coordinates.lat, client.coordinates.lng], {
            icon: customIcon
          }).addTo(mapRef.current);

          // Stocker l'ID du client dans le marqueur pour référence future
          (marker as any).clientId = client._id;

          const popupContent = `
            <div style="min-width: 200px;">
              <strong>${client.name}</strong><br/>
              ${client.address ? `<small>${client.address}</small><br/>` : ''}
              ${client.phoneNumber ? `<small>📞 ${client.phoneNumber}</small><br/>` : ''}
              ${client.city ? `<small>🏙️ ${client.city}</small><br/>` : ''}
              ${client.district ? `<small>🏘️ ${client.district}</small><br/>` : ''}
              ${client.sector ? `<small style="color: ${color}; font-weight: bold;">📍 ${client.sector}</small>` : ''}
            </div>
          `;
          marker.bindPopup(popupContent);

          markersRef.current.push(marker);
        }
      });
    
    // Mettre à jour le hash
    clientsHashRef.current = clientsHash;
      setMapLoading(false);
      return;
    }

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

    // Calculer le centre de la carte (moyenne des coordonnées)
    const lats = clients.map(c => c.coordinates?.lat).filter(Boolean) as number[];
    const lngs = clients.map(c => c.coordinates?.lng).filter(Boolean) as number[];
    
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

    // Créer des marqueurs colorés par secteur
    clients.forEach((client) => {
      if (!client.coordinates?.lat || !client.coordinates?.lng) {
        return; // Ignorer les clients sans coordonnées
      }
      
      const color = getSectorColor(client.sector);
      
      // Créer une icône personnalisée avec la couleur du secteur
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          background-color: ${color};
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([client.coordinates.lat, client.coordinates.lng], {
        icon: customIcon
      }).addTo(map);

      // Stocker l'ID du client dans le marqueur
      (marker as any).clientId = client._id;

      // Popup avec informations du client
      const popupContent = `
        <div style="min-width: 200px;">
          <strong>${client.name}</strong><br/>
          ${client.address ? `<small>${client.address}</small><br/>` : ''}
          ${client.phoneNumber ? `<small>📞 ${client.phoneNumber}</small><br/>` : ''}
          ${client.city ? `<small>🏙️ ${client.city}</small><br/>` : ''}
          ${client.district ? `<small>🏘️ ${client.district}</small><br/>` : ''}
          ${client.sector ? `<small style="color: ${color}; font-weight: bold;">📍 ${client.sector}</small>` : ''}
        </div>
      `;
      marker.bindPopup(popupContent);

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
  }, [clients, loading]);

  const sortedSectors = Object.entries(sectorStats)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-transparent p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg border border-indigo-400/40 shadow-lg shadow-indigo-500/30 backdrop-blur-sm">
                <MapPin className="h-4 w-4 text-indigo-300 drop-shadow-[0_0_6px_rgba(139,92,246,1)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                  Carte des Clients
                </h1>
                <p className="text-gray-300 text-xs mt-0.5">
                  {loading ? (
                    <span className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Chargement...</span>
                  ) : (
                    <>
                      <span className="text-gray-300">{totalClients} clients affichés</span>
                      {totalWithCoordinates > 0 && totalWithCoordinates !== totalClients && (
                        <span className="text-cyan-400 ml-1 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                          ({totalWithCoordinates - totalClients} manquants)
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            
            {/* Groupe de boutons d'action */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={getUserLocation}
                className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-200 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-xs font-medium border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
                title="Afficher ma position"
              >
                <Navigation className="h-3.5 w-3.5 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                Ma position
              </button>
              <button
                onClick={toggleLocationTracking}
                className={`px-2.5 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-xs font-medium border shadow-lg hover:-translate-y-0.5 backdrop-blur-sm ${
                  isTrackingLocation
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-emerald-200 border-emerald-400/40 shadow-emerald-500/20 hover:shadow-emerald-500/40'
                    : 'bg-gradient-to-r from-gray-700/20 to-gray-600/20 hover:from-gray-700/30 hover:to-gray-600/30 text-gray-300 border-gray-500/40 shadow-gray-500/10 hover:shadow-gray-500/20'
                }`}
                title={isTrackingLocation ? 'Arrêter le suivi' : 'Suivre ma position en temps réel'}
              >
                <Navigation2 className={`h-3.5 w-3.5 ${isTrackingLocation ? 'drop-shadow-[0_0_4px_rgba(16,185,129,0.8)]' : ''}`} />
                {isTrackingLocation ? 'Suivi actif' : 'Suivre'}
              </button>
            </div>
          </div>
        </div>

        {/* Section de contrôle - Recherche et Actions */}
        <div className="mb-3 bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg p-2.5 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 relative z-10">
          {/* Barre de recherche avec suggestions */}
          <div className="mb-2 relative z-[10000]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
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
                placeholder="Rechercher un client..."
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-900/60 border border-indigo-500/30 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/30 transition-all duration-200"
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
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-rose-400 transition-colors hover:drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            {/* Liste des suggestions */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-[9999] w-full mt-1 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-96 overflow-y-auto"
                style={{ position: 'absolute', zIndex: 9999 }}
              >
                {searchSuggestions.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left px-4 py-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border-b border-indigo-500/20 last:border-b-0 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.4)]">{client.name}</div>
                        {client.phoneNumber && (
                          <div className="text-sm text-gray-400 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.6)]" />
                            {client.phoneNumber}
                          </div>
                        )}
                        {client.address && (
                          <div className="text-sm text-gray-400 truncate">{client.address}</div>
                        )}
                      </div>
                      {client.sector && (
                        <div
                          className="ml-2 px-2 py-1 rounded text-xs font-medium border backdrop-blur-sm"
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
              <div className="absolute z-[9999] w-full mt-1 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-rose-500/30 rounded-lg shadow-xl shadow-rose-500/20 p-4 text-center text-gray-400"
                style={{ position: 'absolute', zIndex: 9999 }}
              >
                Aucun client trouvé
              </div>
            )}
          </div>
          
          {/* Groupe de boutons de rafraîchissement */}
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={async () => {
                // Vérifier d'abord s'il y a des changements avant de recharger
                const result = await checkForChanges();
                if (result.hasChanges) {
                  if (result.changedClients && result.changedClients.length > 0) {
                    console.log(`🔄 ${result.changedClients.length} client(s) modifié(s), mise à jour incrémentale...`);
                    // Mettre à jour seulement les clients modifiés
                    updateMapWithChangedClients(result.changedClients);
                    // Mettre à jour le timestamp du cache
                    localStorage.setItem('clientsMapLastUpdate', new Date().toISOString());
                  } else {
                    console.log('🔄 Changements détectés mais pas de clients avec coordonnées, rechargement complet...');
                    localStorage.removeItem('clientsMapCache');
                    localStorage.removeItem('clientsMapLastUpdate');
                    hasCheckedChangesRef.current = false;
                    fetchClients(true);
                  }
                } else {
                  console.log('✅ Aucun changement détecté, pas de rechargement nécessaire');
                  alert('Aucun changement détecté dans la base de données. La carte est déjà à jour.');
                }
              }}
              className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 rounded-lg text-xs font-medium transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
            >
              Actualiser
            </button>
            <button
              onClick={() => {
                // Forcer un rechargement complet depuis l'API
                console.log('🔄 Rechargement complet depuis l\'API...');
                
                // Supprimer tout le cache
                localStorage.removeItem('clientsMapCache');
                localStorage.removeItem('clientsMapLastUpdate');
                localStorage.removeItem('clientsMapMissing');
                
                // Réinitialiser les flags
                hasCheckedChangesRef.current = false;
                clientsHashRef.current = '';
                
                // Réinitialiser les états
                setClients([]);
                setSectorStats({});
                setMissingClients([]);
                setTotalWithCoordinates(0);
                setError(null);
                
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
                
                // Recharger depuis l'API
                fetchClients(true);
              }}
              className="p-1.5 bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 text-rose-200 rounded-lg transition-all duration-200 border border-rose-400/40 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
              title="Recharger complètement depuis l'API (supprime le cache)"
            >
              <Loader2 className="h-4 w-4 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]" />
            </button>
          </div>
        </div>

        {/* Statistiques par secteur */}
        <div className="mb-3 bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg p-3 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg border border-indigo-400/40 shadow-sm shadow-indigo-500/30 backdrop-blur-sm">
              <Users className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
            </div>
            <h2 className="text-sm font-semibold bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_4px_rgba(139,92,246,0.4)]">
              Répartition par Secteur
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {sortedSectors.map(([sector, count]) => {
              const color = getSectorColor(sector);
              return (
                <div
                  key={sector}
                  className="group relative bg-gradient-to-br from-gray-900/95 to-gray-800/85 rounded-lg p-2 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 backdrop-blur-sm"
                  style={{
                    borderLeftColor: color + '50',
                    borderLeftWidth: '3px',
                    boxShadow: `0 0 10px ${color}15`
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ 
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`
                        }}
                      ></div>
                      <div 
                        className="text-xs font-medium truncate"
                        style={{ 
                          color: color + 'FF',
                          textShadow: `0 0 4px ${color}80`
                        }}
                      >
                        {sector}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-gray-100 font-bold text-base leading-none drop-shadow-[0_0_4px_rgba(139,92,246,0.3)]">{count}</div>
                      <div className="text-gray-400 text-[9px] mt-0.5 leading-none">clients</div>
                    </div>
                  </div>
                  {/* Effet de brillance au survol */}
                  <div 
                    className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{
                      background: `linear-gradient(135deg, ${color}20 0%, transparent 60%)`,
                      boxShadow: `inset 0 0 30px ${color}30`
                    }}
                  ></div>
                </div>
              );
            })}
          </div>
          
          {/* Section d'information sur les clients manquants */}
          <div className="mt-2 pt-2 border-t border-cyan-500/20">
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
        <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden shadow-lg shadow-indigo-500/5">
          {loading || mapLoading ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-6 w-6 text-cyan-400 animate-spin mx-auto mb-2 drop-shadow-[0_0_8px_rgba(34,211,238,1)]" />
                <p className="text-cyan-300 text-sm drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]">
                  {loading ? 'Chargement des données...' : 'Chargement de la carte...'}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-rose-400 mb-2 font-semibold text-sm drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]">Erreur</p>
                <p className="text-rose-300 text-sm drop-shadow-[0_0_3px_rgba(244,63,94,0.5)]">{error}</p>
              </div>
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              className="h-[500px] w-full rounded-lg"
              style={{ zIndex: 1 }}
            />
          )}
        </div>

        {/* Section des clients sans coordonnées */}
        {clientsWithoutCoordinates.length > 0 && (
          <div className="mt-3 bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg border border-cyan-500/20 overflow-hidden shadow-lg shadow-cyan-500/5">
            <div className="p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-cyan-400 font-semibold text-xs drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                    ⚠️ {clientsWithoutCoordinates.length} client(s) sans coordonnées GPS
                  </span>
                  <span className="text-gray-400 text-xs">
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
        )}
      </div>
    </div>
  );
};

export default ClientsMap;

