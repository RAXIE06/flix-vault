import React, { useState } from 'react';
import { Send, ShieldAlert, KeyRound, Radio, ExternalLink, Check, Lock, Edit3 } from 'lucide-react';
import { Movie, TelegramConfig } from '../../types';

interface TelegramConfigSectionProps {
  movies: Movie[];
  config: TelegramConfig;
  onUpdateConfig: (updated: Partial<TelegramConfig>) => void;
  onUpdateMovieChannel: (movieId: string, channelId: string) => void;
}

export const TelegramConfigSection: React.FC<TelegramConfigSectionProps> = ({
  movies,
  config,
  onUpdateConfig,
  onUpdateMovieChannel,
}) => {
  const [botUsername, setBotUsername] = useState(config.botUsername);
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [channelDraft, setChannelDraft] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSaveBotSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({ botUsername });
    setSavedNotice('Telegram bot configuration draft updated. (Pending Phase 2B server integration)');
  };

  const handleStartEditChannel = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setChannelDraft(movie.telegramChannelId || '@flixvault_vip_channel');
  };

  const handleSaveChannel = (movieId: string) => {
    onUpdateMovieChannel(movieId, channelDraft.trim());
    setEditingMovieId(null);
    setSavedNotice('Movie delivery channel updated in session memory.');
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* Notice Banner */}
      {savedNotice && (
        <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-700/60 text-xs text-purple-200 flex items-center justify-between animate-in fade-in">
          <span>{savedNotice}</span>
          <button
            onClick={() => setSavedNotice(null)}
            className="text-zinc-400 hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Warning Notice */}
      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <strong className="text-amber-300 font-semibold block text-sm">
            Telegram Integration Scope &amp; Security Boundary
          </strong>
          <p className="text-amber-200/90 leading-relaxed">
            Telegram Bot Tokens grant administrative control over channels and must <strong>never</strong> be placed in frontend code. In Phase 2B, tokens will be secured strictly on the Node.js backend using environment variables (<code>TELEGRAM_BOT_TOKEN</code>). This UI configures delivery channel associations in preparation for that release.
          </p>
        </div>
      </div>

      {/* Telegram Bot Parameters Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-5">
        <div className="flex items-center justify-between border-b border-purple-950/50 pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-white text-base font-['Outfit']">
              Telegram Delivery Bot Configuration
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-purple-950/80 border border-purple-800/40 text-purple-300 font-semibold">
            {config.webhookStatus}
          </span>
        </div>

        <form onSubmit={handleSaveBotSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Telegram Bot Username
              </label>
              <input
                type="text"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                placeholder="@FlixVaultDeliveryBot"
                className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white font-mono placeholder-zinc-500 focus:outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                The bot that will add paid buyers to VIP channels.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
                <span>Bot Token (Server-Only Secret)</span>
                <span className="text-[10px] text-amber-400 font-normal">Protected</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  disabled
                  value="••••••••••••••••••••••••••••••••••••••••"
                  className="w-full px-3.5 py-2.5 bg-[#140f24]/60 border border-purple-950/70 rounded-xl text-xs sm:text-sm text-zinc-500 font-mono select-none cursor-not-allowed"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                  <Lock className="w-3 h-3 text-purple-400" />
                  <span>ENV Var</span>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Stored in server-side <code>.env</code> file (not accessible in browser).
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Update Bot Username
            </button>
          </div>
        </form>
      </div>

      {/* Per-Movie Channel Mapping Table */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
        <div>
          <h3 className="font-bold text-white text-base font-['Outfit']">
            Per-Movie VIP Delivery Channels
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Each movie is linked to an exclusive private Telegram channel. Upon payment verification, single-use invite links will grant buyers access.
          </p>
        </div>

        <div className="divide-y divide-purple-950/40 border border-purple-950/50 rounded-xl overflow-hidden bg-[#120d20]">
          {movies.map((movie) => {
            const isEditing = editingMovieId === movie.id;

            return (
              <div
                key={movie.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span>{movie.title}</span>
                    <span className="text-zinc-500 font-mono text-[11px]">{movie.priceSample}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Resolution: <span className="text-purple-300 font-mono">{movie.resolution}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isEditing ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        value={channelDraft}
                        onChange={(e) => setChannelDraft(e.target.value)}
                        placeholder="@channel_or_id"
                        className="px-3 py-1.5 bg-[#17102a] border border-purple-600 rounded-lg text-xs text-white font-mono focus:outline-none w-full sm:w-56"
                      />
                      <button
                        onClick={() => handleSaveChannel(movie.id)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingMovieId(null)}
                        className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs cursor-pointer shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                      <span className="px-2.5 py-1 rounded-md bg-[#19112e] text-purple-300 font-mono text-[11px] border border-purple-900/50">
                        {movie.telegramChannelId || 'No channel linked'}
                      </span>
                      <button
                        onClick={() => handleStartEditChannel(movie)}
                        className="p-1.5 text-zinc-400 hover:text-purple-300 hover:bg-purple-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Edit Telegram Channel"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
