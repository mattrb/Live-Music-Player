import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LargeControlsProps {
  isPlaying: boolean;
  isSelectionDifferent: boolean;
  onPlayPause: () => void;
  onFadeOut: () => void;
  onCancelFade: () => void;
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
  onCancelFade,
  onToggleDuck,
  isFading,
  isDucked,
  isEnding = false,
  disabled = false
}) => {
  const showPlayButton = !isPlaying || isSelectionDifferent;
  const showFadeButton = isPlaying;
  const buttonText = isSelectionDifferent ? 'Play Selected' : 'Start';

  const fadeConfig = { duration: 0.2, ease: "easeInOut" };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-3 h-[140px] relative">
        <div className="flex-1 flex gap-3 relative">
          <AnimatePresence mode="popLayout">
            {isFading && (
              <motion.button
                key="fading-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fadeConfig}
                onClick={onCancelFade}
                title="Cancel Fade (Esc)"
                className="flex-1 rounded-2xl flex flex-col items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 group/fading"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-1.5 group-hover/fading:hidden">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  </div>
                  <i className="fa-solid fa-xmark text-xl hidden group-hover/fading:block text-rose-400"></i>
                  <span className="text-sm font-bold tracking-[0.3em] uppercase opacity-80 group-hover/fading:text-rose-400">
                    <span className="group-hover/fading:hidden">Fading Out</span>
                    <span className="hidden group-hover/fading:inline">Cancel</span>
                  </span>
                </div>
              </motion.button>
            )}

            {/* Main Play/Switch Button */}
            {!isFading && showPlayButton && (
              <motion.button
                key="play-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fadeConfig}
                onClick={onPlayPause}
                disabled={disabled}
                title={isSelectionDifferent ? "Play Selected (Enter)" : "Start (Space)"}
                className="group flex-1 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border border-transparent bg-emerald-500 hover:bg-emerald-400 text-black"
                tabIndex={-1}
              >
                <i className="fa-solid fa-play text-3xl mb-3 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">
                  {buttonText}
                </span>
              </motion.button>
            )}

            {/* Dedicated Fade Out Button */}
            {!isFading && showFadeButton && (
              <motion.button
                key="fade-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fadeConfig}
                onClick={onFadeOut}
                disabled={disabled}
                title="Fade Out (Esc)"
                className={`group flex-1 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border bg-rose-600 hover:bg-rose-500 text-white border-rose-400 ${isEnding ? 'animate-pulse ring-4 ring-rose-500/40' : ''}`}
                tabIndex={-1}
              >
                <i className="fa-solid fa-wind text-3xl mb-3 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">Fade Out</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Duck Button - Always present */}
        <button
          onClick={onToggleDuck}
          disabled={disabled}
          tabIndex={-1}
          title="Toggle Ducking (D)"
          className={`group flex-[0.4] rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border ${
            isDucked 
              ? 'bg-indigo-600 text-white border-indigo-400' 
              : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border-white/10'
          }`}
        >
          <i className={`fa-solid ${isDucked ? 'fa-volume-low' : 'fa-volume-high'} text-xl mb-2`}></i>
          <span className="text-[8px] font-bold tracking-[0.1em] uppercase">{isDucked ? 'Ducked' : 'Duck'}</span>
        </button>
      </div>
    </div>
  );
};
