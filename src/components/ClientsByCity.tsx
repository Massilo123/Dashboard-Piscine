import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Users, ChevronDown, ChevronRight, Phone, Home, Search, X, Building, Edit2, Check, Loader2 } from 'lucide-react';
import API_CONFIG from '../config/api';

interface Client {
  _id: string;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
  addressLine1: string;
  coordinates?: {
    lng: number;
    lat: number;
  };
  city: string;
  district?: string;
}

interface CityData {
  clients: Client[];
  districts?: Record<string, Client[]>;
}

interface ClientsByCityData {
  [city: string]: CityData;
}

interface ClientsBySectorData {
  [sector: string]: ClientsByCityData | {
    districts?: Record<string, Client[]>;
    clients: Client[];
  };
}

const ClientsByCity: React.FC = () => {
  const [clientsData, setClientsData] = useState<ClientsByCityData>({});
  const [clientsBySector, setClientsBySector] = useState<ClientsBySectorData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [totalClients, setTotalClients] = useState(0);
  const [progress, setProgress] = useState({ processed: 0, total: 0, percentage: 0, currentClient: '', city: '', district: '', elapsed: '0s', estimated: '0s' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFrequentOnly, setShowFrequentOnly] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [correctedAddress, setCorrectedAddress] = useState('');
  const [isFixing, setIsFixing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null);
  const [suggestionsStyle, setSuggestionsStyle] = useState<React.CSSProperties>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef<boolean>(false); // Pour éviter les initialisations multiples

  // Fonction pour charger depuis le cache
  const loadFromCache = (): boolean => {
    try {
      const cached = localStorage.getItem('clientsByCityCache');
      const cachedTimestamp = localStorage.getItem('clientsByCityLastUpdate');
      
      console.log('🔍 Vérification du cache:', {
        hasCache: !!cached,
        hasTimestamp: !!cachedTimestamp,
        cacheLength: cached?.length || 0
      });
      
      if (cached && cachedTimestamp) {
        const cacheData = JSON.parse(cached);
        
        // Vérifier que les données sont valides
        if (cacheData && (cacheData.clientsBySector || cacheData.clientsData)) {
          setClientsBySector(cacheData.clientsBySector || {});
          setClientsData(cacheData.clientsData || {});
          setTotalClients(cacheData.totalClients || 0);
          setLastUpdate(cachedTimestamp);
          console.log('✅ Cache chargé avec succès:', {
            totalClients: cacheData.totalClients || 0,
            timestamp: cachedTimestamp
          });
          return true;
        } else {
          console.warn('⚠️ Cache invalide: données manquantes');
        }
      } else {
        console.log('ℹ️ Pas de cache disponible:', {
          hasCache: !!cached,
          hasTimestamp: !!cachedTimestamp
        });
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement du cache:', error);
    }
    return false;
  };

  // Fonction pour sauvegarder dans le cache
  const saveToCache = (clientsBySectorData: ClientsBySectorData, clientsData: ClientsByCityData, total: number, timestamp: string) => {
    try {
      const cacheData = {
        clientsBySector: clientsBySectorData,
        clientsData: clientsData,
        totalClients: total
      };
      localStorage.setItem('clientsByCityCache', JSON.stringify(cacheData));
      localStorage.setItem('clientsByCityLastUpdate', timestamp);
      setLastUpdate(timestamp);
      
      // Vérifier que le cache a bien été sauvegardé
      const verifyCache = localStorage.getItem('clientsByCityCache');
      const verifyTimestamp = localStorage.getItem('clientsByCityLastUpdate');
      if (verifyCache && verifyTimestamp) {
        console.log('✅ Cache sauvegardé avec succès:', {
          totalClients: total,
          timestamp: verifyTimestamp,
          cacheSize: verifyCache.length
        });
      } else {
        console.error('❌ Erreur: Le cache n\'a pas été sauvegardé correctement');
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du cache:', error);
    }
  };

  // Fonction helper pour déterminer le secteur (doit correspondre à celle du serveur)
  const getSector = (city: string): string => {
    const cityLower = city.toLowerCase().trim();
    if (cityLower === 'montréal' || cityLower === 'montreal') {
      return 'Montréal';
    }
    if (cityLower === 'laval') {
      return 'Laval';
    }
    // Rive Nord
    const riveNordCities = ['blainville', 'boisbriand', 'rosemère', 'sainte-thérèse', 'terrebonne', 'mascouche', 'lachenaie', 'lorraine', 'sainte-anne-des-plaines', 'saint-jérôme', 'saint-eustache', 'deux-montagnes', 'saint-joseph-du-lac', 'pointe-calumet', 'oka', 'mirabel', 'charlemagne', 'lavaltrie'];
    if (riveNordCities.some(c => cityLower.includes(c))) {
      return 'Rive Nord';
    }
    // Rive Sud
    const riveSudCities = ['brossard', 'longueuil', 'saint-lambert', 'boucherville', 'saint-bruno', 'sainte-julie', 'saint-hubert', 'la prairie', 'candiac', 'delson', 'saint-constant', 'sainte-catherine', 'châteauguay', 'mercier', 'beauharnois', 'saint-jean-sur-richelieu'];
    if (riveSudCities.some(c => cityLower.includes(c))) {
      return 'Rive Sud';
    }
    return 'Autres';
  };

  // Fonction pour vérifier les changements et récupérer les clients modifiés
  const checkForChanges = async (): Promise<{ hasChanges: boolean; changedClients?: Client[] }> => {
    try {
      const cachedTimestamp = localStorage.getItem('clientsByCityLastUpdate');
      if (!cachedTimestamp) {
        return { hasChanges: true }; // Pas de cache, charger tout
      }

      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/by-city-changes?since=${encodeURIComponent(cachedTimestamp)}`);
      const result = await response.json();
      
      if (result.success) {
        console.log('📊 Résultat de la vérification:', {
          hasChanges: result.hasChanges,
          changedClientsCount: result.changedClientsCount,
          clientsForByCityLength: result.clientsForByCity?.length || 0,
          message: result.message
        });
        
        // Toujours mettre à jour le timestamp avec celui retourné par le serveur
        // pour éviter de redétecter les mêmes clients modifiés précédemment
        if (result.lastUpdate) {
          localStorage.setItem('clientsByCityLastUpdate', result.lastUpdate);
          setLastUpdate(result.lastUpdate);
        }
        
        if (result.hasChanges && result.clientsForByCity && result.clientsForByCity.length > 0) {
          // Convertir les clients formatés en gardant le secteur retourné par le serveur
          const changedClients = result.clientsForByCity.map((c: {
            _id: string;
            givenName: string;
            familyName: string;
            phoneNumber?: string;
            addressLine1: string;
            coordinates?: { lng: number; lat: number };
            city: string;
            district?: string;
            sector: string;
          }) => ({
            _id: c._id,
            givenName: c.givenName,
            familyName: c.familyName,
            phoneNumber: c.phoneNumber,
            addressLine1: c.addressLine1,
            coordinates: c.coordinates,
            city: c.city,
            district: c.district,
            sector: c.sector // Garder le secteur retourné par le serveur
          }));
          console.log(`✅ ${changedClients.length} client(s) formaté(s) pour la mise à jour incrémentale`);
          return { hasChanges: true, changedClients };
        }
        
        // Si hasChanges mais pas de clients formatés, c'est qu'il y a des changements mais pas de clients avec adresse
        if (result.hasChanges) {
          console.warn('⚠️ Changements détectés mais aucun client avec adresse à mettre à jour');
        }
        
        return { hasChanges: result.hasChanges };
      }
      return { hasChanges: true }; // En cas d'erreur, recharger tout
    } catch (error) {
      console.error('Erreur lors de la vérification des changements:', error);
      return { hasChanges: true }; // En cas d'erreur, recharger tout
    }
  };

  // Fonction pour mettre à jour seulement les clients modifiés
  // Fonction pour détecter et retirer les clients supprimés en comparant avec la liste complète
  const detectAndRemoveDeletedClients = useCallback(async () => {
    try {
      // Vérifier d'abord si le cache contient des clients
      // Si le cache est vide (totalClients: 0), ne pas faire la comparaison car cela viderait tout
      const cached = localStorage.getItem('clientsByCityCache');
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          if (cacheData.totalClients === 0 || !cacheData.clientsBySector || Object.keys(cacheData.clientsBySector).length === 0) {
            console.log('ℹ️ Cache vide (0 clients), pas de vérification de suppressions nécessaire');
            return;
          }
        } catch (e) {
          console.warn('⚠️ Erreur lors de la lecture du cache, pas de vérification de suppressions');
          return;
        }
      } else {
        console.log('ℹ️ Pas de cache, pas de vérification de suppressions nécessaire');
        return;
      }
      
      // Charger tous les clients depuis l'API pour obtenir la liste complète des IDs
      const url = `${API_CONFIG.baseUrl}/api/clients/by-city${showFrequentOnly ? '?frequentOnly=true' : ''}`;
      const response = await fetch(url);
      const result = await response.json();
      
      if (!result.success || !result.data) {
        console.warn('⚠️ Impossible de charger la liste complète des clients pour détecter les suppressions');
        return;
      }
      
      // Extraire tous les IDs des clients actuels depuis la réponse
      // La structure est: { sector: { city: { clients: [...] } } } ou { sector: { districts: { district: [...] } } }
      const allClientIds = new Set<string>();
      
      const extractIds = (data: any) => {
        if (Array.isArray(data)) {
          // Si c'est un tableau de clients
          data.forEach(item => {
            if (item._id) allClientIds.add(item._id);
          });
        } else if (typeof data === 'object' && data !== null) {
          // Parcourir tous les secteurs (Laval, Rive Nord, etc.)
          Object.values(data).forEach((sectorData: any) => {
            if (typeof sectorData === 'object' && sectorData !== null) {
              // Parcourir toutes les villes ou districts dans le secteur
              Object.values(sectorData).forEach((cityOrDistrictData: any) => {
                if (typeof cityOrDistrictData === 'object' && cityOrDistrictData !== null) {
                  // Si c'est une structure avec 'clients' (ville)
                  if ('clients' in cityOrDistrictData && Array.isArray(cityOrDistrictData.clients)) {
                    cityOrDistrictData.clients.forEach((client: any) => {
                      if (client._id) allClientIds.add(client._id);
                    });
                  }
                  // Si c'est une structure avec 'districts' (Montréal/Laval)
                  if ('districts' in cityOrDistrictData && typeof cityOrDistrictData.districts === 'object') {
                    Object.values(cityOrDistrictData.districts).forEach((districtClients: any) => {
                      if (Array.isArray(districtClients)) {
                        districtClients.forEach((client: any) => {
                          if (client._id) allClientIds.add(client._id);
                        });
                      }
                    });
                  }
                  // Si c'est directement un tableau de clients (cas spécial)
                  if (Array.isArray(cityOrDistrictData)) {
                    cityOrDistrictData.forEach((client: any) => {
                      if (client._id) allClientIds.add(client._id);
                    });
                  }
                }
              });
            }
          });
        }
      };
      
      extractIds(result.data);
      
      console.log(`🔍 ${allClientIds.size} ID(s) de client(s) extrait(s) depuis l'API`);
      
      // Comparer avec les clients actuels dans l'état pour détecter les suppressions
      setClientsBySector(prevSector => {
        const updated = JSON.parse(JSON.stringify(prevSector)); // Deep copy
        let removedCount = 0;
        
        // Parcourir tous les secteurs
        Object.keys(updated).forEach(sectorKey => {
          const sector = updated[sectorKey];
          
          if (sectorKey === 'Montréal' || sectorKey === 'Laval') {
            // Pour Montréal/Laval avec districts
            const sectorData = sector as { districts?: Record<string, Client[]>; clients: Client[] };
            if (sectorData.districts) {
              Object.keys(sectorData.districts).forEach(district => {
                const beforeCount = sectorData.districts![district].length;
                sectorData.districts![district] = sectorData.districts![district].filter(
                  c => allClientIds.has(c._id)
                );
                const afterCount = sectorData.districts![district].length;
                removedCount += beforeCount - afterCount;
              });
            }
            if (sectorData.clients) {
              const beforeCount = sectorData.clients.length;
              sectorData.clients = sectorData.clients.filter(c => allClientIds.has(c._id));
              const afterCount = sectorData.clients.length;
              removedCount += beforeCount - afterCount;
            }
          } else {
            // Pour les autres secteurs (organisés par ville)
            const sectorData = sector as ClientsByCityData;
            Object.keys(sectorData).forEach(city => {
              const cityData = sectorData[city];
              if (cityData.clients) {
                const beforeCount = cityData.clients.length;
                cityData.clients = cityData.clients.filter(c => allClientIds.has(c._id));
                const afterCount = cityData.clients.length;
                removedCount += beforeCount - afterCount;
              }
              if (cityData.districts) {
                Object.keys(cityData.districts).forEach(district => {
                  const beforeCount = cityData.districts![district].length;
                  cityData.districts![district] = cityData.districts![district].filter(
                    c => allClientIds.has(c._id)
                  );
                  const afterCount = cityData.districts![district].length;
                  removedCount += beforeCount - afterCount;
                });
              }
            });
          }
        });
        
        if (removedCount > 0) {
          console.log(`🗑️ ${removedCount} client(s) supprimé(s) détecté(s) et retiré(s)`);
          
          // Recalculer le total
          let total = 0;
          Object.values(updated).forEach(sect => {
            if (typeof sect === 'object' && sect !== null && !Array.isArray(sect)) {
              if ('districts' in sect || 'clients' in sect) {
                const sectorData = sect as { districts?: Record<string, Client[]>; clients: Client[] };
                if (sectorData.districts) {
                  Object.values(sectorData.districts).forEach(districtClients => {
                    total += districtClients.length;
                  });
                }
                if (sectorData.clients) {
                  total += sectorData.clients.length;
                }
              } else {
                Object.values(sect as ClientsByCityData).forEach(cityData => {
                  if (cityData.clients) {
                    total += cityData.clients.length;
                  }
                  if (cityData.districts) {
                    Object.values(cityData.districts).forEach(districtClients => {
                      total += districtClients.length;
                    });
                  }
                });
              }
            }
          });
          setTotalClients(total);
          
          // Mettre à jour aussi clientsData (version aplatie)
          const flattened: ClientsByCityData = {};
          Object.values(updated).forEach(sect => {
            if (typeof sect === 'object' && sect !== null && !Array.isArray(sect)) {
              if ('districts' in sect || 'clients' in sect) {
                const sectorData = sect as { districts?: Record<string, Client[]>; clients: Client[] };
                if (sectorData.districts) {
                  Object.values(sectorData.districts).forEach(districtClients => {
                    districtClients.forEach(client => {
                      if (!flattened[client.city]) {
                        flattened[client.city] = { clients: [] };
                      }
                      flattened[client.city].clients.push(client);
                    });
                  });
                }
                if (sectorData.clients) {
                  sectorData.clients.forEach(client => {
                    if (!flattened[client.city]) {
                      flattened[client.city] = { clients: [] };
                    }
                    flattened[client.city].clients.push(client);
                  });
                }
              } else {
                Object.assign(flattened, sect);
              }
            }
          });
          setClientsData(flattened);
          
          // Sauvegarder dans le cache
          const updateTimestamp = new Date().toISOString();
          saveToCache(updated, flattened, total, updateTimestamp);
        }
        
        return updated;
      });
    } catch (error) {
      console.error('❌ Erreur lors de la détection des clients supprimés:', error);
    }
  }, []);

  const updateClientsIncremental = useCallback((changedClients: Array<Client & { sector?: string }>) => {
    if (changedClients.length === 0) return;

    console.log(`🔄 Mise à jour incrémentale de ${changedClients.length} client(s)`);

    setClientsBySector(prevSector => {
      const updated = JSON.parse(JSON.stringify(prevSector)); // Deep copy
      
      // Retirer les clients modifiés de leur ancien emplacement
      changedClients.forEach(changedClient => {
        // Parcourir tous les secteurs
        Object.keys(updated).forEach(sectorKey => {
          const sector = updated[sectorKey];
          
          if (sectorKey === 'Montréal' || sectorKey === 'Laval') {
            // Pour Montréal/Laval avec districts
            const sectorData = sector as { districts?: Record<string, Client[]>; clients: Client[] };
            if (sectorData.districts) {
              Object.keys(sectorData.districts).forEach(district => {
                sectorData.districts![district] = sectorData.districts![district].filter(
                  c => c._id !== changedClient._id
                );
              });
            }
            if (sectorData.clients) {
              sectorData.clients = sectorData.clients.filter(c => c._id !== changedClient._id);
            }
          } else {
            // Pour les autres secteurs (organisés par ville)
            const sectorData = sector as ClientsByCityData;
            Object.keys(sectorData).forEach(city => {
              const cityData = sectorData[city];
              if (cityData.clients) {
                cityData.clients = cityData.clients.filter(c => c._id !== changedClient._id);
              }
              if (cityData.districts) {
                Object.keys(cityData.districts).forEach(district => {
                  cityData.districts![district] = cityData.districts![district].filter(
                    c => c._id !== changedClient._id
                  );
                });
              }
            });
          }
        });
      });

      // Ajouter les clients modifiés à leur nouvel emplacement
      changedClients.forEach(changedClient => {
        // Utiliser le secteur retourné par le serveur, sinon le calculer
        const sector = changedClient.sector || getSector(changedClient.city);
        
        console.log(`📍 Client ${changedClient.givenName} ${changedClient.familyName} → Secteur: ${sector} (ville: ${changedClient.city})`);
        
        // Initialiser le secteur s'il n'existe pas
        if (!updated[sector]) {
          if (sector === 'Montréal' || sector === 'Laval') {
            updated[sector] = { districts: {}, clients: [] };
          } else {
            updated[sector] = {};
          }
        }

        if (sector === 'Montréal' || sector === 'Laval') {
          const sectorData = updated[sector] as { districts?: Record<string, Client[]>; clients: Client[] };
          if (changedClient.district) {
            if (!sectorData.districts) {
              sectorData.districts = {};
            }
            if (!sectorData.districts[changedClient.district]) {
              sectorData.districts[changedClient.district] = [];
            }
            sectorData.districts[changedClient.district].push(changedClient);
          } else {
            if (!sectorData.clients) {
              sectorData.clients = [];
            }
            sectorData.clients.push(changedClient);
          }
        } else {
          const sectorData = updated[sector] as ClientsByCityData;
          if (!sectorData[changedClient.city]) {
            sectorData[changedClient.city] = { clients: [] };
          }
          sectorData[changedClient.city].clients.push(changedClient);
        }
      });

      // Mettre à jour aussi clientsData (version aplatie)
      const flattened: ClientsByCityData = {};
      Object.values(updated).forEach(sect => {
        if (typeof sect === 'object' && sect !== null && !Array.isArray(sect)) {
          if ('districts' in sect || 'clients' in sect) {
            // C'est Montréal ou Laval
            const sectorData = sect as { districts?: Record<string, Client[]>; clients: Client[] };
            if (sectorData.districts) {
              Object.values(sectorData.districts).forEach(districtClients => {
                districtClients.forEach(client => {
                  if (!flattened[client.city]) {
                    flattened[client.city] = { clients: [] };
                  }
                  flattened[client.city].clients.push(client);
                });
              });
            }
            if (sectorData.clients) {
              sectorData.clients.forEach(client => {
                if (!flattened[client.city]) {
                  flattened[client.city] = { clients: [] };
                }
                flattened[client.city].clients.push(client);
              });
            }
          } else {
            // C'est un autre secteur
            Object.assign(flattened, sect);
          }
        }
      });

      setClientsData(flattened);
      
      // Recalculer le total des clients
      let total = 0;
      Object.values(updated).forEach(sect => {
        if (typeof sect === 'object' && sect !== null && !Array.isArray(sect)) {
          if ('districts' in sect || 'clients' in sect) {
            // Montréal ou Laval
            const sectorData = sect as { districts?: Record<string, Client[]>; clients: Client[] };
            if (sectorData.districts) {
              Object.values(sectorData.districts).forEach(districtClients => {
                total += districtClients.length;
              });
            }
            if (sectorData.clients) {
              total += sectorData.clients.length;
            }
          } else {
            // Autres secteurs
            Object.values(sect as ClientsByCityData).forEach(cityData => {
              if (cityData.clients) {
                total += cityData.clients.length;
              }
              if (cityData.districts) {
                Object.values(cityData.districts).forEach(districtClients => {
                  total += districtClients.length;
                });
              }
            });
          }
        }
      });
      setTotalClients(total);
      
      // Sauvegarder les données mises à jour dans le cache
      const updateTimestamp = new Date().toISOString();
      saveToCache(updated, flattened, total, updateTimestamp);
      
      return updated;
      
      console.log('✅ Mise à jour incrémentale terminée et sauvegardée dans le cache');
      
      return updated;
    });
  }, []);

  // Fonction pour charger directement depuis MongoDB (route optimisée, pas d'appels API externes)
  const loadFromAPI = useCallback(async (forceReload: boolean = false, frequentOnlyOverride?: boolean) => {
      try {
        setLoading(true);
        setError(null);
        
        if (forceReload) {
          setClientsData({});
          setClientsBySector({});
          setExpandedSectors(new Set());
          setExpandedCities(new Set());
          setExpandedDistricts(new Set());
        }

        // Utiliser la valeur override si fournie, sinon utiliser l'état actuel
        const shouldFilterFrequent = frequentOnlyOverride !== undefined ? frequentOnlyOverride : showFrequentOnly;

        console.log('📦 Chargement depuis MongoDB (route optimisée /by-city)...');
        const url = `${API_CONFIG.baseUrl}/api/clients/by-city${shouldFilterFrequent ? '?frequentOnly=true' : ''}`;
        console.log(`📦 URL: ${url} (filtre fréquents: ${shouldFilterFrequent})`);
        const response = await fetch(url);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Erreur lors du chargement');
        }

        // Les données sont déjà dans le bon format depuis l'API
        const finalClientsBySector = result.data as ClientsBySectorData;
        setClientsBySector(finalClientsBySector);
        
        // Aplatir pour clientsData (version sans secteurs)
        const flattened: ClientsByCityData = {};
        Object.values(finalClientsBySector).forEach(sector => {
          if (typeof sector === 'object' && sector !== null) {
            // Pour Montréal/Laval, la structure est différente
            if ('districts' in sector || 'clients' in sector) {
              const sectorData = sector as { districts?: Record<string, Client[]>; clients: Client[] };
              if (sectorData.districts) {
                Object.values(sectorData.districts).forEach(districtClients => {
                  districtClients.forEach(client => {
                    if (!flattened[client.city]) {
                      flattened[client.city] = { clients: [] };
                    }
                    flattened[client.city].clients.push(client);
                  });
                });
              }
              if (sectorData.clients) {
                sectorData.clients.forEach(client => {
                  if (!flattened[client.city]) {
                    flattened[client.city] = { clients: [] };
                  }
                  flattened[client.city].clients.push(client);
                });
              }
            } else {
              // Pour les autres secteurs, c'est directement organisé par ville
              Object.assign(flattened, sector);
            }
          }
        });
        setClientsData(flattened);
        setTotalClients(result.totalClients);
        
        // Sauvegarder dans le cache localStorage (optimisation)
        const updateTimestamp = new Date().toISOString();
        saveToCache(finalClientsBySector, flattened, result.totalClients, updateTimestamp);
        
        setLoading(false);
        console.log(`✅ Chargement terminé (${result.totalClients} clients)`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        setLoading(false);
        console.error('❌ Erreur lors du chargement depuis l\'API:', err);
      }
  }, []);

  useEffect(() => {
    const startStream = async (forceReload: boolean = false) => {
      try {
        // Vérifier si le cache existe
        const cachedTimestamp = localStorage.getItem('clientsByCityLastUpdate');
        const hasCache = cachedTimestamp && localStorage.getItem('clientsByCityCache');
        
        // Si pas de rechargement forcé et que le cache existe, vérifier les changements
        if (!forceReload && hasCache) {
          const result = await checkForChanges();
          if (!result.hasChanges) {
            // Pas de changements, charger depuis le cache
            if (loadFromCache()) {
              setLoading(false);
              console.log('✅ Données chargées depuis le cache (aucun changement détecté)');
              // Le timestamp est déjà mis à jour dans checkForChanges() avec celui du serveur
              // Détecter les suppressions même après chargement depuis le cache
              // (la fonction vérifie elle-même si le cache est valide)
              detectAndRemoveDeletedClients();
              return;
            }
          } else if (result.changedClients && result.changedClients.length > 0) {
            // Il y a des changements, mettre à jour incrémentalement
            console.log(`🔄 ${result.changedClients.length} client(s) modifié(s), mise à jour incrémentale...`);
            updateClientsIncremental(result.changedClients);
            // Détecter les suppressions en comparant avec la liste complète
            detectAndRemoveDeletedClients();
            setLoading(false);
            return;
          } else if (result.hasChanges) {
            // Si hasChanges mais pas de changedClients, c'est qu'il y a des changements mais aucun client avec adresse
            // Dans ce cas, on ne fait rien (pas de rechargement complet) car les clients sans adresse ne sont pas affichés
            console.log('ℹ️ Changements détectés mais aucun client avec adresse à mettre à jour (ignoré)');
            setLoading(false);
            return;
          }
          // Si pas de hasChanges, continuer pour charger depuis l'API (cas normal)
        }
        
        // Si pas de cache ou rechargement forcé, charger depuis l'API (route optimisée)
        if (!hasCache || forceReload) {
          console.log(forceReload ? '🔄 Rechargement forcé depuis l\'API...' : '📦 Pas de cache, chargement depuis l\'API...');
          loadFromAPI(forceReload);
          return;
        }

        // Si on arrive ici, c'est qu'il y a un cache mais qu'on veut quand même recharger
        // On utilise loadFromAPI à la place du streaming pour éviter les 500 appels API
        console.log('⚠️ Cache existant mais chargement via API optimisée (pas de streaming)');
        loadFromAPI(forceReload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        console.error('Erreur:', err);
        setLoading(false);
      }
    };

    // Charger depuis le cache au démarrage, puis vérifier les changements
    const initialize = async () => {
      // Éviter les initialisations multiples
      if (hasInitializedRef.current) {
        console.log('⚠️ Initialisation déjà effectuée, ignorée');
        return;
      }
      
      hasInitializedRef.current = true;
      
      // D'abord charger depuis le cache pour un affichage immédiat
      const hasCache = loadFromCache();
      if (hasCache) {
        setLoading(false);
        console.log('✅ Données chargées depuis le cache');
        // Détecter les suppressions même après chargement depuis le cache
        // (la fonction vérifie elle-même si le cache est valide)
        detectAndRemoveDeletedClients();
      }
      
      // Vérifier si on a un timestamp de cache
      const cachedTimestamp = localStorage.getItem('clientsByCityLastUpdate');
      const cachedData = localStorage.getItem('clientsByCityCache');
      
      // Si pas de cache ou pas de timestamp, charger depuis l'API
      if (!hasCache || !cachedTimestamp || !cachedData) {
        console.log('📦 Pas de cache ou cache invalide, chargement depuis l\'API...', {
          hasCache,
          hasTimestamp: !!cachedTimestamp,
          hasCachedData: !!cachedData
        });
        loadFromAPI(false);
        return;
      }
      
      // Si cache existe, vérifier les changements en arrière-plan
      const result = await checkForChanges();
      if (result.hasChanges) {
        if (result.changedClients && result.changedClients.length > 0) {
          console.log(`🔄 ${result.changedClients.length} client(s) modifié(s), mise à jour incrémentale...`);
          // Mettre à jour seulement les clients modifiés
          updateClientsIncremental(result.changedClients);
          // Détecter les suppressions en comparant avec la liste complète
          detectAndRemoveDeletedClients();
        } else {
          // Si hasChanges mais pas de changedClients, c'est qu'il y a des changements mais aucun client avec adresse
          // Dans ce cas, on ne fait rien (pas de rechargement complet) car les clients sans adresse ne sont pas affichés dans ClientsByCity
          console.log('ℹ️ Changements détectés mais aucun client avec adresse à mettre à jour (clients sans adresse ignorés)');
          // S'assurer que loading est false
          setLoading(false);
        }
      } else {
        console.log('✅ Aucun changement détecté, conservation du cache');
        // Le timestamp est déjà mis à jour dans checkForChanges() avec celui du serveur
        // S'assurer que loading est false
        setLoading(false);
      }
    };

    initialize();

    // Nettoyer lors du démontage
    return () => {
      // Réinitialiser le flag si le composant est démonté
      hasInitializedRef.current = false;
    };
  }, [refreshKey, updateClientsIncremental, detectAndRemoveDeletedClients, loadFromAPI, showFrequentOnly]);

  const fetchClientsByCityStream = () => {
    // Réinitialiser tous les états pour fermer les menus
    setExpandedSectors(new Set());
    setExpandedCities(new Set());
    setExpandedDistricts(new Set());
    
    // Vider le cache pour forcer un rechargement complet
    localStorage.removeItem('clientsByCityCache');
    localStorage.removeItem('clientsByCityLastUpdate');
    localStorage.removeItem('clientsBySectorData');
    localStorage.removeItem('lastUpdate');
    
    // Réinitialiser le flag d'initialisation pour permettre un nouveau chargement
    hasInitializedRef.current = false;
    
    // Charger depuis l'API (route optimisée, pas de streaming)
    loadFromAPI(true);
  };

  const handleFixAddress = async () => {
    if (!editingClient || !correctedAddress.trim()) {
      return;
    }

    setIsFixing(true);
    try {
      // Utiliser le nouvel endpoint qui met à jour et retourne le client traité
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/update-single-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: editingClient._id,
          newAddress: correctedAddress.trim()
        }),
      });

      const result = await response.json();

      if (result.success && result.client && result.location) {
        // Mettre à jour seulement ce client dans les données existantes
        const updatedClient = result.client;
        const { sector, city, district } = result.location;

        // Retirer le client de son ancien emplacement et l'ajouter au nouveau
        setClientsBySector(prev => {
          const updated = JSON.parse(JSON.stringify(prev)); // Deep copy
          
          // Retirer le client de tous les secteurs
          Object.keys(updated).forEach(sect => {
            if (typeof updated[sect] === 'object' && updated[sect] !== null) {
              // Pour Montréal/Laval
              if ((sect === 'Montréal' || sect === 'Laval') && 'districts' in updated[sect]) {
                const sectorData = updated[sect] as { districts?: Record<string, Client[]>; clients: Client[] };
                if (sectorData.districts) {
                  Object.keys(sectorData.districts).forEach(dist => {
                    sectorData.districts![dist] = sectorData.districts![dist].filter(c => c._id !== updatedClient._id);
                  });
                }
                if (sectorData.clients) {
                  sectorData.clients = sectorData.clients.filter(c => c._id !== updatedClient._id);
                }
              } else if (typeof updated[sect] === 'object') {
                // Pour les autres secteurs
                Object.keys(updated[sect] as ClientsByCityData).forEach(cityName => {
                  const cityData = (updated[sect] as ClientsByCityData)[cityName];
                  if (cityData.clients) {
                    cityData.clients = cityData.clients.filter(c => c._id !== updatedClient._id);
                  }
                });
              }
            }
          });

          // Ajouter le client à son nouvel emplacement
          if (!updated[sector]) {
            if (sector === 'Montréal' || sector === 'Laval') {
              updated[sector] = { districts: {}, clients: [] };
            } else {
              updated[sector] = {};
            }
          }

          if (sector === 'Montréal' || sector === 'Laval') {
            const sectorData = updated[sector] as { districts?: Record<string, Client[]>; clients: Client[] };
            if (district) {
              if (!sectorData.districts) {
                sectorData.districts = {};
              }
              if (!sectorData.districts[district]) {
                sectorData.districts[district] = [];
              }
              sectorData.districts[district].push(updatedClient);
            } else {
              if (!sectorData.clients) {
                sectorData.clients = [];
              }
              sectorData.clients.push(updatedClient);
            }
          } else {
            const sectorData = updated[sector] as ClientsByCityData;
            if (!sectorData[city]) {
              sectorData[city] = { clients: [] };
            }
            sectorData[city].clients.push(updatedClient);
          }

          // Mettre à jour le cache
          const flattened: ClientsByCityData = {};
          Object.values(updated).forEach(sect => {
            if (typeof sect === 'object' && sect !== null && !Array.isArray(sect)) {
              Object.assign(flattened, sect);
            }
          });
          saveToCache(updated, flattened, totalClients, new Date().toISOString());

          return updated;
        });

        setEditingClient(null);
        setCorrectedAddress('');
        console.log('✅ Client mis à jour localement');
      } else {
        // Si la mise à jour locale échoue, recharger tout
        alert(`Client mis à jour. Rechargement des données...`);
        fetchClientsByCityStream();
      }
    } catch (error) {
      console.error('Erreur lors de la correction:', error);
      alert('Erreur lors de la correction de l\'adresse. Rechargement des données...');
      fetchClientsByCityStream();
    } finally {
      setIsFixing(false);
    }
  };

  const toggleSector = (sector: string) => {
    const newExpanded = new Set(expandedSectors);
    if (newExpanded.has(sector)) {
      newExpanded.delete(sector);
    } else {
      newExpanded.add(sector);
    }
    setExpandedSectors(newExpanded);
  };

  const fetchClientsByCity = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_CONFIG.baseUrl}/api/clients/by-city`);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des clients');
      }
      
      const result = await response.json();
      if (result.success) {
        setClientsData(result.data);
        setTotalClients(result.totalClients || 0);
        // Ne pas ouvrir automatiquement les villes - laisser l'utilisateur choisir
      } else {
        throw new Error(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCity = (cityKey: string) => {
    const newExpanded = new Set(expandedCities);
    if (newExpanded.has(cityKey)) {
      newExpanded.delete(cityKey);
    } else {
      newExpanded.add(cityKey);
    }
    setExpandedCities(newExpanded);
  };

  const toggleDistrict = (sector: string, city: string, district: string) => {
    const key = `${sector}-${city}-${district}`;
    const newExpanded = new Set(expandedDistricts);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedDistricts(newExpanded);
  };

  const getClientCount = (cityData: CityData): number => {
    // Si la ville a des districts (Montréal/Laval) et qu'ils contiennent des clients
    if (cityData.districts && Object.keys(cityData.districts).length > 0) {
      const districtCount = Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
      // Si les districts ont des clients, utiliser ce compte
      if (districtCount > 0) {
        return districtCount;
      }
    }
    // Sinon, compter les clients directs
    return cityData.clients?.length || 0;
  };

  // Fonction pour vérifier si un client correspond au terme de recherche
  const clientMatchesSearch = (client: Client, search: string): boolean => {
    if (!search.trim()) return true;
    
    const searchLower = search.toLowerCase().trim();
    const fullName = `${client.givenName} ${client.familyName}`.toLowerCase();
    const phoneNumber = client.phoneNumber?.toLowerCase() || '';
    const address = client.addressLine1?.toLowerCase() || '';
    
    return fullName.includes(searchLower) || 
           phoneNumber.includes(searchLower) || 
           address.includes(searchLower);
  };

  // Fonction pour filtrer les clients selon le terme de recherche (par ville)
  const filterClientsData = (data: ClientsByCityData, search: string): ClientsByCityData => {
    if (!search.trim()) return data;
    
    const filtered: ClientsByCityData = {};
    
    Object.entries(data).forEach(([city, cityData]) => {
      const filteredCityData: CityData = {
        clients: [],
        districts: {}
      };
      
      // Filtrer les districts
      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
        Object.entries(cityData.districts).forEach(([district, clients]) => {
          const filteredClients = clients.filter(client => clientMatchesSearch(client, search));
          if (filteredClients.length > 0) {
            filteredCityData.districts![district] = filteredClients;
          }
        });
      }
      
      // Filtrer les clients directs
      if (cityData.clients && cityData.clients.length > 0) {
        filteredCityData.clients = cityData.clients.filter(client => clientMatchesSearch(client, search));
      }
      
      // Ne garder la ville que si elle a des clients après filtrage
      const hasClients = (filteredCityData.districts && Object.keys(filteredCityData.districts).length > 0) ||
                        (filteredCityData.clients && filteredCityData.clients.length > 0);
      
      if (hasClients) {
        filtered[city] = filteredCityData;
      }
    });
    
    return filtered;
  };

  // Fonction pour filtrer les clients selon le terme de recherche (par secteur)
  const filterClientsBySector = (data: ClientsBySectorData, search: string): ClientsBySectorData => {
    if (!search.trim()) return data;
    
    const filtered: ClientsBySectorData = {};
    
    Object.entries(data).forEach(([sector, cities]) => {
      // Pour Montréal et Laval, la structure est différente (districts directement)
      if ((sector === 'Montréal' || sector === 'Laval') && 'districts' in cities) {
        const filteredDistricts: Record<string, Client[]> = {};
        
        if (cities.districts && Object.keys(cities.districts).length > 0) {
          Object.entries(cities.districts).forEach(([district, clients]) => {
            const filteredClients = clients.filter(client => clientMatchesSearch(client, search));
            if (filteredClients.length > 0) {
              filteredDistricts[district] = filteredClients;
            }
          });
        }
        
        const filteredClients = (cities.clients || []).filter(client => clientMatchesSearch(client, search));
        
        // Ne garder le secteur que s'il a des districts ou clients après filtrage
        if (Object.keys(filteredDistricts).length > 0 || filteredClients.length > 0) {
          filtered[sector] = {
            districts: filteredDistricts,
            clients: filteredClients
          };
        }
      } else {
        // Pour les autres secteurs, structure normale avec villes
        const filteredSector: ClientsByCityData = {};
        
        Object.entries(cities as ClientsByCityData).forEach(([city, cityData]) => {
          const filteredCityData: CityData = {
            clients: [],
            districts: {}
          };
          
          // Filtrer les districts pour Montréal/Laval
          if (cityData.districts && Object.keys(cityData.districts).length > 0) {
            Object.entries(cityData.districts).forEach(([district, clients]) => {
              const filteredClients = clients.filter(client => clientMatchesSearch(client, search));
              if (filteredClients.length > 0) {
                filteredCityData.districts![district] = filteredClients;
              }
            });
          }
          
          // Filtrer les clients directs pour les autres villes
          if (cityData.clients && cityData.clients.length > 0) {
            filteredCityData.clients = cityData.clients.filter(client => clientMatchesSearch(client, search));
          }
          
          // Ne garder la ville que si elle a des clients après filtrage
          const hasClients = (filteredCityData.districts && Object.keys(filteredCityData.districts).length > 0) ||
                            (filteredCityData.clients && filteredCityData.clients.length > 0);
          
          if (hasClients) {
            filteredSector[city] = filteredCityData;
          }
        });
        
        // Ne garder le secteur que s'il a des villes avec clients
        if (Object.keys(filteredSector).length > 0) {
          filtered[sector] = filteredSector;
        }
      }
    });
    
    return filtered;
  };

  // Fonction pour collecter tous les clients depuis les données
  const getAllClients = useCallback((): Client[] => {
    const allClients: Client[] = [];
    
    // Collecter depuis clientsBySector
    Object.entries(clientsBySector).forEach(([sector, sectorData]) => {
      if ((sector === 'Montréal' || sector === 'Laval') && 'districts' in sectorData) {
        // Pour Montréal et Laval
        if (sectorData.districts) {
          Object.values(sectorData.districts).forEach(clients => {
            allClients.push(...clients);
          });
        }
        if (sectorData.clients) {
          allClients.push(...sectorData.clients);
        }
      } else {
        // Pour les autres secteurs
        Object.entries(sectorData as ClientsByCityData).forEach(([city, cityData]) => {
          if (cityData.districts) {
            Object.values(cityData.districts).forEach(clients => {
              allClients.push(...clients);
            });
          }
          if (cityData.clients) {
            allClients.push(...cityData.clients);
          }
        });
      }
    });
    
    // Collecter depuis clientsData (fallback)
    Object.values(clientsData).forEach(cityData => {
      if (cityData.districts) {
        Object.values(cityData.districts).forEach(clients => {
          allClients.push(...clients);
        });
      }
      if (cityData.clients) {
        allClients.push(...cityData.clients);
      }
    });
    
    return allClients;
  }, [clientsBySector, clientsData]);

  // Fonction pour filtrer les clients en temps réel et afficher les suggestions
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    
    if (!value.trim()) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      setHighlightedClientId(null);
      return;
    }
    
    const searchLower = value.toLowerCase().trim();
    const allClients = getAllClients();
    
    // Filtrer les clients qui correspondent
    const matchingClients = allClients.filter(client => {
      const fullName = `${client.givenName} ${client.familyName}`.toLowerCase();
      const phoneMatch = client.phoneNumber?.toLowerCase().includes(searchLower);
      const addressMatch = client.addressLine1?.toLowerCase().includes(searchLower);
      
      return fullName.includes(searchLower) || phoneMatch || addressMatch;
    }).slice(0, 10); // Limiter à 10 résultats
    
    setSearchSuggestions(matchingClients);
    setShowSuggestions(matchingClients.length > 0);
  }, [getAllClients]);

  // Fonction pour trouver le client dans la structure de données et ouvrir les sections nécessaires
  const findClientLocation = useCallback((clientId: string): { sector?: string; city?: string; district?: string } | null => {
    // Chercher dans clientsBySector
    for (const [sector, sectorData] of Object.entries(clientsBySector)) {
      if ((sector === 'Montréal' || sector === 'Laval') && 'districts' in sectorData) {
        // Pour Montréal et Laval
        if (sectorData.districts) {
          for (const [district, clients] of Object.entries(sectorData.districts)) {
            if (clients.some(c => c._id === clientId)) {
              return { sector, district };
            }
          }
        }
        if (sectorData.clients && sectorData.clients.some(c => c._id === clientId)) {
          return { sector };
        }
      } else {
        // Pour les autres secteurs
        for (const [city, cityData] of Object.entries(sectorData as ClientsByCityData)) {
          if (cityData.districts) {
            for (const [district, clients] of Object.entries(cityData.districts)) {
              if (clients.some(c => c._id === clientId)) {
                return { sector, city, district };
              }
            }
          }
          if (cityData.clients && cityData.clients.some(c => c._id === clientId)) {
            return { sector, city };
          }
        }
      }
    }
    
    // Chercher dans clientsData (fallback)
    for (const [city, cityData] of Object.entries(clientsData)) {
      if (cityData.districts) {
        for (const [district, clients] of Object.entries(cityData.districts)) {
          if (clients.some(c => c._id === clientId)) {
            return { city, district };
          }
        }
      }
      if (cityData.clients && cityData.clients.some(c => c._id === clientId)) {
        return { city };
      }
    }
    
    return null;
  }, [clientsBySector, clientsData]);

  // Fonction pour sélectionner un client depuis les suggestions
  const handleSelectClient = useCallback((client: Client) => {
    // Fermer les suggestions
    setShowSuggestions(false);
    setSearchTerm(`${client.givenName} ${client.familyName}`);
    setHighlightedClientId(client._id);
    
    // Trouver la location du client et ouvrir les sections nécessaires
    const location = findClientLocation(client._id);
    if (location) {
      // Ouvrir le secteur si nécessaire
      if (location.sector) {
        setExpandedSectors(prev => new Set([...prev, location.sector!]));
      }
      
      // Ouvrir la ville si nécessaire
      if (location.city) {
        const cityKey = location.sector ? `${location.sector}-${location.city}` : location.city;
        setExpandedCities(prev => new Set([...prev, cityKey]));
      }
      
      // Ouvrir le district si nécessaire
      if (location.district) {
        const districtKey = location.sector ? `${location.sector}-${location.district}` : location.district;
        setExpandedDistricts(prev => new Set([...prev, districtKey]));
      }
    }
    
    // Trouver et scroller vers le client dans la liste
    setTimeout(() => {
      const clientElement = document.getElementById(`client-${client._id}`);
      if (clientElement) {
        clientElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        // Mettre en évidence temporairement
        clientElement.classList.add('ring-2', 'ring-cyan-400', 'ring-opacity-50');
        setTimeout(() => {
          clientElement.classList.remove('ring-2', 'ring-cyan-400', 'ring-opacity-50');
          setHighlightedClientId(null);
        }, 3000);
      }
    }, 500); // Augmenter le délai pour laisser le temps aux sections de s'ouvrir
  }, [findClientLocation]);

  // Fermer les suggestions quand on clique en dehors ou lors du scroll
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

    const handleScroll = () => {
      setShowSuggestions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  // Données filtrées selon le terme de recherche
  const filteredClientsBySector = useMemo(() => {
    if (Object.keys(clientsBySector).length > 0) {
      return filterClientsBySector(clientsBySector, searchTerm);
    }
    // Fallback vers l'ancienne structure si pas encore de données par secteur
    const flattened: ClientsByCityData = {};
    Object.values(clientsBySector).forEach(sector => {
      Object.assign(flattened, sector);
    });
    return { 'Autres': flattened };
  }, [clientsBySector, searchTerm]);

  // Compter le nombre total de clients filtrés
  const filteredClientCount = useMemo(() => {
    let count = 0;
    Object.entries(filteredClientsBySector).forEach(([sector, sectorData]) => {
      // Pour Montréal et Laval, la structure est différente
      if ((sector === 'Montréal' || sector === 'Laval') && 'districts' in sectorData) {
        if (sectorData.districts && Object.keys(sectorData.districts).length > 0) {
          count += Object.values(sectorData.districts).reduce((sum, clients) => sum + clients.length, 0);
        }
        count += sectorData.clients?.length || 0;
      } else {
        // Pour les autres secteurs, structure normale
        Object.values(sectorData as ClientsByCityData).forEach(cityData => {
          if (cityData.districts && Object.keys(cityData.districts).length > 0) {
            count += Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
          } else {
            count += cityData.clients?.length || 0;
          }
        });
      }
    });
    return count;
  }, [filteredClientsBySector]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Barre de progression */}
        <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg p-6 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
              Traitement en cours...
            </h2>
            <div className="text-right">
              <p className="text-cyan-300 font-semibold drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]">{progress.percentage}%</p>
              <p className="text-gray-300 text-sm">{progress.processed} / {progress.total} clients</p>
            </div>
          </div>
          
          {/* Barre de progression */}
          <div className="w-full bg-gray-900/60 rounded-full h-3 mb-4 overflow-hidden border border-indigo-500/20">
            <div 
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 h-3 rounded-full transition-all duration-300 ease-out shadow-lg shadow-indigo-500/50"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>

          {/* Informations détaillées */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg p-3 border border-cyan-500/20 shadow-lg shadow-cyan-500/5">
              <p className="text-cyan-300 mb-1 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]">Client actuel</p>
              <p className="text-white font-medium drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">{progress.currentClient || 'En attente...'}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg p-3 border border-purple-500/20 shadow-lg shadow-purple-500/5">
              <p className="text-purple-300 mb-1 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]">Ville / Quartier</p>
              <p className="text-white font-medium drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">
                {progress.city || 'En attente...'}
                {progress.district && <span className="text-purple-300 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]"> - {progress.district}</span>}
              </p>
            </div>
            <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg p-3 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
              <p className="text-indigo-300 mb-1 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">Temps</p>
              <p className="text-white font-medium drop-shadow-[0_0_3px_rgba(139,92,246,0.6)]">
                Écoulé: {progress.elapsed} | Restant: ~{progress.estimated}
              </p>
            </div>
          </div>
        </div>

        {/* Affichage des données déjà reçues */}
        {Object.keys(clientsData).length > 0 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 backdrop-blur-sm border border-amber-500/50 rounded-lg p-4 shadow-lg shadow-amber-500/20">
              <p className="text-amber-300 text-sm flex items-center gap-2 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]">
                <span className="text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]">⚡</span>
                {Object.keys(clientsData).length} ville{Object.keys(clientsData).length > 1 ? 's' : ''} déjà chargée{Object.keys(clientsData).length > 1 ? 's' : ''} - Les données s'affichent au fur et à mesure
              </p>
            </div>
            
            {/* Afficher les secteurs déjà reçus - cette section sera remplacée par la nouvelle structure */}
            {Object.keys(clientsBySector).length > 0 && (
              <div className="space-y-4">
                {Object.entries(filterClientsBySector(clientsBySector, searchTerm))
                  .sort(([sectorA, citiesA], [sectorB, citiesB]) => {
                    // "Non assignés" toujours en dernier
                    if (sectorA === 'Non assignés') return 1;
                    if (sectorB === 'Non assignés') return -1;
                    
                    // Calculer le nombre de clients pour chaque secteur
                    const getSectorClientCount = (sector: string, cities: any): number => {
                      if (sector === 'Montréal' || sector === 'Laval') {
                        // La structure est { "Montréal": { districts: {...}, clients: [...] } } ou { "Laval": { districts: {...}, clients: [...] } }
                        const sectorData = cities[sector] || cities;
                        if (sectorData && typeof sectorData === 'object') {
                          let count = 0;
                          if (sectorData.districts && typeof sectorData.districts === 'object') {
                            count += Object.values(sectorData.districts).reduce((sum: number, district: any) => {
                              return sum + (Array.isArray(district) ? district.length : 0);
                            }, 0);
                          }
                          if (Array.isArray(sectorData.clients)) {
                            count += sectorData.clients.length;
                          }
                          return count;
                        }
                        return 0;
                      }
                      // Pour les autres secteurs, compter les clients dans toutes les villes
                      if (typeof cities === 'object' && cities !== null) {
                        return Object.values(cities).reduce((sum: number, cityData: any) => {
                          if (cityData && typeof cityData === 'object') {
                            if ('districts' in cityData && cityData.districts) {
                              return sum + Object.values(cityData.districts).reduce((dSum: number, district: any) => {
                                return dSum + (Array.isArray(district) ? district.length : 0);
                              }, 0);
                            }
                            return sum + (Array.isArray(cityData.clients) ? cityData.clients.length : 0);
                          }
                          return sum;
                        }, 0);
                      }
                      return 0;
                    };
                    
                    const countA = getSectorClientCount(sectorA, citiesA);
                    const countB = getSectorClientCount(sectorB, citiesB);
                    
                    // Trier par nombre de clients (décroissant)
                    return countB - countA;
                  })
                  .map(([sector, cities]) => {
                    const isSectorExpanded = expandedSectors.has(sector);
                    
                    let sectorClientCount = 0;
                    let sectorCityCount = 0;
                    
                    // Pour Montréal et Laval, la structure est différente (districts directement)
                    if (sector === 'Montréal' || sector === 'Laval') {
                      // La structure est { "Montréal": { districts: {...}, clients: [...] } } ou { "Laval": { districts: {...}, clients: [...] } }
                      const sectorData = cities[sector] || cities;
                      if (sectorData && typeof sectorData === 'object') {
                        if (sectorData.districts && Object.keys(sectorData.districts).length > 0) {
                          sectorClientCount += Object.values(sectorData.districts).reduce((sum, clients) => sum + clients.length, 0);
                        }
                        if (sectorData.clients && Array.isArray(sectorData.clients)) {
                          sectorClientCount += sectorData.clients.length;
                        }
                      }
                      sectorCityCount = 1; // Montréal/Laval compte comme 1 ville
                    } else {
                      // Pour les autres secteurs, structure normale avec villes
                      Object.values(cities as ClientsByCityData).forEach(cityData => {
                      sectorCityCount++;
                      if (cityData.districts && Object.keys(cityData.districts).length > 0) {
                        sectorClientCount += Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
                      } else {
                        sectorClientCount += cityData.clients?.length || 0;
                      }
                    });
                    }
                    
                    return (
                      <div
                        key={sector}
                        className="bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-200 shadow-md"
                      >
                        <button
                          onClick={() => toggleSector(sector)}
                          className="w-full px-6 py-4 flex items-center gap-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 transition-all duration-200"
                        >
                          {isSectorExpanded ? (
                            <ChevronDown className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                          )}
                          <Building className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                          <span className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(139,92,246,0.6)] flex-shrink-0">
                            {sector}
                          </span>
                          <span className="px-3 py-1.5 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 backdrop-blur-sm text-indigo-200 rounded-lg text-sm font-semibold border border-indigo-400/40 shadow-lg shadow-indigo-500/20 drop-shadow-[0_0_3px_rgba(139,92,246,0.6)] flex-shrink-0">
                            {sectorClientCount} client{sectorClientCount > 1 ? 's' : ''}
                          </span>
                          <span className="px-2.5 py-1.5 bg-gradient-to-br from-purple-500/30 to-pink-500/30 backdrop-blur-sm text-purple-200 rounded-lg text-xs border border-purple-400/40 shadow-lg shadow-purple-500/20 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)] flex-shrink-0">
                            {sectorCityCount} ville{sectorCityCount > 1 ? 's' : ''}
                          </span>
                        </button>

                        {isSectorExpanded && (
                          <div className="px-6 pb-4 space-y-4 mt-2">
                            {/* Pour Montréal et Laval, afficher directement les quartiers (pas de niveau ville) */}
                            {(sector === 'Montréal' || sector === 'Laval') ? (
                              <div className="space-y-2">
                                {/* Afficher les districts */}
                                {(() => {
                                  const sectorData = cities[sector] || cities;
                                  if (sectorData && typeof sectorData === 'object' && sectorData.districts && Object.keys(sectorData.districts).length > 0) {
                                    return (
                                      <>
                                {Object.entries(sectorData.districts)
                                  .sort(([districtA, clientsA], [districtB, clientsB]) => {
                                    if (clientsA.length !== clientsB.length) {
                                      return clientsB.length - clientsA.length;
                                    }
                                    return districtA.localeCompare(districtB);
                                  })
                                  .map(([district, clients]) => {
                                    const districtKey = `${sector}-${district}`;
                                    const isDistrictExpanded = expandedDistricts.has(districtKey);

                                    return (
                                      <div
                                        key={district}
                                        className="bg-gray-800/20 rounded border border-gray-700/20"
                                      >
                                        <button
                                          onClick={() => toggleDistrict(sector, sector, district)}
                                          className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-700/20 transition-colors rounded"
                                        >
                                          <div className="flex items-center gap-2">
                                            {isDistrictExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-indigo-400" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-indigo-400" />
                                            )}
                                            <Home className="h-4 w-4 text-indigo-400" />
                                            <span className="font-medium text-gray-300">{district}</span>
                                            <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs">
                                              {clients.length} client{clients.length > 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </button>

                                        {isDistrictExpanded && (
                                          <div className="px-4 pb-3 space-y-2">
                                            {clients.map((client) => (
                                              <div
                                                key={client._id}
                                                id={`client-${client._id}`}
                                                className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                                  highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                                }`}
                                              >
                                                <div className="flex flex-col gap-2">
                                                  <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                        {client.givenName} {client.familyName}
                                                      </h4>
                                                      <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                                        <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                                        <span className="break-words">{client.addressLine1}</span>
                                                      </p>
                                                      {client.phoneNumber && (
                                                        <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                                          <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0" />
                                                          <span className="break-all">{client.phoneNumber}</span>
                                                        </p>
                                                      )}
                                                    </div>
                                                  </div>
                                                  {client.coordinates && (
                                                    <a
                                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="mt-1 w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20 text-center"
                                                    >
                                                      Voir carte
                                                    </a>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  </>
                                    );
                                  }
                                  return null;
                                })()}
                                
                                {/* Afficher les clients sans district */}
                                {(() => {
                                  const sectorData = cities[sector] || cities;
                                  if (sectorData && typeof sectorData === 'object' && sectorData.clients && Array.isArray(sectorData.clients) && sectorData.clients.length > 0) {
                                    return (
                                  <div className="bg-gray-800/20 rounded border border-gray-700/20">
                                    <div className="px-4 py-2 flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-indigo-400" />
                                        <span className="font-medium text-gray-300">Sans quartier assigné</span>
                                        <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs">
                                          {sectorData.clients.length} client{sectorData.clients.length > 1 ? 's' : ''}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="px-4 pb-3 space-y-2">
                                      {sectorData.clients.map((client) => (
                                        <div
                                          key={client._id}
                                          id={`client-${client._id}`}
                                          className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                            highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                          }`}
                                        >
                                          <div className="flex flex-col gap-2">
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                  {client.givenName} {client.familyName}
                                                </h4>
                                                <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                                  <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                                  <span className="break-words">{client.addressLine1}</span>
                                                </p>
                                                {client.phoneNumber && (
                                                  <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                                    <Phone className="h-3 w-3 flex-shrink-0" />
                                                    <span className="break-all">{client.phoneNumber}</span>
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                            {client.coordinates && (
                                              <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-1 w-full sm:w-auto px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-xs transition-colors text-center"
                                              >
                                                Voir carte
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ) : (
                              // Pour les autres secteurs, afficher les villes normalement
                              <div className="space-y-4">
                                {Object.entries(cities as ClientsByCityData)
                                  .sort(([cityA, cityDataA], [cityB, cityDataB]) => {
                                    const aLower = cityA.toLowerCase();
                                    const bLower = cityB.toLowerCase();
                                    const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
                                    const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
                                    
                                    if (isAMontrealOrLaval && isBMontrealOrLaval) {
                                      if (aLower === 'montréal') return -1;
                                      if (bLower === 'montréal') return 1;
                                      const countA = getClientCount(cityDataA);
                                      const countB = getClientCount(cityDataB);
                                      return countB - countA;
                                    }
                                    
                                    if (isAMontrealOrLaval) return -1;
                                    if (isBMontrealOrLaval) return 1;
                                    
                                    const countA = getClientCount(cityDataA);
                                    const countB = getClientCount(cityDataB);
                                    return countB - countA;
                                  })
                                  .map(([city, cityData]) => {
                                    const cityKey = `${sector}-${city}`;
                                    const isExpanded = expandedCities.has(cityKey);
                                    const clientCount = getClientCount(cityData);
                                    const hasDistricts = cityData.districts && Object.keys(cityData.districts).length > 0;
                                    const isMontrealOrLaval = city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval';

                                    return (
                                      <div
                                        key={city}
                                        className="bg-gradient-to-br from-gray-900/80 to-gray-800/70 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden hover:border-indigo-500/40 transition-all duration-200 shadow-sm shadow-indigo-500/5"
                                      >
                                        <button
                                          onClick={() => toggleCity(cityKey)}
                                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-cyan-500/5 transition-all duration-200"
                                        >
                                          <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3 flex-1 min-w-0">
                                            {isExpanded ? (
                                              <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                                            )}
                                            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] flex-shrink-0" />
                                            <span className="text-sm sm:text-base md:text-lg lg:text-xl font-semibold text-gray-100 drop-shadow-[0_0_2px_rgba(139,92,246,0.3)] truncate">{city}</span>
                                            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/40 text-indigo-300 rounded text-xs sm:text-sm backdrop-blur-sm shadow-sm shadow-indigo-500/10 flex-shrink-0 ml-auto whitespace-nowrap">
                                              {clientCount} client{clientCount > 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </button>

                                        {isExpanded && (
                                          <div className="px-3 sm:px-4 pb-3 space-y-2 sm:space-y-3">
                                            {hasDistricts && isMontrealOrLaval ? (
                                              <div className="space-y-2">
                                                {Object.entries(cityData.districts!)
                                                  .sort(([districtA, clientsA], [districtB, clientsB]) => {
                                                    if (clientsA.length !== clientsB.length) {
                                                      return clientsB.length - clientsA.length;
                                                    }
                                                    return districtA.localeCompare(districtB);
                                                  })
                                                  .map(([district, clients]) => {
                                                    const districtKey = `${sector}-${city}-${district}`;
                                                    const isDistrictExpanded = expandedDistricts.has(districtKey);

                                                    return (
                                                      <div
                                                        key={district}
                                                        className="bg-gradient-to-br from-gray-900/70 to-gray-800/60 backdrop-blur-sm rounded border border-purple-500/20 hover:border-purple-500/40 transition-all duration-200 shadow-sm"
                                                      >
                                                        <button
                                                          onClick={() => toggleDistrict(sector, city, district)}
                                                          className="w-full px-2.5 sm:px-3 md:px-4 py-2 flex items-center justify-between hover:bg-gradient-to-r hover:from-purple-500/5 hover:to-pink-500/5 transition-all duration-200 rounded"
                                                        >
                                                          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                                            {isDistrictExpanded ? (
                                                              <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)] flex-shrink-0" />
                                                            ) : (
                                                              <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)] flex-shrink-0" />
                                                            )}
                                                            <Home className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)] flex-shrink-0" />
                                                            <span className="text-xs sm:text-sm md:text-base font-medium text-gray-200 drop-shadow-[0_0_2px_rgba(168,85,247,0.2)] truncate">{district}</span>
                                                            <span className="px-1.5 sm:px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10 flex-shrink-0 ml-auto whitespace-nowrap">
                                                              {clients.length} client{clients.length > 1 ? 's' : ''}
                                                            </span>
                                                          </div>
                                                        </button>

                                                        {isDistrictExpanded && (
                                                          <div className="px-2.5 sm:px-3 md:px-4 pb-2 sm:pb-3 space-y-1.5 sm:space-y-2">
                                                            {clients.map((client) => (
                                                  <div
                                                    key={client._id}
                                                    id={`client-${client._id}`}
                                                    className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                                      highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                                    }`}
                                                  >
                                                    <div className="flex flex-col gap-2">
                                                      <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                          <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                            {client.givenName} {client.familyName}
                                                          </h4>
                                                          <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                                            <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                                            <span className="break-words">{client.addressLine1}</span>
                                                          </p>
                                                          {client.phoneNumber && (
                                                            <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                                              <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0" />
                                                              <span className="break-all">{client.phoneNumber}</span>
                                                            </p>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {client.coordinates && (
                                                        <a
                                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="mt-1 w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20 text-center"
                                                        >
                                                          Voir carte
                                                        </a>
                                                      )}
                                                    </div>
                                                  </div>
                                                            ))}
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                {cityData.clients && Array.isArray(cityData.clients) ? (
                                                  cityData.clients.map((client) => (
                                                  <div
                                                    key={client._id}
                                                    id={`client-${client._id}`}
                                                    className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                                      highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                                    }`}
                                                  >
                                                    <div className="flex flex-col gap-2">
                                                      <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                          <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                            {client.givenName} {client.familyName}
                                                          </h4>
                                                          <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                                            <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                                            <span className="break-words">{client.addressLine1}</span>
                                                          </p>
                                                          {client.phoneNumber && (
                                                            <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                                              <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0" />
                                                              <span className="break-all">{client.phoneNumber}</span>
                                                            </p>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {client.coordinates && (
                                                        <a
                                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="mt-1 w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20 text-center"
                                                        >
                                                          Voir carte
                                                        </a>
                                                      )}
                                                    </div>
                                                  </div>
                                                  ))
                                                ) : (
                                                  <p className="text-gray-400 text-sm p-3">Aucun client disponible</p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            
            {/* Fallback vers l'ancienne structure si pas encore de données par secteur */}
            {Object.keys(clientsBySector).length === 0 && Object.entries(filterClientsData(clientsData, searchTerm))
              .sort(([cityA, cityDataA], [cityB, cityDataB]) => {
                const aLower = cityA.toLowerCase();
                const bLower = cityB.toLowerCase();
                const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
                const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
                
                if (isAMontrealOrLaval && isBMontrealOrLaval) {
                  if (aLower === 'montréal') return -1;
                  if (bLower === 'montréal') return 1;
                  const countA = getClientCount(cityDataA as CityData);
                  const countB = getClientCount(cityDataB as CityData);
                  return countB - countA;
                }
                if (isAMontrealOrLaval) return -1;
                if (isBMontrealOrLaval) return 1;
                const countA = getClientCount(cityDataA as CityData);
                const countB = getClientCount(cityDataB as CityData);
                return countB - countA;
              })
              .map(([city, cityData]) => {
              const typedCityData = cityData as CityData;
              const isExpanded = expandedCities.has(city);
              const clientCount = getClientCount(typedCityData);
              const hasDistricts = typedCityData.districts && Object.keys(typedCityData.districts).length > 0;
              const isMontrealOrLaval = city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval';

              return (
                <div
                  key={city}
                  className="bg-gradient-to-br from-gray-900/80 to-gray-800/70 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden hover:border-indigo-500/40 transition-all duration-200 shadow-sm shadow-indigo-500/5"
                >
                  <button
                    onClick={() => toggleCity(city)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-cyan-500/5 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                      )}
                      <MapPin className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                      <span className="text-xl font-semibold text-gray-100 drop-shadow-[0_0_2px_rgba(139,92,246,0.3)]">{city}</span>
                      <span className="px-2 py-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/40 text-indigo-300 rounded text-sm backdrop-blur-sm shadow-sm shadow-indigo-500/10">
                        {clientCount} client{clientCount > 1 ? 's' : ''}
                      </span>
                      {isMontrealOrLaval && hasDistricts && (
                        <span className="px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                          {Object.keys(typedCityData.districts!).length} quartier{Object.keys(typedCityData.districts!).length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-4 space-y-4">
                      {hasDistricts && isMontrealOrLaval ? (
                        <div className="space-y-3">
                          {Object.entries(typedCityData.districts!)
                            .sort(([, clientsA], [, clientsB]) => (clientsB as Client[]).length - (clientsA as Client[]).length)
                            .map(([district, clients]) => {
                            const districtKey = `${city}-${district}`;
                            const isDistrictExpanded = expandedDistricts.has(districtKey);
                            const typedClients = clients as Client[];

                            return (
                              <div
                                key={district}
                                className="bg-gradient-to-br from-gray-900/70 to-gray-800/60 backdrop-blur-sm rounded-lg border border-purple-500/20 overflow-hidden hover:border-purple-500/40 transition-all duration-200 shadow-sm"
                              >
                                <button
                                  onClick={() => toggleDistrict('', city, district)}
                                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-purple-500/5 hover:to-pink-500/5 transition-all duration-200"
                                >
                                  <div className="flex items-center gap-2">
                                    {isDistrictExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                    )}
                                    <Home className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                    <span className="font-medium text-gray-200 capitalize drop-shadow-[0_0_2px_rgba(168,85,247,0.2)]">{district}</span>
                                    <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                                      {typedClients.length} client{typedClients.length > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </button>

                                {isDistrictExpanded && (
                                  <div className="px-4 pb-3 space-y-2">
                                    {typedClients.map((client) => (
                                      <div
                                        key={client._id}
                                        id={`client-${client._id}`}
                                        className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                          highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                        }`}
                                      >
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <h4 className="font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                              {client.givenName} {client.familyName}
                                            </h4>
                                            <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                              <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                              {client.addressLine1}
                                            </p>
                                            {client.phoneNumber && (
                                              <p className="text-sm text-gray-400 flex items-center gap-1">
                                                <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                                {client.phoneNumber}
                                              </p>
                                            )}
                                          </div>
                                          {client.coordinates && (
                                            <a
                                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="ml-4 px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20"
                                            >
                                              Voir carte
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {typedCityData.clients && Array.isArray(typedCityData.clients) ? (
                            typedCityData.clients.map((client) => (
                            <div
                              key={client._id}
                              id={`client-${client._id}`}
                              className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                              }`}
                            >
                              <div className="flex flex-col gap-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                      {client.givenName} {client.familyName}
                                    </h4>
                                    <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                      <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                      <span className="break-words">{client.addressLine1}</span>
                                    </p>
                                    {client.phoneNumber && (
                                      <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                        <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0" />
                                        <span className="break-all">{client.phoneNumber}</span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {client.coordinates && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20 text-center"
                                  >
                                    Voir carte
                                  </a>
                                )}
                              </div>
                            </div>
                          ))
                          ) : (
                            <p className="text-gray-400 text-sm p-3">Aucun client disponible</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Spinner si aucune donnée encore */}
        {Object.keys(clientsData).length === 0 && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
              <p className="text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]">Chargement des clients...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm border border-rose-500/30 rounded-lg p-6 text-center shadow-lg shadow-rose-500/10">
        <p className="text-rose-400 mb-4 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)] font-semibold">{error}</p>
        <button
          onClick={fetchClientsByCityStream}
          className="px-4 py-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-200 rounded-md transition-all duration-200 border border-indigo-400/40 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 backdrop-blur-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 px-2 sm:px-4 md:px-0 pb-4">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg p-4 sm:p-5 md:p-6 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] mb-1.5 sm:mb-2 flex items-center gap-2">
                <div className="p-1.5 sm:p-2 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg border border-indigo-400/40 shadow-lg shadow-indigo-500/30 backdrop-blur-sm flex-shrink-0">
                  <Users className="h-4 w-4 sm:h-5 sm:h-6 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                </div>
                <span className="truncate">Clients par Ville</span>
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-gray-300 leading-relaxed">
                {searchTerm ? (
                  <>
                    <span className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)] font-semibold">{filteredClientCount}</span> client{filteredClientCount > 1 ? 's' : ''} trouvé{filteredClientCount > 1 ? 's' : ''} sur <span className="text-gray-300">{totalClients}</span> total
                  </>
                ) : (
                  <>
                    <span className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)] font-semibold">{totalClients}</span> client{totalClients > 1 ? 's' : ''} réparti{totalClients > 1 ? 's' : ''} sur <span className="text-gray-300">{Object.keys(clientsData).length}</span> ville{Object.keys(clientsData).length > 1 ? 's' : ''}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
                      hasInitializedRef.current = false;
                      loadFromAPI(true, newValue);
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
              
              <button
              onClick={() => {
                // Forcer un recalcul complet avec streaming (barre de progression)
                console.log('🔄 Recalcul complet du cache MongoDB by-city avec streaming...');
                
                // Supprimer le cache local pour forcer un rechargement complet
                localStorage.removeItem('clientsByCityLastUpdate');
                localStorage.removeItem('clientsByCityCache');
                localStorage.removeItem('clientsBySectorData');
                localStorage.removeItem('lastUpdate');
                
                // Réinitialiser les flags
                hasInitializedRef.current = false;
                
                // Réinitialiser les états
                setClientsBySector({});
                setClientsData({});
                setTotalClients(0);
                
                // Réinitialiser la progression
                setProgress({ processed: 0, total: 0, percentage: 0, currentClient: '', city: '', district: '', elapsed: '0s', estimated: '0s' });
                
                // Lancer le streaming qui va mettre à jour le cache MongoDB et afficher la progression
                fetchClientsByCityStream();
              }}
              disabled={loading}
              className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 disabled:from-gray-600/20 disabled:to-gray-600/20 disabled:cursor-not-allowed text-rose-200 rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 border border-rose-400/40 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 backdrop-blur-sm flex-shrink-0 text-xs sm:text-sm md:text-base"
              title="Recharger depuis MongoDB (route optimisée, pas d'appels API externes)"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 drop-shadow-[0_0_3px_rgba(244,63,94,0.8)] animate-spin" />
                  <span className="hidden sm:inline">Calcul...</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 drop-shadow-[0_0_3px_rgba(244,63,94,0.8)]" />
                  <span className="hidden sm:inline">Reboot</span>
                </>
              )}
              </button>
            </div>
          </div>

          {/* Barre de recherche */}
          <div className="relative" style={{ zIndex: 999999 }}>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] z-10 pointer-events-none" />
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
                className="w-full pl-9 sm:pl-11 pr-9 sm:pr-11 py-2.5 sm:py-3 bg-gray-900/60 border border-indigo-500/30 rounded-lg text-sm sm:text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/20 transition-all duration-200 relative z-10"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSearchSuggestions([]);
                    setShowSuggestions(false);
                    setHighlightedClientId(null);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-rose-400 transition-colors hover:drop-shadow-[0_0_4px_rgba(244,63,94,0.8)] p-1 z-20"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}
            </div>
            
            {/* Liste des suggestions - Utiliser Portal pour éviter les problèmes de z-index */}
            {showSuggestions && searchSuggestions.length > 0 && searchInputRef.current && createPortal(
              <div
                ref={suggestionsRef}
                className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-xl shadow-cyan-500/20 max-h-80 sm:max-h-96 overflow-y-auto"
                style={(() => {
                  if (searchInputRef.current) {
                    const rect = searchInputRef.current.getBoundingClientRect();
                    return {
                      position: 'fixed',
                      zIndex: 999999,
                      top: rect.bottom + 4,
                      left: rect.left,
                      width: rect.width,
                      minWidth: rect.width
                    };
                  }
                  return suggestionsStyle;
                })()}
              >
                {searchSuggestions.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border-b border-indigo-500/20 last:border-b-0 transition-all duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-semibold text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.4)] truncate">
                          {client.givenName} {client.familyName}
                        </div>
                        {client.phoneNumber && (
                          <div className="text-xs sm:text-sm text-gray-400 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.6)] flex-shrink-0" />
                            <span className="truncate">{client.phoneNumber}</span>
                          </div>
                        )}
                        {client.addressLine1 && (
                          <div className="text-xs sm:text-sm text-gray-400 truncate">{client.addressLine1}</div>
                        )}
                      </div>
                      {client.city && (
                        <div
                          className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium border backdrop-blur-sm flex-shrink-0 self-start sm:ml-2"
                          style={{
                            backgroundColor: 'rgba(139, 92, 246, 0.2)',
                            color: '#a78bfa',
                            borderColor: 'rgba(139, 92, 246, 0.5)',
                            boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)'
                          }}
                        >
                          {client.city}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>,
              document.body
            )}
            
            {searchTerm && searchSuggestions.length === 0 && searchInputRef.current && createPortal(
              <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm border border-rose-500/30 rounded-lg shadow-xl shadow-rose-500/20 p-4 text-center text-gray-400"
                   style={(() => {
                     if (searchInputRef.current) {
                       const rect = searchInputRef.current.getBoundingClientRect();
                       return {
                         position: 'fixed',
                         zIndex: 999999,
                         top: rect.bottom + 4,
                         left: rect.left,
                         width: rect.width,
                         minWidth: rect.width
                       };
                     }
                     return suggestionsStyle;
                   })()}>
                Aucun client trouvé
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* Liste des secteurs */}
      <div className="space-y-2 sm:space-y-3 md:space-y-4">
        {filteredClientsBySector && typeof filteredClientsBySector === 'object' && Object.keys(filteredClientsBySector).length > 0 ? (
          Object.entries(filteredClientsBySector)
            .sort(([sectorA, citiesA], [sectorB, citiesB]) => {
              // "Non assignés" toujours en dernier
              if (sectorA === 'Non assignés') return 1;
              if (sectorB === 'Non assignés') return -1;
              
              // Calculer le nombre de clients pour chaque secteur
              const getSectorClientCount = (sector: string, cities: any): number => {
                if (sector === 'Montréal' || sector === 'Laval') {
                  // La structure est { "Montréal": { districts: {...}, clients: [...] } } ou { "Laval": { districts: {...}, clients: [...] } }
                  const sectorData = cities[sector] || cities;
                  if (sectorData && typeof sectorData === 'object') {
                    let count = 0;
                    if (sectorData.districts && typeof sectorData.districts === 'object') {
                      count += Object.values(sectorData.districts).reduce((sum: number, district: any) => {
                        return sum + (Array.isArray(district) ? district.length : 0);
                      }, 0);
                    }
                    if (Array.isArray(sectorData.clients)) {
                      count += sectorData.clients.length;
                    }
                    return count;
                  }
                  return 0;
                }
                // Pour les autres secteurs, compter les clients dans toutes les villes
                if (typeof cities === 'object' && cities !== null) {
                  return Object.values(cities).reduce((sum: number, cityData: any) => {
                    if (cityData && typeof cityData === 'object') {
                      if ('districts' in cityData && cityData.districts) {
                        return sum + Object.values(cityData.districts).reduce((dSum: number, district: any) => {
                          return dSum + (Array.isArray(district) ? district.length : 0);
                        }, 0);
                      }
                      return sum + (Array.isArray(cityData.clients) ? cityData.clients.length : 0);
                    }
                    return sum;
                  }, 0);
                }
                return 0;
              };
              
              const countA = getSectorClientCount(sectorA, citiesA);
              const countB = getSectorClientCount(sectorB, citiesB);
              
              // Trier par nombre de clients (décroissant)
              return countB - countA;
          })
          .map(([sector, cities]) => {
              if (!cities || typeof cities !== 'object') {
                return null;
              }
            const isSectorExpanded = expandedSectors.has(sector);
            
            // Compter le total de clients dans le secteur
            let sectorClientCount = 0;
            let sectorCityCount = 0;
            
            // Pour Montréal et Laval, la structure est différente (districts directement)
            if (sector === 'Montréal' || sector === 'Laval') {
              // La structure est { "Montréal": { districts: {...}, clients: [...] } } ou { "Laval": { districts: {...}, clients: [...] } }
              const sectorData = cities[sector] || cities;
              if (sectorData && typeof sectorData === 'object') {
                if (sectorData.districts && Object.keys(sectorData.districts).length > 0) {
                  sectorClientCount += Object.values(sectorData.districts).reduce((sum: number, clients: Client[]) => sum + clients.length, 0);
                }
                if (sectorData.clients && Array.isArray(sectorData.clients)) {
                  sectorClientCount += sectorData.clients.length;
                }
              }
              sectorCityCount = 1; // Montréal ou Laval compte comme 1 ville
            } else if (sector === 'Non assignés') {
              // Pour "Non assignés", compter les catégories
              Object.values(cities as ClientsByCityData).forEach(cityData => {
                sectorCityCount++;
                sectorClientCount += cityData.clients?.length || 0;
              });
            } else {
              // Pour les autres secteurs, structure normale avec villes
              Object.values(cities as ClientsByCityData).forEach(cityData => {
                sectorCityCount++;
                if (cityData.districts && Object.keys(cityData.districts).length > 0) {
                  sectorClientCount += Object.values(cityData.districts).reduce((sum, clients) => sum + clients.length, 0);
                } else {
                  sectorClientCount += cityData.clients?.length || 0;
                }
              });
            }
            
            return (
              <div
                key={sector}
                className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden hover:border-indigo-500/40 transition-all duration-200 shadow-lg shadow-indigo-500/5 hover:shadow-indigo-500/10"
                style={{
                  borderLeftColor: sector === 'Non assignés' ? '#F59E0B50' : '#8B5CF650',
                  borderLeftWidth: '3px'
                }}
              >
                {/* En-tête du secteur */}
                <button
                  onClick={() => toggleSector(sector)}
                  className="w-full px-3 sm:px-4 md:px-6 py-3 sm:py-3.5 md:py-4 flex items-center gap-2 sm:gap-2.5 md:gap-3 hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-cyan-500/5 transition-all duration-200"
                >
                  {isSectorExpanded ? (
                    <ChevronDown className={`h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0 ${sector === 'Non assignés' ? 'text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]'}`} />
                  ) : (
                    <ChevronRight className={`h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0 ${sector === 'Non assignés' ? 'text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]'}`} />
                  )}
                  <Building className={`h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0 ${sector === 'Non assignés' ? 'text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]'}`} />
                  <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_4px_rgba(139,92,246,0.4)] flex-shrink-0 truncate">
                    {sector}
                  </span>
                  <span className={`px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded text-xs sm:text-sm font-semibold border backdrop-blur-sm flex-shrink-0 whitespace-nowrap ${
                    sector === 'Non assignés' 
                      ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-400/40 text-yellow-300 shadow-lg shadow-yellow-500/20' 
                      : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-400/40 text-indigo-300 shadow-lg shadow-indigo-500/20'
                  }`}>
                    {sectorClientCount} client{sectorClientCount > 1 ? 's' : ''}
                  </span>
                  {sector !== 'Non assignés' && (
                  <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10 hidden sm:inline flex-shrink-0">
                    {sectorCityCount} ville{sectorCityCount > 1 ? 's' : ''}
                  </span>
                  )}
                  {sector === 'Non assignés' && (
                    <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/40 text-yellow-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-yellow-500/10 hidden sm:inline flex-shrink-0">
                      {sectorCityCount} catégorie{sectorCityCount > 1 ? 's' : ''}
                    </span>
                  )}
                </button>

                {/* Contenu du secteur */}
                {isSectorExpanded && (
                  <div className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 space-y-2 sm:space-y-3 md:space-y-4 mt-2">
                    {/* Pour "Non assignés", afficher directement les catégories (pas de niveau ville) */}
                    {sector === 'Non assignés' ? (
                      <div className="space-y-2">
                        {Object.entries(cities as ClientsByCityData)
                          .sort(([, cityDataA], [, cityDataB]) => {
                            const countA = getClientCount(cityDataA);
                            const countB = getClientCount(cityDataB);
                            return countB - countA;
                          })
                          .map(([category, cityData]) => {
                            const categoryKey = `${sector}-${category}`;
                            const isExpanded = expandedCities.has(categoryKey);
                            const clientCount = getClientCount(cityData);

                            return (
                              <div
                                key={category}
                                className="bg-gradient-to-br from-gray-900/80 to-gray-800/70 backdrop-blur-sm rounded-lg border border-yellow-500/20 overflow-hidden hover:border-yellow-500/40 transition-all duration-200 shadow-sm shadow-yellow-500/5"
                              >
                                <button
                                  onClick={() => toggleCity(categoryKey)}
                                  className="w-full px-2.5 sm:px-3 md:px-4 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-yellow-500/5 hover:to-orange-500/5 transition-all duration-200"
                                >
                                  <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3 flex-1 min-w-0">
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)] flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)] flex-shrink-0" />
                                    )}
                                    <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)] flex-shrink-0" />
                                    <span className="text-sm sm:text-base md:text-lg lg:text-xl font-semibold text-gray-100 drop-shadow-[0_0_2px_rgba(245,158,11,0.3)] truncate">{category}</span>
                                    <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/40 text-yellow-300 rounded text-xs sm:text-sm backdrop-blur-sm shadow-sm shadow-yellow-500/10 flex-shrink-0 ml-auto whitespace-nowrap">
                                      {clientCount} client{clientCount > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="px-2.5 sm:px-3 md:px-4 pb-2 sm:pb-3 space-y-1.5 sm:space-y-2">
                                    {cityData.clients && Array.isArray(cityData.clients) ? (
                                      cityData.clients.map((client) => (
                                      <div
                                        key={client._id}
                                        id={`client-${client._id}`}
                                        className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-2.5 sm:p-3 border border-yellow-500/15 hover:border-yellow-500/30 transition-all duration-200 shadow-sm ${
                                          highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                        }`}
                                      >
                                        <div className="flex flex-col gap-2">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                              <h4 className="text-sm sm:text-base font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                {client.givenName} {client.familyName}
                                              </h4>
                                              {client.addressLine1 && (
                                                <p className="text-xs sm:text-sm text-gray-400 mb-1.5 flex items-start gap-1">
                                                  <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0 mt-0.5" />
                                                  <span className="break-words">{client.addressLine1}</span>
                                                </p>
                                              )}
                                              {client.phoneNumber && (
                                                <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1">
                                                  <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)] flex-shrink-0" />
                                                  <span className="break-all">{client.phoneNumber}</span>
                                                </p>
                                              )}
                                              {client.district && (
                                                <p className="text-xs sm:text-sm text-yellow-400 mt-1.5 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]">
                                                  {client.district}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                            {category === 'Adresse ambiguë' && (
                                              <button
                                                onClick={() => {
                                                  setEditingClient(client);
                                                  setCorrectedAddress(client.addressLine1 || '');
                                                }}
                                                className="px-2 sm:px-3 py-1.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 border border-yellow-400/40 text-yellow-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-yellow-500/10 hover:shadow-yellow-500/20 flex items-center justify-center gap-1 w-full sm:w-auto"
                                              >
                                                <Edit2 className="h-3 w-3 drop-shadow-[0_0_2px_rgba(245,158,11,0.6)]" />
                                                Corriger
                                              </button>
                                            )}
                                            {client.coordinates && client.addressLine1 && (
                                              <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-2 sm:px-3 py-1.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 border border-yellow-400/40 text-yellow-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-yellow-500/10 hover:shadow-yellow-500/20 w-full sm:w-auto text-center"
                                              >
                                                Voir carte
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                    ) : (
                                      <p className="text-gray-400 text-sm p-3">Aucun client disponible</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ) : (sector === 'Montréal' || sector === 'Laval') ? (() => {
                      const sectorData = (cities as any)[sector] || cities;
                      if (sectorData && typeof sectorData === 'object' && sectorData.districts && Object.keys(sectorData.districts).length > 0) {
                        return (
                      <div className="space-y-2">
                        {/* Afficher les districts */}
                        {Object.entries(sectorData.districts as Record<string, Client[]>)
                              .sort(([districtA, clientsA], [districtB, clientsB]) => {
                                if (clientsA.length !== clientsB.length) {
                                  return clientsB.length - clientsA.length;
                                }
                                return districtA.localeCompare(districtB);
                              })
                              .map(([district, clients]) => {
                                const districtKey = `${sector}-${sector}-${district}`;
                                const isDistrictExpanded = expandedDistricts.has(districtKey);

                                return (
                                  <div
                                    key={district}
                                    className="bg-gradient-to-br from-gray-900/70 to-gray-800/60 backdrop-blur-sm rounded border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm"
                                  >
                                    <button
                                      onClick={() => toggleDistrict(sector, sector, district)}
                                      className="w-full px-4 py-2 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-cyan-500/5 transition-all duration-200 rounded"
                                    >
                                      <div className="flex items-center gap-2">
                                        {isDistrictExpanded ? (
                                          <ChevronDown className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" />
                                        )}
                                        <Home className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" />
                                        <span className="font-medium text-gray-200 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">{district}</span>
                                        <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                                          {clients.length} client{clients.length > 1 ? 's' : ''}
                                        </span>
                                      </div>
                                    </button>

                                    {isDistrictExpanded && (
                                      <div className="px-4 pb-3 space-y-2">
                                        {clients.map((client: Client) => (
                                          <div
                                            key={client._id}
                                            id={`client-${client._id}`}
                                            className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                              highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                            }`}
                                          >
                                            <div className="flex items-start justify-between">
                                              <div className="flex-1">
                                                <h4 className="font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                                  {client.givenName} {client.familyName}
                                                </h4>
                                                <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                                  <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                                  {client.addressLine1}
                                                </p>
                                                {client.phoneNumber && (
                                                  <p className="text-sm text-gray-400 flex items-center gap-1">
                                                    <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                                    {client.phoneNumber}
                                                  </p>
                                                )}
                                              </div>
                                              {client.coordinates && (
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="sm:ml-4 px-2 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20 w-full sm:w-auto text-center"
                                                >
                                                  Voir carte
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                        
                        {/* Afficher les clients sans district */}
                        {sectorData.clients && Array.isArray(sectorData.clients) && sectorData.clients.length > 0 && (
                          <div className="bg-gradient-to-br from-gray-900/70 to-gray-800/60 backdrop-blur-sm rounded border border-indigo-500/15 shadow-sm">
                            <div className="px-4 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" />
                                <span className="font-medium text-gray-200 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">Sans quartier assigné</span>
                                <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                                  {sectorData.clients.length} client{sectorData.clients.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <div className="px-4 pb-3 space-y-2">
                              {sectorData.clients.map((client: Client) => (
                                <div
                                  key={client._id}
                                  id={`client-${client._id}`}
                                  className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                                    highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h4 className="font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                        {client.givenName} {client.familyName}
                                      </h4>
                                      <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                        <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                        {client.addressLine1}
                                      </p>
                                      {client.phoneNumber && (
                                        <p className="text-sm text-gray-400 flex items-center gap-1">
                                          <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                          {client.phoneNumber}
                                        </p>
                                      )}
                                    </div>
                                    {client.coordinates && (
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-4 px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20"
                                      >
                                        Voir carte
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                        );
                      }
                      return null;
                    })() : (
                      // Pour les autres secteurs, afficher les villes normalement
                      <div className="space-y-4">
                        {cities && typeof cities === 'object' && !('districts' in cities) ? (
                          Object.entries(cities as ClientsByCityData)
                      .sort(([cityA, cityDataA], [cityB, cityDataB]) => {
                              if (!cityDataA || !cityDataB) return 0;
                        const aLower = cityA.toLowerCase();
                        const bLower = cityB.toLowerCase();
                        const isAMontrealOrLaval = aLower === 'montréal' || aLower === 'laval';
                        const isBMontrealOrLaval = bLower === 'montréal' || bLower === 'laval';
                        
                        if (isAMontrealOrLaval && isBMontrealOrLaval) {
                          if (aLower === 'montréal') return -1;
                          if (bLower === 'montréal') return 1;
                          const countA = getClientCount(cityDataA);
                          const countB = getClientCount(cityDataB);
                          return countB - countA;
                        }
                        
                        if (isAMontrealOrLaval) return -1;
                        if (isBMontrealOrLaval) return 1;
                        
                        const countA = getClientCount(cityDataA);
                        const countB = getClientCount(cityDataB);
                        return countB - countA;
                      })
                      .map(([city, cityData]) => {
                              if (!cityData || typeof cityData !== 'object') {
                                return null;
                              }
                        const cityKey = `${sector}-${city}`;
                        const isExpanded = expandedCities.has(cityKey);
                        const clientCount = getClientCount(cityData);
                        const hasDistricts = cityData.districts && Object.keys(cityData.districts).length > 0;
                        const isMontrealOrLaval = city.toLowerCase() === 'montréal' || city.toLowerCase() === 'laval';

                        return (
                          <div
                            key={city}
                            className="bg-gradient-to-br from-gray-900/80 to-gray-800/70 backdrop-blur-sm rounded-lg border border-indigo-500/20 overflow-hidden hover:border-indigo-500/40 transition-all duration-200 shadow-sm shadow-indigo-500/5"
                          >
                            <button
                              onClick={() => toggleCity(cityKey)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-cyan-500/5 transition-all duration-200"
                            >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                  )}
                  <MapPin className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                  <span className="text-xl font-semibold text-gray-100 drop-shadow-[0_0_2px_rgba(139,92,246,0.3)]">{city}</span>
                  <span className="px-2 py-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/40 text-indigo-300 rounded text-sm backdrop-blur-sm shadow-sm shadow-indigo-500/10">
                    {clientCount} client{clientCount > 1 ? 's' : ''}
                  </span>
                  {isMontrealOrLaval && hasDistricts && (
                    <span className="px-2 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                      {Object.keys(cityData.districts!).length} quartier{Object.keys(cityData.districts!).length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>

                            {isExpanded && (
                              <div className="px-4 pb-3 space-y-3">
                  {hasDistricts && isMontrealOrLaval ? (
                    <div className="space-y-3">
                      {Object.entries(cityData.districts!)
                                          .sort(([districtA, clientsA], [districtB, clientsB]) => {
                                            if (clientsA.length !== clientsB.length) {
                                              return clientsB.length - clientsA.length;
                                            }
                                            return districtA.localeCompare(districtB);
                                          })
                        .map(([district, clients]) => {
                                            const districtKey = `${sector}-${city}-${district}`;
                        const isDistrictExpanded = expandedDistricts.has(districtKey);

                        return (
                          <div
                            key={district}
                            className="bg-gradient-to-br from-gray-900/70 to-gray-800/60 backdrop-blur-sm rounded-lg border border-purple-500/20 overflow-hidden hover:border-purple-500/40 transition-all duration-200 shadow-sm"
                          >
                            <button
                                                  onClick={() => toggleDistrict(sector, city, district)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-purple-500/5 hover:to-pink-500/5 transition-all duration-200"
                            >
                              <div className="flex items-center gap-2">
                                {isDistrictExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                )}
                                <Home className="h-4 w-4 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />
                                <span className="font-medium text-gray-200 capitalize drop-shadow-[0_0_2px_rgba(168,85,247,0.2)]">{district}</span>
                                <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 text-purple-300 rounded text-xs backdrop-blur-sm shadow-sm shadow-purple-500/10">
                                  {clients.length} client{clients.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </button>

                            {isDistrictExpanded && (
                              <div className="px-4 pb-3 space-y-2">
                                {clients.map((client) => (
                                  <div
                                    key={client._id}
                                    id={`client-${client._id}`}
                                    className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-3 border border-purple-500/15 hover:border-purple-500/30 transition-all duration-200 shadow-sm ${
                                      highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <h4 className="font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                          {client.givenName} {client.familyName}
                                        </h4>
                                        <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                          <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                          {client.addressLine1}
                                        </p>
                                        {client.phoneNumber && (
                                          <p className="text-sm text-gray-400 flex items-center gap-1">
                                            <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                            {client.phoneNumber}
                                          </p>
                                        )}
                                      </div>
                                      {client.coordinates && (
                                        <a
                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-4 px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20"
                                        >
                                          Voir carte
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                                        {cityData.clients && Array.isArray(cityData.clients) ? (
                                          cityData.clients.map((client) => (
                        <div
                          key={client._id}
                          id={`client-${client._id}`}
                          className={`bg-gradient-to-br from-gray-900/60 to-gray-800/50 backdrop-blur-sm rounded p-3 border border-indigo-500/15 hover:border-indigo-500/30 transition-all duration-200 shadow-sm ${
                            highlightedClientId === client._id ? 'ring-2 ring-cyan-400 ring-opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-100 mb-1 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                                {client.givenName} {client.familyName}
                              </h4>
                              <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                {client.addressLine1}
                              </p>
                              {client.phoneNumber && (
                                <p className="text-sm text-gray-400 flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_2px_rgba(34,211,238,0.4)]" />
                                  {client.phoneNumber}
                                </p>
                              )}
                            </div>
                            {client.coordinates && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.addressLine1)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-4 px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/40 text-indigo-300 rounded text-xs transition-all duration-200 backdrop-blur-sm shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20"
                              >
                                Voir carte
                              </a>
                            )}
                          </div>
                        </div>
                                        ))
                                        ) : (
                                          <p className="text-gray-400 text-sm p-3">Aucun client disponible</p>
                                        )}
                    </div>
                  )}
                </div>
                            )}
                          </div>
                        );
                            })
                            .filter(Boolean)
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })
            .filter(Boolean)
        ) : (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-cyan-400 mx-auto mb-4 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            <p className="text-gray-300 text-lg drop-shadow-[0_0_4px_rgba(139,92,246,0.3)]">Aucune donnée disponible</p>
          </div>
        )}
      </div>

      {Object.keys(clientsBySector).length === 0 && Object.keys(clientsData).length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-cyan-400 mx-auto mb-4 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
          <p className="text-gray-300 text-lg drop-shadow-[0_0_4px_rgba(139,92,246,0.3)]">Aucun client trouvé</p>
        </div>
      )}

      {/* Modal de correction d'adresse */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/90 backdrop-blur-md rounded-lg p-6 max-w-2xl w-full mx-4 border border-yellow-500/40 shadow-xl shadow-yellow-500/20">
            <h3 className="text-xl font-bold bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent mb-4 flex items-center gap-2 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]">
              <Edit2 className="h-5 w-5 text-yellow-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
              Corriger l'adresse ambiguë
            </h3>
            
            <div className="mb-4">
              <p className="text-gray-200 mb-2">
                <strong className="text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Client:</strong> <span className="text-gray-100">{editingClient.givenName} {editingClient.familyName}</span>
              </p>
              <p className="text-gray-400 text-sm mb-4">
                <strong className="text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]">Adresse actuelle:</strong> {editingClient.addressLine1}
              </p>
              {editingClient.district && (
                <p className="text-yellow-400 text-sm mb-4 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]">
                  <strong>Problème:</strong> {editingClient.district}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-gray-300 mb-2 drop-shadow-[0_0_2px_rgba(139,92,246,0.2)]">
                Nouvelle adresse complète (avec ville et code postal si possible):
              </label>
              <textarea
                value={correctedAddress}
                onChange={(e) => setCorrectedAddress(e.target.value)}
                placeholder="Ex: 123 rue Principale, Laval, QC H7X 1A1"
                className="w-full px-4 py-2 bg-gray-900/60 border border-yellow-500/30 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 focus:shadow-lg focus:shadow-yellow-500/20 transition-all duration-200"
                rows={3}
              />
              <p className="text-gray-400 text-xs mt-2">
                💡 Astuce: Inclure la ville et le code postal aide à déterminer le bon secteur.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setEditingClient(null);
                  setCorrectedAddress('');
                }}
                className="px-4 py-2 bg-gradient-to-r from-gray-700/20 to-gray-600/20 hover:from-gray-700/30 hover:to-gray-600/30 text-gray-300 rounded transition-all duration-200 border border-gray-500/40 backdrop-blur-sm shadow-sm"
                disabled={isFixing}
              >
                Annuler
              </button>
              <button
                onClick={handleFixAddress}
                disabled={isFixing || !correctedAddress.trim()}
                className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 border border-yellow-400/40 text-yellow-300 rounded transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30"
              >
                {isFixing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-300"></div>
                    Correction...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]" />
                    Corriger
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsByCity;

