import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import ClientSearch from './components/ClientSearch';
import RouteOptimizer from './components/RouteOptimizer';
import RouteOptimizerSchedule from './components/RouteOptimizerSchedule';
import OptimisationRdvClient from './components/OptimisationRdvClient';
import DistrictTable from './components/DistrictTable';
import UnidentifiedClientsManager from './components/UnidentifiedClientsManager';
import { Menu, X, PenTool, Search, Map, Calendar, MapPin, LayoutGrid, Users } from 'lucide-react';
import 'leaflet/dist/leaflet.css'

// Vous devrez remplacer ceci par votre logo réel importé
const AquariusLogo = () => (
  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center overflow-hidden">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white">
      <path d="M19.071 19.071C23.976 14.165 23.976 6.003 19.071 1.098C14.165 -3.808 6.003 -3.808 1.098 1.098C-3.808 6.003 -3.808 14.165 1.098 19.071C6.003 23.976 14.165 23.976 19.071 19.071Z" fill="currentColor"/>
      <path d="M12 6.5C8.5 6.5 7 9 7 12C7 15 9 16.5 11 16.5C14 16.5 13.5 14 13.5 14H16C16 14 16.5 16.5 14 16.5C11.5 16.5 9.5 15 9.5 12C9.5 9 11 8.5 12 8.5C13 8.5 14 8.75 14 11H16C16 8.25 14.5 6.5 12 6.5Z" fill="#0d182d"/>
    </svg>
  </div>
);

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <Router>
      <div className="min-h-screen w-full bg-gray-900 relative overflow-hidden">
        {/* Éléments décoratifs d'arrière-plan */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Pattern en arrière-plan */}
          <div 
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='pattern' width='100' height='100' patternUnits='userSpaceOnUse'%3E%3Cpath fill='%236366F1' fill-opacity='0.3' d='M50 0c27.6 0 50 22.4 50 50S77.6 100 50 100 0 77.6 0 50 22.4 0 50 0zm0 20c-16.6 0-30 13.4-30 30s13.4 30 30 30 30-13.4 30-30-13.4-30-30-30z'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23pattern)'/%3E%3C/svg%3E")`,
              backgroundSize: "100px 100px"
            }}
          />
          
          {/* Bulles animées avec les couleurs du thème dark */}
          <div className="absolute w-64 h-64 rounded-full bg-indigo-900/10 -top-20 -left-20 animate-float"></div>
          <div className="absolute w-96 h-96 rounded-full bg-indigo-800/5 bottom-20 -right-40 animate-float-delay-1"></div>
          <div className="absolute w-80 h-80 rounded-full bg-purple-900/10 bottom-0 left-1/4 animate-float-delay-2"></div>
          <div className="absolute w-72 h-72 rounded-full bg-indigo-700/5 top-1/3 right-1/4 animate-float-delay-3"></div>
          <div className="absolute w-48 h-48 rounded-full bg-purple-800/5 top-3/4 left-10 animate-float-delay-4"></div>
        </div>

        {/* Header Élégant */}
        <header className="fixed top-0 left-0 right-0 z-50">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-indigo-950 to-gray-900 opacity-90"></div>
          
          {/* Contenu du header */}
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="flex items-center justify-between h-16 md:h-20">
              {/* Logo et nom */}
              <div className="flex items-center space-x-3">
                <AquariusLogo />
                <span className="text-xl font-bold text-white">Piscine Aquarius</span>
              </div>
              
              {/* Navigation Desktop */}
              <nav className="hidden md:flex items-center space-x-1 lg:space-x-3">
                <Link 
                  to="/client-search"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <Search className="h-4 w-4" />
                    <span>Recherche Client</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/route-optimizer"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <Map className="h-4 w-4" />
                    <span>Optimiseur Route</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/schedule"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>Planning</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/optimisation-rdv"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    <span>RDV Proche</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/district-table"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <LayoutGrid className="h-4 w-4" />
                    <span>Quartiers</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/UnidentifiedClientsManager"
                  className="text-gray-300 hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group"
                >
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>Villes</span>
                  </div>
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </nav>
              
              {/* Bouton RDV et menu mobile */}
              <div className="flex items-center space-x-3">
                <a
                  href="https://app.squareup.com/login"
                  className="hidden md:inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  <PenTool className="h-4 w-4 mr-1.5" />
                  RENDEZ-VOUS
                </a>
                
                {/* Mobile menu button */}
                <button
                  onClick={toggleMobileMenu}
                  className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none"
                >
                  {mobileMenuOpen ? (
                    <X className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
          
          {/* Mobile menu */}
          <div className={`md:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}>
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700">
              <Link
                to="/client-search"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <Search className="h-5 w-5" />
                <span>Recherche Client</span>
              </Link>
              <Link
                to="/route-optimizer"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <Map className="h-5 w-5" />
                <span>Optimiseur Route</span>
              </Link>
              <Link
                to="/schedule"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <Calendar className="h-5 w-5" />
                <span>Planning</span>
              </Link>
              <Link
                to="/optimisation-rdv"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <MapPin className="h-5 w-5" />
                <span>RDV Proche</span>
              </Link>
              <Link
                to="/district-table"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <LayoutGrid className="h-5 w-5" />
                <span>Quartiers</span>
              </Link>
              <Link
                to="/UnidentifiedClientsManager"
                className="text-gray-300 hover:text-white hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2"
                onClick={toggleMobileMenu}
              >
                <Users className="h-5 w-5" />
                <span>Villes</span>
              </Link>
              <a
                href="#"
                className="text-white bg-indigo-600 hover:bg-indigo-700 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2 mt-4"
              >
                <PenTool className="h-5 w-5" />
                <span>RENDEZ-VOUS</span>
              </a>
            </div>
          </div>
        </header>

        {/* Content Area avec spacing pour le header fixe */}
        <div className="container mx-auto py-4 px-4 relative z-10 mt-20">
          <Routes>
            <Route path="/" element={<Navigate to="/client-search" replace />} />
            <Route path="/client-search" element={<ClientSearch />} />
            <Route path="/route-optimizer" element={<RouteOptimizer />} />
            <Route path="/schedule" element={<RouteOptimizerSchedule />} />
            <Route path="/optimisation-rdv" element={<OptimisationRdvClient />} />
            <Route path="/district-table" element={<DistrictTable />} />
            <Route path="/UnidentifiedClientsManager" element={<UnidentifiedClientsManager />} />
          </Routes>
        </div>
      </div>

      {/* CSS pour les animations */}
      <style jsx="true">{`
        @keyframes float {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes float-delay-1 {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(20px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes float-delay-2 {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-15px) scale(1.03); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes float-delay-3 {
          0% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(25px) rotate(5deg); }
          100% { transform: translateY(0) rotate(0); }
        }

        @keyframes float-delay-4 {
          0% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-10px) rotate(-5deg); }
          100% { transform: translateY(0) rotate(0); }
        }

        .animate-float {
          animation: float 15s ease-in-out infinite;
        }

        .animate-float-delay-1 {
          animation: float-delay-1 18s ease-in-out infinite;
        }

        .animate-float-delay-2 {
          animation: float-delay-2 20s ease-in-out infinite;
        }

        .animate-float-delay-3 {
          animation: float-delay-3 17s ease-in-out infinite;
        }

        .animate-float-delay-4 {
          animation: float-delay-4 22s ease-in-out infinite;
        }
      `}</style>
    </Router>
  );
}

export default App;