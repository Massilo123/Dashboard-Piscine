import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import logo_mauve from '../assets/logo_mauve.png';

const SECRET_PATTERN = [0, 1, 2, 4, 6];

interface AuthGateProps {
  children: ReactNode;
}

const AuthGate = ({ children }: AuthGateProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pointRadius = 18;
  const spacing = 85;
  const canvasSize = 250;
  // Centrer la grille 3x3 dans le canvas
  // Largeur de la grille = 2 * spacing = 170
  // Position de départ pour centrer = (canvasSize - 2*spacing) / 2
  const startX = (canvasSize - spacing * 2) / 2;
  const startY = (canvasSize - spacing * 2) / 2;

  const points = useMemo(() => [
    { x: startX, y: startY },
    { x: startX + spacing, y: startY },
    { x: startX + spacing * 2, y: startY },
    { x: startX, y: startY + spacing },
    { x: startX + spacing, y: startY + spacing },
    { x: startX + spacing * 2, y: startY + spacing },
    { x: startX, y: startY + spacing * 2 },
    { x: startX + spacing, y: startY + spacing * 2 },
    { x: startX + spacing * 2, y: startY + spacing * 2 },
  ], [startX, startY, spacing]);

  // Vérifier l'authentification au chargement
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

  // Empêcher le scroll quand la page d'authentification est affichée
  useEffect(() => {
    if (!isAuthenticated) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isAuthenticated]);

  const drawPattern = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines connecting selected points
    if (selectedPoints.length > 1) {
      ctx.strokeStyle = error ? '#ef4444' : '#22d3ee';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 15;
      ctx.shadowColor = error ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 211, 238, 0.9)';

      for (let i = 0; i < selectedPoints.length - 1; i++) {
        const from = points[selectedPoints[i]];
        const to = points[selectedPoints[i + 1]];
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    // Draw points
    points.forEach((point, index) => {
      const isSelected = selectedPoints.includes(index);
      const isActive = selectedPoints[selectedPoints.length - 1] === index;

      // Outer glow
      if (isSelected) {
        const gradient = ctx.createRadialGradient(
          point.x, point.y, pointRadius,
          point.x, point.y, pointRadius + 20
        );
        gradient.addColorStop(0, error ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 211, 238, 0.7)');
        gradient.addColorStop(0.5, error ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 211, 238, 0.3)');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius + 20, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Léger glow pour les points non sélectionnés
        const gradient = ctx.createRadialGradient(
          point.x, point.y, pointRadius,
          point.x, point.y, pointRadius + 10
        );
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius + 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Point circle
      ctx.fillStyle = isSelected
        ? (error ? '#ef4444' : '#22d3ee')
        : 'rgba(139, 92, 246, 0.4)';
      ctx.strokeStyle = isSelected
        ? (error ? '#f87171' : '#67e8f9')
        : 'rgba(139, 92, 246, 0.6)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = isSelected ? 20 : 8;
      ctx.shadowColor = isSelected
        ? (error ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 211, 238, 0.9)')
        : 'rgba(139, 92, 246, 0.4)';

      ctx.beginPath();
      ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot for selected points
      if (isSelected) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulse animation for active point
      if (isActive && isDrawing) {
        ctx.strokeStyle = error ? '#f87171' : '#67e8f9';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 25;
        ctx.shadowColor = error ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 211, 238, 0.8)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, [selectedPoints, error, isDrawing, points, pointRadius]);

  useEffect(() => {
    drawPattern();
  }, [drawPattern]);

  const getPointAt = (x: number, y: number): number | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const scaleX = 250 / rect.width;
    const scaleY = 250 / rect.height;
    const canvasX = (x - rect.left) * scaleX;
    const canvasY = (y - rect.top) * scaleY;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const distance = Math.sqrt(
        Math.pow(canvasX - point.x, 2) + Math.pow(canvasY - point.y, 2)
      );
      if (distance <= pointRadius) {
        return i;
      }
    }
    return null;
  };

  const handleStart = (x: number, y: number) => {
    const pointIndex = getPointAt(x, y);
    if (pointIndex !== null) {
      setSelectedPoints([pointIndex]);
      setIsDrawing(true);
      setError('');
    }
  };

  const handleMove = (x: number, y: number) => {
    if (!isDrawing) return;

    const pointIndex = getPointAt(x, y);
    if (pointIndex !== null && !selectedPoints.includes(pointIndex)) {
      setSelectedPoints([...selectedPoints, pointIndex]);
    }
  };

  const handleEnd = () => {
    setIsDrawing(false);

    // Vérifier le pattern
    if (selectedPoints.length === SECRET_PATTERN.length) {
      const isCorrect = selectedPoints.every(
        (point, index) => point === SECRET_PATTERN[index]
      );

      if (isCorrect) {
        // Afficher le message de bienvenue
        setShowWelcome(true);
        setError('');
        setSelectedPoints([]);
        
        // Après l'animation, authentifier et rediriger
        setTimeout(() => {
          localStorage.setItem('aquarius_auth', JSON.stringify({
            authenticated: true,
            timestamp: Date.now()
          }));
          setIsAuthenticated(true);
        }, 2500); // Durée de l'animation
      } else {
        setError('Pattern incorrect');
        setShake(true);
        setTimeout(() => {
          setShake(false);
          setSelectedPoints([]);
        }, 1000);
      }
    } else if (selectedPoints.length > 0) {
      setError('Pattern incomplet');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setSelectedPoints([]);
      }, 1000);
    }
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleEnd();
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

      {/* Interface principale style Jarvis */}
      <div className="relative z-10 w-full max-w-md px-4 flex items-center justify-center -mt-16">
        <div 
          className={`relative bg-gradient-to-br from-gray-900/90 to-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl shadow-indigo-500/20 border border-indigo-500/30 p-4 sm:p-6 transition-all duration-300 mx-auto ${shake ? 'animate-shake' : ''}`}
          style={{ boxShadow: '0 0 30px rgba(139, 92, 246, 0.15), 0 0 60px rgba(34, 211, 238, 0.1)' }}
        >
            {/* Header avec logo et titre */}
            <div className="text-center mb-4">
              {/* Logo */}
              <div 
                className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full mb-2 overflow-hidden bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/50 shadow-lg shadow-indigo-500/40 backdrop-blur-sm"
                style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.2)' }}
              >
                <img 
                  src={logo_mauve} 
                  alt="Logo Aquarius" 
                  className="w-full h-full object-contain p-1.5"
                />
              </div>

              {/* Titre */}
              <h1 
                className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent"
                style={{ 
                  textShadow: '0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.5), 0 0 30px rgba(34, 211, 238, 0.4)',
                  filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.6))'
                }}
              >
                Accès Sécurisé
              </h1>

              {/* Sous-titre */}
              <p 
                className="text-gray-300 text-[10px] sm:text-xs mt-1"
                style={{ textShadow: '0 0 6px rgba(34, 211, 238, 0.6), 0 0 12px rgba(34, 211, 238, 0.3)' }}
              >
                Dessinez le pattern secret pour accéder
              </p>
            </div>

            {/* Container du pattern lock */}
            <div className="relative mb-3">
              <div
                ref={containerRef}
                className="relative rounded-lg p-3 sm:p-4 flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-gray-900/95 to-gray-800/85 backdrop-blur-sm border border-cyan-500/40"
                style={{ 
                  touchAction: 'none', 
                  userSelect: 'none'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <canvas
                  ref={canvasRef}
                  width={250}
                  height={250}
                  className="cursor-pointer"
                  style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </div>

            {/* Séparateur */}
            <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent my-3" style={{ boxShadow: '0 0 8px rgba(139, 92, 246, 0.4)' }}></div>

            {/* Message d'erreur */}
            {error && (
              <div 
                className="rounded-lg p-2 text-[10px] sm:text-xs text-center animate-fade-in mb-2 bg-gradient-to-br from-rose-900/40 to-pink-900/40 backdrop-blur-sm border border-rose-500/50 shadow-lg shadow-rose-500/20 text-rose-300"
              >
                {error}
              </div>
            )}

            {/* Indice visuel */}
            <div className="text-center">
              <p 
                className="text-gray-400 text-[10px] sm:text-xs flex items-center justify-center gap-1.5"
                style={{ textShadow: '0 0 6px rgba(34, 211, 238, 0.6), 0 0 12px rgba(34, 211, 238, 0.3)' }}
              >
                <Sparkles 
                  className="h-3 w-3 text-cyan-400 animate-pulse"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(34, 211, 238, 0.9)) drop-shadow(0 0 8px rgba(34, 211, 238, 0.5))' }}
                />
                Dessinez le pattern en connectant les points
              </p>
            </div>
          </div>
      </div>

      {/* Message de bienvenue avec animation */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl">
          {/* Vagues de lumière qui se propagent */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full"
                style={{
                  border: `2px solid rgba(34, 211, 238, ${0.3 - i * 0.1})`,
                  animation: `waveExpand ${2 + i * 0.5}s ease-out ${i * 0.3}s`,
                  left: '50%',
                  top: '50%',
                  width: '0',
                  height: '0',
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%'
                }}
              />
            ))}
          </div>

          {/* Explosion de particules au début */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(50)].map((_, i) => {
              const angle = (i / 50) * Math.PI * 2;
              const distance = 200;
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance;
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: '4px',
                    height: '4px',
                    left: '50%',
                    top: '50%',
                    background: `radial-gradient(circle, rgba(34, 211, 238, 1) 0%, rgba(139, 92, 246, 0.8) 50%, transparent 100%)`,
                    animation: `particleExplode 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${i * 0.02}s`,
                    boxShadow: '0 0 12px rgba(34, 211, 238, 1), 0 0 24px rgba(139, 92, 246, 0.8)',
                    transform: 'translate(-50%, -50%)',
                    '--particle-x': `${x}px`,
                    '--particle-y': `${y}px`
                  } as React.CSSProperties}
                />
              );
            })}
          </div>

          {/* Halo lumineux qui pulse */}
          <div className="absolute inset-0 -m-40 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(34, 211, 238, 0.25) 0%, rgba(139, 92, 246, 0.15) 30%, transparent 70%)',
                animation: 'haloPulseSmooth 2.5s ease-in-out infinite',
                filter: 'blur(80px)'
              }}
            ></div>
          </div>

          {/* Texte principal avec effet holographique */}
          <div className="text-center relative z-10">
            <h2 
              className="text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent relative"
              style={{
                textShadow: '0 0 60px rgba(34, 211, 238, 0.8), 0 0 120px rgba(139, 92, 246, 0.6), 0 0 180px rgba(168, 85, 247, 0.4)',
                animation: 'textMaterialize 1.5s cubic-bezier(0.34, 1.56, 0.64, 1), textGlowPulse 2.5s ease-in-out infinite 1.5s',
                letterSpacing: '0.1em',
                filter: 'drop-shadow(0 0 20px rgba(34, 211, 238, 0.6))'
              }}
            >
              Welcome back BOSS
            </h2>

            {/* Effet de scan line qui traverse */}
            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80"
              style={{
                top: '50%',
                transform: 'translateY(-50%)',
                animation: 'scanLineSmooth 2s ease-in-out infinite 1.5s',
                boxShadow: '0 0 30px rgba(34, 211, 238, 1), 0 0 60px rgba(34, 211, 238, 0.6)'
              }}
            ></div>

            {/* Particules qui tournent autour */}
            <div className="absolute inset-0 -m-32 pointer-events-none overflow-hidden">
              {[...Array(20)].map((_, i) => {
                const angle = (i / 20) * Math.PI * 2;
                const radius = 180;
                return (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: '5px',
                      height: '5px',
                      left: '50%',
                      top: '50%',
                      background: `radial-gradient(circle, rgba(34, 211, 238, 1) 0%, rgba(139, 92, 246, 0.6) 50%, transparent 100%)`,
                      animation: `orbitParticle 8s linear infinite`,
                      animationDelay: `${i * 0.4}s`,
                      boxShadow: '0 0 15px rgba(34, 211, 238, 1), 0 0 30px rgba(139, 92, 246, 0.6)',
                      transform: `translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`,
                      '--orbit-angle': `${angle}rad`,
                      '--orbit-radius': `${radius}px`
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthGate;

