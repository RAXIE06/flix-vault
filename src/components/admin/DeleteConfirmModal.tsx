import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Movie } from '../../types';

interface DeleteConfirmModalProps {
  movie: Movie | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  movie,
  onConfirm,
  onCancel,
}) => {
  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md bg-[#0e0917] border border-rose-950/80 rounded-2xl p-6 shadow-2xl shadow-rose-950/40 text-left"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-950/70 border border-rose-800/60 flex items-center justify-center text-rose-400 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 id="delete-dialog-title" className="text-base font-bold text-white font-['Outfit']">
              Delete Movie from Catalog?
            </h3>
            <p className="text-xs text-zinc-400">
              This will remove the title from the FlixVault showcase.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#140b1e] border border-rose-900/30 text-xs space-y-1 mb-5">
          <div className="font-semibold text-white">{movie.title}</div>
          <div className="text-zinc-400 font-mono text-[11px]">{movie.year} · {movie.priceSample}</div>
          {movie.isFeatured && (
            <div className="text-amber-400 text-[11px] pt-1">
              ⚠️ Note: This is currently the Primary Featured movie. If deleted, the next available active movie will become the hero.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-rose-950"
          >
            Yes, Delete Movie
          </button>
        </div>
      </div>
    </div>
  );
};
