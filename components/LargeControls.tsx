import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LargeControlsProps {
  isPlaying: boolean;
  isSelectionDifferent: boolean;
  onPlayPause: () => void;
  onFadeOut: () => void;
  onToggleDuck: () => void;
  isFading: boolean;
  isDucked: boolean;
  isEnding?: boolean;
  disabled?: boolean;
}

export const LargeControls: React.FC<LargeControlsProps> = ({ 
  isPlaying, 
  isSelectionDifferent,
  onPlayPause, 
  onFadeOut, 
  onToggleDuck,
  isFading,
  isDucked,
  isEnding = false,
  disabled = false
}) => {
  if (isFading) {
    return (
      <div className="w-full flex flex-col gap-4">
        <button
          disabled
          className="w-full py-12 rounded-2xl flex flex-col items-center justify-center transition-all bg-zinc-800 text-white opacity-60 cursor-wait"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
            </div>
            <span className="text-sm font-bold tracking-[0.3em] uppercase opacity-80">Fading Out</span>
          </div>
        </button>
      </div>
    );
  }

  const showPlayButton = !isPlaying || isSelectionDifferent;
  const showFadeButton = isPlaying;
  const buttonText = isSelectionDifferent ? 'Play Selected' : 'Start';

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-3 h-[140px]">
        <AnimatePresence mode="popLayout">
          {/* Main Play/Switch Button */}
          {showPlayButton && (
            <motion.button
              key="play-button"
              initial={{ opacity: 0, scale: 0.8, x: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -20 }}
              onClick={onPlayPause}
              disabled={disabled}
              title={isSelectionDifferent ? "Play Selected (Enter)" : "Start (Space)"}
              className="group flex-1 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border border-transparent bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_20px_40px_-15px_rgba(16,185,129,0.4)] hover:shadow-[0_20px_50px_-10px_rgba(16,185,129,0.6)]"
            >
              <i className="fa-solid fa-play text-3xl mb-3 group-hover:scale-110 transition-transform"></i>
              <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">
                {buttonText}
              </span>
            </motion.button>
          )}

          {/* Dedicated Fade Out Button */}
          {showFadeButton && (
            <motion.button
              key="fade-button"
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 20 }}
              onClick={onFadeOut}
              disabled={disabled}
              title="Fade Out (Esc)"
              className={`group flex-1 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-[0_15px_30px_-10px_rgba(225,29,72,0.3)] hover:shadow-[0_15px_40px_-5px_rgba(225,29,72,0.5)] ${isEnding ? 'animate-pulse ring-4 ring-rose-500/40' : ''}`}
            >
              <i className="fa-solid fa-wind text-3xl mb-3 group-hover:scale-110 transition-transform"></i>
              <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">Fade Out</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Duck Button - Always present */}
        <button
          onClick={onToggleDuck}
          disabled={disabled}
          title="Toggle Ducking (D)"
          className={`group flex-[0.4] rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border ${
            isDucked 
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.4)]' 
              : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]'
          }`}
        >
          <i className={`fa-solid ${isDucked ? 'fa-volume-low' : 'fa-volume-high'} text-xl mb-2`}></i>
          <span className="text-[8px] font-bold tracking-[0.1em] uppercase">{isDucked ? 'Ducked' : 'Duck'}</span>
        </button>
      </div>
    </div>
  );
};
