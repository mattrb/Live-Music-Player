import React from 'react';

interface LargeControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onFadeOut: () => void;
  onToggleDuck: () => void;
  isFading: boolean;
  isDucked: boolean;
  disabled?: boolean;
}

export const LargeControls: React.FC<LargeControlsProps> = ({ 
  isPlaying, 
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

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-4">
        {isPlaying ? (
          <>
            <button
              onClick={onFadeOut}
              disabled={disabled}
              className="group flex-[3] py-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] bg-rose-600 hover:bg-rose-500 text-white shadow-[0_15px_30px_-10px_rgba(225,29,72,0.3)]"
            >
              <i className="fa-solid fa-wind text-4xl mb-4 group-hover:scale-110 transition-transform"></i>
              <span className="text-sm font-extrabold tracking-[0.3em] uppercase">Fade Out</span>
            </button>
            <button
              onClick={onToggleDuck}
              disabled={disabled}
              className={`group flex-[1] py-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] border border-white/10 ${isDucked ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
            >
              <i className={`fa-solid ${isDucked ? 'fa-volume-low' : 'fa-volume-high'} text-2xl mb-2`}></i>
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase">{isDucked ? 'Ducked' : 'Duck'}</span>
            </button>
          </>
        ) : (
          <button
            onClick={onPlayPause}
            disabled={disabled}
            className="group w-full py-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-[0.98] bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_20px_40px_-15px_rgba(16,185,129,0.4)]"
          >
            <i className="fa-solid fa-play text-5xl mb-4 group-hover:scale-110 transition-transform"></i>
            <span className="text-sm font-extrabold tracking-[0.3em] uppercase">Start Playback</span>
          </button>
        )}
      </div>
    </div>
  );
};