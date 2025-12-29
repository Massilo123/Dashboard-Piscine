import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import ClientSearch from './components/ClientSearch';
import RouteOptimizerSchedule from './components/RouteOptimizerSchedule';
import OptimisationRdvClient from './components/OptimisationRdvClient';
import ClientsByCity from './components/ClientsByCity';
import ClientsMap from './components/ClientsMap';
import Appointments from './components/Appointments';
import AppointmentNotification from './components/AppointmentNotification';
import AuthGate from './components/AuthGate';
import { Menu, X, Search, Calendar, MapPin, Building, Map, LogOut, Bell } from 'lucide-react';
import logo_mauve from './assets/logo_mauve.png';
import 'leaflet/dist/leaflet.css'

// Vous devrez remplacer ceci par votre logo réel importé
const AquariusLogo = () => (
  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/40 shadow-lg shadow-indigo-500/30 backdrop-blur-sm flex items-center justify-center overflow-hidden">
    <img src={logo_mauve} alt="Logo Aquarius" className="w-full h-full object-contain" />
  </div>
);

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('aquarius_auth');
    window.location.href = '/';
  };

  // Composant pour les liens de navigation avec style actif
  const NavLink = ({ to, children, icon: Icon }: { to: string; children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    
    return (
      <Link 
        to={to}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 relative group ${
          isActive 
            ? 'text-cyan-300' 
            : 'text-gray-300 hover:text-cyan-300'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Icon className={`h-4 w-4 ${isActive ? 'drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]' : 'group-hover:drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]'} transition-all`} />
          <span className={isActive ? 'drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]' : 'group-hover:drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]'}>
            {children}
          </span>
        </div>
        <span className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-300 shadow-[0_0_8px_rgba(34,211,238,0.6)] ${
          isActive ? 'w-full' : 'w-0 group-hover:w-full'
        }`}></span>
      </Link>
    );
  };

  // Composant pour le menu mobile
  const MobileMenu = ({ mobileMenuOpen, toggleMobileMenu }: { mobileMenuOpen: boolean; toggleMobileMenu: () => void }) => {
    const location = useLocation();
    
    const MobileNavLink = ({ to, children, icon: Icon }: { to: string; children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) => {
      const isActive = location.pathname === to;
      
      return (
        <Link
          to={to}
          className={`block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2 transition-all duration-200 border ${
            isActive
              ? 'text-cyan-300 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/30'
              : 'text-gray-300 hover:text-cyan-300 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border-transparent hover:border-cyan-500/30'
          }`}
          onClick={toggleMobileMenu}
        >
          <Icon className={`h-5 w-5 ${isActive ? 'drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]' : ''}`} />
          <span className={isActive ? 'drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]' : ''}>{children}</span>
        </Link>
      );
    };

    return (
      <div className={`md:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md border-t border-indigo-500/30 shadow-lg shadow-indigo-500/10">
          <MobileNavLink to="/client-search" icon={Search}>Recherche Client</MobileNavLink>
          <MobileNavLink to="/schedule" icon={Calendar}>Planning</MobileNavLink>
          <MobileNavLink to="/optimisation-rdv" icon={MapPin}>RDV Proche</MobileNavLink>
          <MobileNavLink to="/clients-by-city" icon={Building}>Clients par Ville</MobileNavLink>
          <MobileNavLink to="/clients-map" icon={Map}>Carte des Clients</MobileNavLink>
          <MobileNavLink to="/appointments" icon={Bell}>Rendez-vous</MobileNavLink>
          <button
            onClick={handleLogout}
            className="text-rose-200 bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 border border-rose-400/40 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 block px-3 py-2 rounded-md text-base font-medium flex items-center space-x-2 mt-2 transition-all duration-200 backdrop-blur-sm w-full"
          >
            <LogOut className="h-5 w-5 drop-shadow-[0_0_3px_rgba(244,63,94,0.8)]" />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <Router>
      <div className="min-h-screen w-full bg-gradient-to-br from-gray-950 via-gray-950 to-gray-950 relative overflow-hidden">
        {/* Éléments décoratifs d'arrière-plan */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Pattern en arrière-plan - très subtil */}
          <div 
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='pattern' width='100' height='100' patternUnits='userSpaceOnUse'%3E%3Cpath fill='%238B5CF6' fill-opacity='0.3' d='M50 0c27.6 0 50 22.4 50 50S77.6 100 50 100 0 77.6 0 50 22.4 0 50 0zm0 20c-16.6 0-30 13.4-30 30s13.4 30 30 30 30-13.4 30-30-13.4-30-30-30z'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23pattern)'/%3E%3C/svg%3E")`,
              backgroundSize: "100px 100px"
            }}
          />
          
          {/* Bulles animées avec effets néon très subtils */}
          <div className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-indigo-500/5 to-purple-500/5 blur-3xl -top-20 -left-20 animate-float" style={{ boxShadow: '0 0 80px rgba(139, 92, 246, 0.08)' }}></div>
          <div className="absolute w-96 h-96 rounded-full bg-gradient-to-br from-cyan-500/4 to-indigo-500/4 blur-3xl bottom-20 -right-40 animate-float-delay-1" style={{ boxShadow: '0 0 100px rgba(34, 211, 238, 0.06)' }}></div>
          <div className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-purple-500/5 to-pink-500/5 blur-3xl bottom-0 left-1/4 animate-float-delay-2" style={{ boxShadow: '0 0 90px rgba(168, 85, 247, 0.08)' }}></div>
          <div className="absolute w-72 h-72 rounded-full bg-gradient-to-br from-indigo-500/4 to-cyan-500/4 blur-3xl top-1/3 right-1/4 animate-float-delay-3" style={{ boxShadow: '0 0 70px rgba(139, 92, 246, 0.06)' }}></div>
          <div className="absolute w-48 h-48 rounded-full bg-gradient-to-br from-purple-500/4 to-indigo-500/4 blur-3xl top-3/4 left-10 animate-float-delay-4" style={{ boxShadow: '0 0 60px rgba(168, 85, 247, 0.06)' }}></div>
        </div>

        {/* Header Élégant */}
        <header className="fixed top-0 left-0 right-0 z-50">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/95 via-indigo-950/95 to-purple-950/95 backdrop-blur-md border-b border-indigo-500/30 shadow-lg shadow-indigo-500/10"></div>
          
          {/* Contenu du header */}
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="flex items-center justify-between h-16 md:h-20">
              {/* Logo et nom */}
              <div className="flex items-center space-x-3">
                <AquariusLogo />
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                  Piscine Aquarius
                </span>
              </div>
              
              {/* Navigation Desktop */}
              <nav className="hidden md:flex items-center space-x-1 lg:space-x-3">
                <NavLink to="/client-search" icon={Search}>Recherche Client</NavLink>
                <NavLink to="/schedule" icon={Calendar}>Planning</NavLink>
                <NavLink to="/optimisation-rdv" icon={MapPin}>RDV Proche</NavLink>
                <NavLink to="/clients-by-city" icon={Building}>Clients par Ville</NavLink>
                <NavLink to="/clients-map" icon={Map}>Carte des Clients</NavLink>
                <NavLink to="/appointments" icon={Bell}>Rendez-vous</NavLink>
              </nav>
              
              {/* Bouton RDV et menu mobile */}
              <div className="flex items-center space-x-3">
                <AppointmentNotification />
                
                <button
                  onClick={handleLogout}
                  className="hidden md:inline-flex items-center justify-center px-3 py-2 bg-gradient-to-r from-rose-500/20 to-pink-500/20 hover:from-rose-500/30 hover:to-pink-500/30 text-rose-200 rounded-md text-sm font-medium border border-rose-400/40 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm"
                  title="Déconnexion"
                >
                  <LogOut className="h-4 w-4 drop-shadow-[0_0_3px_rgba(244,63,94,0.8)]" />
                </button>
                
                {/* Mobile menu button */}
                <button
                  onClick={toggleMobileMenu}
                  className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-cyan-300 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-indigo-500/10 border border-transparent hover:border-cyan-500/30 transition-all duration-200"
                >
                  {mobileMenuOpen ? (
                    <X className="block h-6 w-6 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
          
          {/* Mobile menu */}
          <MobileMenu mobileMenuOpen={mobileMenuOpen} toggleMobileMenu={toggleMobileMenu} />
        </header>

        {/* Content Area avec spacing pour le header fixe */}
        <div className="container mx-auto py-4 px-4 relative z-10 mt-20">
          <AuthGate>
            <Routes>
              <Route path="/" element={<Navigate to="/schedule" replace />} />
              <Route path="/client-search" element={<ClientSearch />} />
              <Route path="/schedule" element={<RouteOptimizerSchedule />} />
              <Route path="/optimisation-rdv" element={<OptimisationRdvClient />} />
              <Route path="/clients-by-city" element={<ClientsByCity />} />
              <Route path="/clients-map" element={<ClientsMap />} />
              <Route path="/appointments" element={<Appointments />} />
            </Routes>
          </AuthGate>
        </div>
      </div>

      {/* CSS pour les animations */}
      <style>{`
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