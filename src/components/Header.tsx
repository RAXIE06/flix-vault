import React from 'react';
import { Film, Sparkles, Lock, Megaphone } from 'lucide-react';

interface HeaderProps {
  hasSecondaryMovies: boolean;
  onNavigate: (sectionId: string) => void;
  onOpenAdminAccess?: () => void;
  /** Optional announcement text. If not provided, defaults to welcome message. */
  announcementText?: string;
}

export const Header: React.FC<HeaderProps> = ({
  hasSecondaryMovies,
  onNavigate,
  onOpenAdminAccess,
  announcementText,
}) => {
  const defaultNotice =
    '📢 Welcome to FlixVault — Buy any movie for just ₹19! Instant Telegram delivery. Support: @Owner_helpbot';
  const notice = announcementText || defaultNotice;

  return (
    <>
      {/* ============================================================ */}
      {/* ANNOUNCEMENT MARQUEE — Top of the page                     */}
      {/* ============================================================ */}
      <div className="w-full bg-gradient-to-r from-purple-900 via-purple-700 to-purple-900 overflow-hidden border-b border-purple-500/30 relative">
        <div className="relative flex items-center h-9">
          <style>{`
            @keyframes flixvault-marquee {
              0% { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
            .flixvault-marquee-text {
              animation: flixvault-marquee 30s linear infinite;
              white-space: nowrap;
              display: inline-block;
              padding-left: 20px;
            }
            .flixvault-marquee-text:hover {
              animation-play-state: paused;
            }
          `}</style>

          <div className="absolute left-2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-purple-950/80 border border-purple-500/50 shadow-md">
            <Megaphone className="w-3 h-3 text-purple-200" />
          </div>

          <div className="flixvault-marquee-text text-xs sm:text-sm font-semibold text-white tracking-wide">
            {notice}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAIN HEADER                                                 */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 w-full bg-[#08070d]/95 backdrop-blur-md border-b border-purple-950/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            
            {/* FlixVault Logo */}
            <button
              onClick={() => onNavigate('featured-showcase')}
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-md py-1 cursor-pointer"
              aria-label="FlixVault Home"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-900 flex items-center justify-center shadow-md shadow-purple-950/60 ring-1 ring-purple-400/30 group-hover:scale-105 transition-transform duration-200">
                <Film className="w-4 h-4 text-purple-100" />
              </div>
              <span className="text-lg sm:text-xl font-bold tracking-tight text-white font-['Outfit']">
                Flix<span className="text-purple-400">Vault</span>
              </span>
            </button>

            {/* Minimal Navigation */}
            <div className="flex items-center gap-2.5 sm:gap-4 text-xs font-medium">
              <button
                onClick={() => onNavigate('featured-showcase')}
                className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Featured
              </button>
              {hasSecondaryMovies && (
                <button
                  onClick={() => onNavigate('secondary-collection')}
                  className="text-zinc-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  Collection
                </button>
              )}
              
              <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-purple-950/80 border border-purple-800/40 text-purple-300">
                <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                <span>4K MASTER</span>
              </span>

              {onOpenAdminAccess && (
                <button
                  onClick={onOpenAdminAccess}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-zinc-400 hover:text-purple-300 hover:bg-purple-950/40 border border-purple-950/40 hover:border-purple-800/60 transition-all cursor-pointer font-medium text-xs"
                  title="Open Admin Access Portal"
                  aria-label="Open Admin Access Portal"
                >
                  <Lock className="w-3 h-3 text-purple-400" />
                  <span>Admin</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </header>
    </>
  );
};
