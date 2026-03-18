import React from 'react';

interface LargeControlsProps {
  isPlaying: boolean;
  isSelectionDifferent: boolean;
  onPlayPause: () => void;
  onFadeOut: () => void;
  onToggleDuck: () => void;
  isFading: boolean;
  isDucked: boolean;
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

  const showPlayIcon = !isPlaying || isSelectionDifferent;
  const buttonText = isSelectionDifferent ? 'Play Selected' : (isPlaying ? 'Pause' : 'Start');

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-3">
        {/* Main Play/Pause/Switch Button */}
        <button
          onClick={onPlayPause}
          disabled={disabled}
          className={`group flex-[2.5] py-10 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border border-transparent ${
            !showPlayIcon 
              ? 'bg-white/10 text-white hover:bg-white/20 border-white/10' 
              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_20px_40px_-15px_rgba(16,185,129,0.4)]'
          }`}
        >
          <i className={`fa-solid ${showPlayIcon ? 'fa-play' : 'fa-pause'} text-3xl mb-3 group-hover:scale-110 transition-transform`}></i>
          <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">
            {buttonText}
          </span>
        </button>

        {/* Dedicated Fade Out Button */}
        <button
          onClick={onFadeOut}
          disabled={disabled || !isPlaying}
          className={`group flex-[2] py-10 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border ${
            isPlaying 
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-[0_15px_30px_-10px_rgba(225,29,72,0.3)]' 
              : 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'
          }`}
        >
          <i className="fa-solid fa-wind text-3xl mb-3 group-hover:scale-110 transition-transform"></i>
          <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase">Fade Out</span>
        </button>

        {/* Duck Button */}
        <button
          onClick={onToggleDuck}
          disabled={disabled}
          className={`group flex-[1] py-10 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border ${
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