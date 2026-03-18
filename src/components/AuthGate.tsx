import { useState, useEffect, FormEvent, ReactNode } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import logo_mauve from '../assets/logo_mauve.png';

// Identifiants valides — modifiez ici selon vos besoins
const VALID_CREDENTIALS: Record<string, string> = {
  admin: 'admin',
  massilo: 'massilo123',
};

interface AuthGateProps {
  children: ReactNode;
}

const AuthGate = ({ children }: AuthGateProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Vérifier l'authentification en cache au chargement
  useEffect(() => {
    const authData = localStorage.getItem('aquarius_auth');
    if (authData) {
      try {
        const { authenticated, timestamp } = JSON.parse(authData);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        if (authenticated && (now - timestamp) < oneDay) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('aquarius_auth');
        }
      } catch {
        localStorage.removeItem('aquarius_auth');
      }
    }
  }, []);

  // Empêcher le scroll pendant l'affichage de la page d'auth
  useEffect(() => {
    if (!isAuthenticated) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isAuthenticated]);

  const triggerShake = (message: string) => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      triggerShake('Veuillez saisir votre identifiant');
      return;
    }
    if (!password) {
      triggerShake('Veuillez saisir votre mot de passe');
      return;
    }

    setIsLoading(true);

    // Simulation d'un délai d'auth (peut être remplacé par un vrai appel API)
    setTimeout(() => {
      const storedPassword = VALID_CREDENTIALS[username.toLowerCase().trim()];
      if (storedPassword && storedPassword === password) {
        setIsLoading(false);
        setShowWelcome(true);
        setError('');
        setTimeout(() => {
          localStorage.setItem('aquarius_auth', JSON.stringify({
            authenticated: true,
            timestamp: Date.now(),
          }));
          setIsAuthenticated(true);
        }, 2500);
      } else {
        setIsLoading(false);
        triggerShake('Identifiant ou mot de passe incorrect');
        setPassword('');
      }
    }, 600);
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-950 to-gray-950 relative overflow-hidden">
      {/* Fond avec pattern SVG */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='pattern' width='100' height='100' patternUnits='userSpaceOnUse'%3E%3Cpath fill='%238B5CF6' fill-opacity='0.3' d='M50 0c27.6 0 50 22.4 50 50S77.6 100 50 100 0 77.6 0 50 22.4 0 50 0zm0 20c-16.6 0-30 13.4-30 30s13.4 30 30 30 30-13.4 30-30-13.4-30-30-30z'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23pattern)'/%3E%3C/svg%3E")`,
            backgroundSize: '100px 100px',
          }}
        />

        {/* Bulles animées néon */}
        <div className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-indigo-500/5 to-purple-500/5 blur-3xl -top-20 -left-20 animate-float" style={{ boxShadow: '0 0 80px rgba(139, 92, 246, 0.08)' }}></div>
        <div className="absolute w-96 h-96 rounded-full bg-gradient-to-br from-cyan-500/4 to-indigo-500/4 blur-3xl bottom-20 -right-40 animate-float-delay-1" style={{ boxShadow: '0 0 100px rgba(34, 211, 238, 0.06)' }}></div>
        <div className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-purple-500/5 to-pink-500/5 blur-3xl bottom-0 left-1/4 animate-float-delay-2" style={{ boxShadow: '0 0 90px rgba(168, 85, 247, 0.08)' }}></div>
        <div className="absolute w-72 h-72 rounded-full bg-gradient-to-br from-indigo-500/4 to-cyan-500/4 blur-3xl top-1/3 right-1/4 animate-float-delay-3" style={{ boxShadow: '0 0 70px rgba(139, 92, 246, 0.06)' }}></div>
      </div>

      {/* Carte de connexion */}
      <div className="relative z-10 w-full max-w-sm px-4 flex items-center justify-center -mt-20">
        <div
          className={`w-full bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-indigo-500/30 p-8 transition-all duration-300 ${shake ? 'animate-shake' : ''}`}
          style={{ boxShadow: '0 0 30px rgba(139, 92, 246, 0.15), 0 0 60px rgba(34, 211, 238, 0.1)' }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3 overflow-hidden bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/50 shadow-lg backdrop-blur-sm"
              style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.2)' }}
            >
              <img src={logo_mauve} alt="Logo Aquarius" className="w-full h-full object-contain p-1.5" />
            </div>
            <h1
              className="text-2xl font-bold mb-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent"
              style={{
                textShadow: '0 0 10px rgba(139, 92, 246, 0.8)',
                filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.6))',
              }}
            >
              Accès Sécurisé
            </h1>
            <p
              className="text-gray-400 text-xs"
              style={{ textShadow: '0 0 6px rgba(34, 211, 238, 0.5)' }}
            >
              Piscine Aquarius — Espace Pro
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Identifiant */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                autoComplete="username"
                autoFocus
                placeholder="Votre identifiant"
                className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-500
                  border border-indigo-500/30 outline-none
                  focus:border-indigo-400/70 focus:ring-1 focus:ring-indigo-400/40
                  transition-all duration-200"
                style={{
                  background: '#111827',
                  boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)',
                  colorScheme: 'dark',
                }}
              />
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm text-white placeholder-gray-500
                    border border-indigo-500/30 outline-none
                    focus:border-indigo-400/70 focus:ring-1 focus:ring-indigo-400/40
                    transition-all duration-200"
                  style={{
                    background: '#111827',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)',
                    colorScheme: 'dark',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-indigo-400 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="rounded-lg px-3 py-2 text-xs text-center animate-fade-in bg-gradient-to-br from-rose-900/40 to-pink-900/40 border border-rose-500/50 text-rose-300">
                {error}
              </div>
            )}

            {/* Bouton de connexion */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-2 rounded-lg
                text-sm font-semibold text-white tracking-wide
                bg-gradient-to-r from-indigo-600 to-purple-600
                hover:from-indigo-500 hover:to-purple-500
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-200 relative overflow-hidden"
              style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.35), 0 0 40px rgba(139, 92, 246, 0.15)' }}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vérification…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Se connecter
                </>
              )}
            </button>
          </form>

          {/* Séparateur déco */}
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" style={{ boxShadow: '0 0 8px rgba(139, 92, 246, 0.3)' }} />
        </div>
      </div>

      {/* Animation de bienvenue style Jarvis */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl">
          {/* Grille holographique */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.08]">
            <div className="absolute inset-0" style={{
              backgroundImage: `
                linear-gradient(rgba(34, 211, 238, 0.15) 1px, transparent 1px),
                linear-gradient(90deg, rgba(34, 211, 238, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}></div>
          </div>

          {/* Lignes qui s'ouvrent */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              style={{
                top: 'calc(50% - 100px)',
                animation: 'slideAndOpen 1s ease-out both',
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(34, 211, 238, 0.4)'
              }}
            ></div>
            <div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              style={{
                bottom: 'calc(50% - 100px)',
                animation: 'slideAndOpen 1s ease-out both',
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(34, 211, 238, 0.4)'
              }}
            ></div>
          </div>

          {/* Texte */}
          <div className="text-center relative z-10">
            <h2
              className="text-5xl md:text-6xl font-mono font-light text-cyan-300"
              style={{
                textShadow: '0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2)',
                animation: 'textReveal 0.8s ease-out 1.2s both, textGlowSubtle 3s ease-in-out infinite 2s',
                letterSpacing: '0.15em'
              }}
            >
              Welcome back BOSS
            </h2>
            <div className="mt-8 flex items-center justify-center gap-2 opacity-50">
              <div
                className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                style={{
                  animation: 'statusPulse 2s ease-in-out infinite 1.5s',
                  boxShadow: '0 0 6px rgba(34, 211, 238, 0.5)'
                }}
              ></div>
              <span className="text-xs font-mono text-cyan-400/60 tracking-wider">SYSTEM READY</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthGate;
