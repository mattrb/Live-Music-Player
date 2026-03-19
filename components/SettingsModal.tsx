import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  duckingLevel: number;
  setDuckingLevel: (level: number) => void;
  fadeOutDuration: number;
  setFadeOutDuration: (duration: number) => void;
  isLoudnessNormalized: boolean;
  setIsLoudnessNormalized: (value: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  duckingLevel,
  setDuckingLevel,
  fadeOutDuration,
  setFadeOutDuration,
  isLoudnessNormalized,
  setIsLoudnessNormalized
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md z-[101]"
          >
            <div className="bg-zinc-900/90 border border-white/10 backdrop-blur-2xl rounded-[2.5rem] p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-bold tracking-[0.3em] uppercase opacity-60">Player Settings</h2>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <i className="fa-solid fa-xmark opacity-60"></i>
                </button>
              </div>

              <div className="flex flex-col gap-8">
                {/* Leveller Toggle */}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Leveller</span>
                    <p className="text-[9px] opacity-30 leading-relaxed uppercase tracking-wider">Loudness Normalization</p>
                  </div>
                  <button 
                    onClick={() => setIsLoudnessNormalized(!isLoudnessNormalized)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${isLoudnessNormalized ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isLoudnessNormalized ? 'left-[22px]' : 'left-1'}`}></div>
                  </button>
                </div>

                {/* Ducking Offset */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Ducking Offset</span>
                    <span className="text-xs font-mono text-indigo-400">{duckingLevel}dB</span>
                  </div>
                  <input 
                    type="range" min="-40" max="0" step="1" 
                    value={duckingLevel} 
                    onChange={(e) => setDuckingLevel(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                  />
                  <p className="text-[9px] opacity-30 leading-relaxed uppercase tracking-wider">
                    Adjusts the background music volume when ducking is active.
                  </p>
                </div>

                {/* Fade Time */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Fade Out Duration</span>
                    <span className="text-xs font-mono text-rose-400">{fadeOutDuration}s</span>
                  </div>
                  <input 
                    type="range" min="1" max="15" step="0.5" 
                    value={fadeOutDuration} 
                    onChange={(e) => setFadeOutDuration(parseFloat(e.target.value))}
                    className="w-full accent-rose-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                  />
                  <p className="text-[9px] opacity-30 leading-relaxed uppercase tracking-wider">
                    Sets the duration of the smooth logarithmic fade-out.
                  </p>
                </div>
              </div>

              <button 
                onClick={onClose}
                className="w-full mt-10 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
