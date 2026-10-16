import React, { useEffect, useState } from 'react';
import { Film } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
  minDurationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 2200,
}) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), minDurationMs - 500);
    const finishTimer = setTimeout(onFinish, minDurationMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [minDurationMs, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[99999] bg-[#08070d] flex flex-col items-center justify-center transition-opacity duration-500 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient purple glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Logo + Brand */}
      <div className="relative flex flex-col items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-900 flex items-center justify-center shadow-2xl shadow-purple-950/80 ring-2 ring-purple-400/30 animate-pulse">
          <Film className="w-10 h-10 text-purple-100" />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white font-['Outfit']">
            Flix<span className="text-purple-400">Vault</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-zinc-400 font-mono tracking-[0.3em] uppercase">
            Premium Digital Cinema
          </p>
        </div>

        {/* Loading dots */}
        <div className="pt-4 flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>

      {/* Bottom tagline */}
      <div className="absolute bottom-8 text-center text-[10px] text-zinc-600 font-mono">
        Powered by FlixVault · v2.0
      </div>
    </div>
  );
};
