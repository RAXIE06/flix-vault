import React, { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export const AdminAccessModal: React.FC<AdminAccessModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAccessCode('');
      setShowCode(false);
      setErrorMessage(null);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!accessCode.trim()) {
      setErrorMessage('Access code is required.');
      return;
    }

    try {
      setLoading(true);
      // Real server-side authentication call
      await api.loginAdmin(accessCode.trim());
      setLoading(false);
      onAuthenticated();
    } catch (err: any) {
      setLoading(false);
      setErrorMessage(err.message || 'Invalid access code. Please verify credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      <div
        className="relative w-full max-w-md bg-[#0d0917] border border-purple-950/90 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/80 my-auto text-left"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close admin access dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-700 to-violet-950 flex items-center justify-center border border-purple-500/30 shadow-md shadow-purple-950/60">
            <Lock className="w-4 h-4 text-purple-200" />
          </div>
          <div>
            <h2 id="admin-modal-title" className="text-xl font-bold text-white font-['Outfit']">
              Admin Access
            </h2>
            <p className="text-xs text-zinc-400">
              Backend verified authentication portal
            </p>
          </div>
        </div>

        {/* Generic Error Message Banner */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2.5 animate-in fade-in duration-150">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-access-code" className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Admin Access Code
            </label>
            
            <div className="relative">
              <input
                id="admin-access-code"
                type={showCode ? 'text' : 'password'}
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={loading}
                placeholder="Enter access code"
                autoComplete="current-password"
                className="w-full pl-3.5 pr-24 py-2.5 bg-[#140f22] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors"
              />

              {/* Show / Hide Code Control */}
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-zinc-400 hover:text-purple-300 flex items-center gap-1 rounded hover:bg-purple-950/40 transition-colors cursor-pointer"
                title={showCode ? 'Hide Code' : 'Show Code'}
              >
                {showCode ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Show</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold text-xs sm:text-sm shadow-md shadow-purple-950/80 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Verifying with Server...</span>
              </>
            ) : (
              <>
                <span>Continue to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Security Notice */}
          <div className="pt-2 text-[11px] text-zinc-500 leading-normal border-t border-purple-950/40">
            <span className="text-zinc-400 font-medium">Security Enforcement: </span>
            Access code is validated securely on the Node.js backend using HttpOnly session cookies and IP rate limiting. No credentials exist in client source code.
          </div>
        </form>

      </div>

    </div>
  );
};
