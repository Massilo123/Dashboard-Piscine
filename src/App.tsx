import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import ClientSearch from './components/ClientSearch';
import RouteOptimizer from './components/RouteOptimizer';
import RouteOptimizerSchedule from './components/RouteOptimizerSchedule';
import DistrictTable from './components/DistrictTable';
import UnidentifiedClientsManager from './components/UnidentifiedClientsManager';

function App() {
  return (
    <Router>
      <div className="min-h-screen w-full bg-gray-100">
        {/* Navigation Bar */}
        <nav className="bg-white shadow-lg">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div className="flex space-x-8">
                <Link 
                  to="/client-search"
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Recherche Client Proche
                </Link>
                <Link 
                  to="/route-optimizer"
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Optimiseur de Route
                </Link>
                <Link 
                  to="/schedule"
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Planning
                </Link>
                <Link 
                    to="/district-table"
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                    Tableau des Quartiers
                </Link>
                <Link 
                    to="/UnidentifiedClientsManager"
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                    Gestion ville clients
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <div className="container mx-auto py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/client-search" replace />} />
            <Route path="/client-search" element={<ClientSearch />} />
            <Route path="/route-optimizer" element={<RouteOptimizer />} />
            <Route path="/schedule" element={<RouteOptimizerSchedule />} />
            <Route path="/district-table" element={<DistrictTable />} />
            <Route path="/UnidentifiedClientsManager" element={<UnidentifiedClientsManager />} />
            <Route path="/" element={<ClientSearch />} /> {/* Default route */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;