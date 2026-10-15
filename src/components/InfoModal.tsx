import React, { useEffect } from 'react';
import { X, ShieldCheck, Mail, FileText, Info } from 'lucide-react';
import { InfoModalContent } from '../types';

interface InfoModalProps {
  content: InfoModalContent | null;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ content, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (content) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      
      <div
        className="relative w-full max-w-lg bg-[#0e0a19] border border-purple-950/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/80 my-auto text-left max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-purple-400 mb-2">
          {content.type === 'about' && <Info className="w-5 h-5" />}
          {content.type === 'contact' && <Mail className="w-5 h-5" />}
          {content.type === 'terms' && <FileText className="w-5 h-5" />}
          {content.type === 'privacy' && <ShieldCheck className="w-5 h-5" />}
          <span className="text-xs uppercase font-semibold tracking-wider font-mono">
            FlixVault Documentation
          </span>
        </div>

        <h2 id="info-modal-title" className="text-2xl font-bold text-white mb-4 font-['Outfit']">
          {content.title}
        </h2>

        {content.type === 'about' && (
          <div className="text-xs sm:text-sm text-zinc-300 space-y-3 leading-relaxed">
            <p>
              <strong className="text-white">FlixVault</strong> is an ultra-premium cinema catalog platform built for cinephiles, independent film lovers, and fans of visionary science fiction, neo-noir, and speculative thrillers.
            </p>
            <p>
              Our mission is to bring high-bitrate streaming masters, director commentary archives, and carefully curated festival premieres into a unified cinematic viewing experience.
            </p>
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-900/40 text-xs text-purple-300">
              <strong>Architecture Status:</strong> Powered by a Node.js + Express backend with MongoDB Atlas persistence and standalone UPI pay-per-movie order generation. Subscriptions and recurring memberships are not used on FlixVault.
            </div>
          </div>
        )}

        {content.type === 'contact' && (
          <div className="text-xs sm:text-sm text-zinc-300 space-y-4 leading-relaxed">
            <p>
              Have inquiries regarding catalog licensing, filmmaker submissions, or technical feedback? Our cinema operations team is here to assist.
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-[#151022] border border-purple-950/60">
                <span className="text-zinc-500 block">Editorial & Curations</span>
                <span className="text-purple-300 font-mono">curator@flixvault.demo</span>
              </div>
              <div className="p-3 rounded-lg bg-[#151022] border border-purple-950/60">
                <span className="text-zinc-500 block">General Support & Partnerships</span>
                <span className="text-purple-300 font-mono">contact@flixvault.demo</span>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Response turnaround time is typically within 1–2 business days.
            </p>
          </div>
        )}

        {content.type === 'terms' && (
          <div className="text-xs sm:text-sm text-zinc-300 space-y-3 leading-relaxed">
            <p>
              Welcome to FlixVault. By accessing this catalog, you acknowledge and agree to our terms of service:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-300">
              <li>Each cinema title is sold on an individual, standalone pay-per-movie basis. There are no recurring subscriptions or hidden membership charges.</li>
              <li>Unauthorized reproduction, scraping, or redistribution of catalog metadata is strictly prohibited.</li>
              <li>UPI payments are verified on the server for instant digital access to the purchased 4K title.</li>
            </ul>
          </div>
        )}

        {content.type === 'privacy' && (
          <div className="text-xs sm:text-sm text-zinc-300 space-y-3 leading-relaxed">
            <p>
              FlixVault respects your privacy. We are committed to safeguarding viewing records and user telemetry.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-300">
              <li>FlixVault never stores raw banking credentials or payment cards. All transactions process through secure, direct UPI verification.</li>
              <li>Administrative access is strictly protected with server-validated authentication tokens.</li>
              <li>Buyer contact details and delivery records are kept secure and never shared with external advertisers.</li>
            </ul>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-purple-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>

    </div>
  );
};
