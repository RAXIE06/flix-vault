import React from 'react';
import { Film, Lock, MessageCircle, Package } from 'lucide-react';
import { InfoModalContent } from '../types';

interface FooterProps {
  onOpenInfo: (info: InfoModalContent) => void;
  onOpenAdminAccess: () => void;
  onOpenMyOrders?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenInfo, onOpenAdminAccess, onOpenMyOrders }) => {
  return (
    <footer className="w-full bg-[#06050a] border-t border-purple-950/40 text-zinc-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 pb-10 border-b border-purple-950/40">
          
          {/* Brand */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-900 flex items-center justify-center shadow-md">
                <Film className="w-4 h-4 text-purple-100" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white font-['Outfit']">
                Flix<span className="text-purple-400">Vault</span>
              </span>
            </div>
            <p className="text-zinc-400 max-w-sm leading-relaxed text-xs">
              Curated Pay-Per-Movie Digital Cinema. Permanent 4K master ownership with instant UPI checkout.
            </p>
            <div className="pt-1 text-[11px] text-zinc-500 font-mono">
              Phase 2B Secure Backend · Node.js, Express &amp; MongoDB Atlas Persistence
            </div>
          </div>

          {/* Columns */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-5 gap-6">
            
            {/* Catalog */}
            <div>
              <h4 className="font-semibold text-white uppercase tracking-wider text-[11px] mb-3 font-mono">
                Catalog
              </h4>
              <ul className="space-y-2">
                <li>
                  <a href="#featured-showcase" className="hover:text-purple-300 transition-colors">
                    Featured Movie
                  </a>
                </li>
                <li>
                  <a href="#secondary-collection" className="hover:text-purple-300 transition-colors">
                    Curated Collection
                  </a>
                </li>
              </ul>
            </div>

            {/* Platform */}
            <div>
              <h4 className="font-semibold text-white uppercase tracking-wider text-[11px] mb-3 font-mono">
                Platform
              </h4>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => onOpenInfo({ title: 'About FlixVault', type: 'about' })}
                    className="hover:text-purple-300 transition-colors text-left cursor-pointer"
                  >
                    About FlixVault
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onOpenInfo({ title: 'Contact Support & Licensing', type: 'contact' })}
                    className="hover:text-purple-300 transition-colors text-left cursor-pointer"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>

            {/* My Orders */}
            {onOpenMyOrders && (
              <div>
                <h4 className="font-semibold text-white uppercase tracking-wider text-[11px] mb-3 font-mono">
                  My Account
                </h4>
                <ul className="space-y-2">
                  <li>
                    <button
                      onClick={onOpenMyOrders}
                      className="hover:text-purple-300 transition-colors text-left cursor-pointer flex items-center gap-1.5"
                    >
                      <Package className="w-3.5 h-3.5 text-purple-400" />
                      <span>My Orders</span>
                    </button>
                  </li>
                </ul>
              </div>
            )}

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-white uppercase tracking-wider text-[11px] mb-3 font-mono">
                Legal
              </h4>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => onOpenInfo({ title: 'Terms of Service', type: 'terms' })}
                    className="hover:text-purple-300 transition-colors text-left cursor-pointer"
                  >
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onOpenInfo({ title: 'Privacy Policy', type: 'privacy' })}
                    className="hover:text-purple-300 transition-colors text-left cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-semibold text-white uppercase tracking-wider text-[11px] mb-3 font-mono">
                Support
              </h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://t.me/Owner_helpbot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-purple-300 transition-colors flex items-center gap-1.5 group"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
                    <span>Need Help? Chat</span>
                  </a>
                </li>
                <li className="text-zinc-500 text-[11px] font-mono pl-5">
                  @Owner_helpbot
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
          <div>
            &copy; 2026 FlixVault. All rights reserved. Cinematic streaming catalog.
          </div>
          
          <div className="flex items-center gap-4">
            <span>Secure UPI Payments · Instant Delivery</span>
            <span aria-hidden="true">·</span>
            
            <button
              onClick={onOpenAdminAccess}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-zinc-400 hover:text-purple-300 hover:bg-purple-950/40 border border-purple-950/40 hover:border-purple-800/60 transition-all cursor-pointer font-medium"
              title="Open Admin Access Portal"
            >
              <Lock className="w-3 h-3 text-purple-400" />
              <span>Admin</span>
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
