import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Users, Loader2, Phone, ChevronDown } from 'lucide-react';
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

      // Mettre à jour le client dans la liste des clients
      setClients(prevClients => {
        const updated = [...prevClients];
        const existingIndex = updated.findIndex(c => c._id === changedClient._id);
        if (existingIndex >= 0) {
          updated[existingIndex] = changedClient;
        } else {
          updated.push(changedClient);
        }
        // Mettre à jour le hash après la mise à jour
        const newHash = updated.map(c => `${c._id}-${c.coordinates?.lat || ''}-${c.coordinates?.lng || ''}-${c.name || ''}-${c.address || ''}`).sort().join('|');
        clientsHashRef.current = newHash;
        return updated;
      });
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
        // Retirer tous les marqueurs
        markersRef.current.forEach(marker => {
          if (mapRef.current) {
            mapRef.current.removeLayer(marker);
          }
          marker.remove();
        });
        markersRef.current = [];
        
        // Retirer la carte
        mapRef.current.remove();
        mapRef.current = null;
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-indigo-600 rounded-lg">
              <MapPin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Carte des Clients</h1>
              <p className="text-gray-400 mt-1">
                {loading ? 'Chargement...' : (
                  <>
                    {totalClients} clients affichés sur la carte
                    {totalWithCoordinates > 0 && totalWithCoordinates !== totalClients && (
                      <span className="text-yellow-400 ml-2">
                        ({totalWithCoordinates - totalClients} manquants)
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Actualiser
          </button>
        </div>

        {/* Statistiques par secteur */}
        <div className="mb-6 bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Répartition par Secteur</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {sortedSectors.map(([sector, count]) => (
              <div
                key={sector}
                className="bg-gray-900/50 rounded-lg p-3 border border-gray-700"
              >
                <div
                  className="w-4 h-4 rounded-full mb-2"
                  style={{ backgroundColor: getSectorColor(sector) }}
                ></div>
                <div className="text-white font-semibold">{count}</div>
                <div className="text-gray-400 text-sm">{sector}</div>
              </div>
            ))}
          </div>
          
          {/* Section d'information sur les clients manquants */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            {missingClients.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-yellow-400 font-semibold">
                    ⚠️ {missingClients.length} client(s) avec coordonnées non affichés
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">Nom</th>
                        <th className="text-left py-1">Adresse</th>
                        <th className="text-left py-1">Raison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingClients.slice(0, 10).map((client) => (
                        <tr key={client._id} className="border-b border-gray-800">
                          <td className="py-1 text-gray-300">{client.name}</td>
                          <td className="py-1 text-gray-400 text-xs">{client.address}</td>
                          <td className="py-1 text-yellow-400 text-xs">{client.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {missingClients.length > 10 && (
                    <p className="text-gray-500 text-xs mt-2">
                      ... et {missingClients.length - 10} autres (voir les logs serveur)
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Carte */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
          {loading || mapLoading ? (
            <div className="h-[600px] flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">
                  {loading ? 'Chargement des données...' : 'Chargement de la carte...'}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="h-[600px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-400 mb-2">Erreur</p>
                <p className="text-gray-400">{error}</p>
              </div>
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              className="h-[600px] w-full rounded-lg"
              style={{ zIndex: 1 }}
            />
          )}
        </div>

        {/* Section des clients sans coordonnées */}
        {clientsWithoutCoordinates.length > 0 && (
          <div className="mt-6 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400 font-semibold">
                    ⚠️ {clientsWithoutCoordinates.length} client(s) sans coordonnées GPS
                  </span>
                  <span className="text-gray-400 text-sm">
                    (ne peuvent pas être affichés sur la carte)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {clientsWithoutCoordinates.filter(c => c.hasAddress).length > 0 && (
                    <button
                      onClick={handleGeocodeMissing}
                      disabled={geocodingInProgress}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {geocodingInProgress ? 'Géocodage en cours...' : `Géocoder ${clientsWithoutCoordinates.filter(c => c.hasAddress).length} client(s) avec adresse`}
                    </button>
                  )}
                  <button
                    onClick={() => setShowWithoutCoordinates(!showWithoutCoordinates)}
                    className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                  >
                    <ChevronDown 
                      className={`h-5 w-5 text-gray-400 transition-transform ${showWithoutCoordinates ? 'transform rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>
              
              {geocodingResult && (
                <div className={`p-3 rounded-lg mb-2 ${geocodingResult.successCount > 0 ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
                  <p className="text-sm">
                    {geocodingResult.successCount > 0 && (
                      <span className="text-green-400">✅ {geocodingResult.successCount} client(s) géocodés avec succès</span>
                    )}
                    {geocodingResult.failCount > 0 && (
                      <span className="text-red-400 ml-2">❌ {geocodingResult.failCount} échec(s)</span>
                    )}
                  </p>
                </div>
              )}
              
              <div className="text-xs text-gray-400">
                {clientsWithoutCoordinates.filter(c => c.hasAddress).length > 0 && (
                  <span className="text-yellow-400">
                    {clientsWithoutCoordinates.filter(c => c.hasAddress).length} client(s) avec adresse peuvent être géocodés
                  </span>
                )}
                {clientsWithoutCoordinates.filter(c => !c.hasAddress).length > 0 && (
                  <span className="ml-2">
                    {clientsWithoutCoordinates.filter(c => !c.hasAddress).length} client(s) sans adresse
                  </span>
                )}
              </div>
            </div>
            
            {showWithoutCoordinates && (
              <div className="max-h-96 overflow-y-auto border-t border-gray-700">
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-2 px-2">Nom</th>
                        <th className="text-left py-2 px-2">Téléphone</th>
                        <th className="text-left py-2 px-2">Adresse</th>
                        <th className="text-left py-2 px-2">Raison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsWithoutCoordinates.map((client) => (
                        <tr key={client._id} className="border-b border-gray-800 hover:bg-gray-700/30">
                          <td className="py-2 px-2 text-gray-300">{client.name || 'Sans nom'}</td>
                          <td className="py-2 px-2 text-gray-400">
                            {client.phoneNumber ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {client.phoneNumber}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-400 text-xs">{client.address}</td>
                          <td className="py-2 px-2 text-gray-500 text-xs">
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

