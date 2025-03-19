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
      <div className="min-h-screen w-full bg-gray-900">
        {/* Navigation Bar */}
        <nav className="bg-gray-800 shadow-xl border-b border-gray-700">
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
            <div className="md:hidden bg-gray-800 border-t border-gray-700">
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
        <div className="container mx-auto py-4 px-4">
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
    </Router>
  );
}

export default App;