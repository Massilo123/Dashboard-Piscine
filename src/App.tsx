import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import ClientSearch from './components/ClientSearch';
import RouteOptimizer from './components/RouteOptimizer';
import RouteOptimizerSchedule from './components/RouteOptimizerSchedule';
import OptimisationRdvClient from './components/OptimisationRdvClient';
import DistrictTable from './components/DistrictTable';
import UnidentifiedClientsManager from './components/UnidentifiedClientsManager';
import { Menu, X } from 'lucide-react';

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

        {/* Navigation Bar */}
        <nav className="bg-gray-800/80 shadow-xl border-b border-gray-700 backdrop-blur-sm relative z-10">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              {/* Logo/Title - Hidden on mobile */}
              <div className="hidden md:block">
                <span className="text-indigo-400 font-bold">Piscine Aquarius</span>
              </div>

              {/* Mobile menu button */}
              <button
                className="md:hidden flex items-center p-2 rounded-md text-gray-300 hover:text-indigo-400 focus:outline-none"
                onClick={toggleMobileMenu}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>

              {/* Desktop Navigation */}
              <div className="hidden md:flex md:space-x-2 lg:space-x-4">
                <Link 
                  to="/client-search"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Recherche Client
                </Link>
                <Link 
                  to="/route-optimizer"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Optimiseur Route
                </Link>
                <Link 
                  to="/schedule"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Planning
                </Link>
                <Link 
                  to="/optimisation-rdv"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  RDV Proche
                </Link>
                <Link 
                  to="/district-table"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Quartiers
                </Link>
                <Link 
                  to="/UnidentifiedClientsManager"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Villes
                </Link>
              </div>
            </div>
          </div>

          {/* Mobile menu, show/hide based on menu state */}
          {mobileMenuOpen && (
            <div className="md:hidden bg-gray-800/90 backdrop-blur-sm border-t border-gray-700">
              <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                <Link 
                  to="/client-search"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  Recherche Client
                </Link>
                <Link 
                  to="/route-optimizer"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  Optimiseur Route
                </Link>
                <Link 
                  to="/schedule"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  Planning
                </Link>
                <Link 
                  to="/optimisation-rdv"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  RDV Proche
                </Link>
                <Link 
                  to="/district-table"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  Quartiers
                </Link>
                <Link 
                  to="/UnidentifiedClientsManager"
                  className="text-gray-300 hover:text-indigo-400 hover:bg-gray-700 block px-3 py-2 rounded-md text-base font-medium transition-colors"
                  onClick={toggleMobileMenu}
                >
                  Villes
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* Content Area */}
        <div className="container mx-auto py-4 px-4 relative z-10">
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