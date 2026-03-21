import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { TestToneChannel } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
  duckingLevel: number;
  setDuckingLevel: (level: number) => void;
  fadeOutDuration: number;
  setFadeOutDuration: (duration: number) => void;
  isLoudnessNormalized: boolean;
  setIsLoudnessNormalized: (value: boolean) => void;
  isTestToneOn: boolean;
  setIsTestToneOn: (value: boolean) => void;
  testToneChannel: TestToneChannel;
  setTestToneChannel: (channel: TestToneChannel) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  masterVolume,
  setMasterVolume,
  duckingLevel,
  setDuckingLevel,
  fadeOutDuration,
  setFadeOutDuration,
  isLoudnessNormalized,
  setIsLoudnessNormalized,
  isTestToneOn,
  setIsTestToneOn,
  testToneChannel,
  setTestToneChannel
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
                {/* Top Row: Leveller & Master Volume */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Leveller Toggle */}
                  <div className="flex flex-col gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Leveller</span>
                      <button 
                        onClick={() => setIsLoudnessNormalized(!isLoudnessNormalized)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${isLoudnessNormalized ? 'bg-emerald-500' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isLoudnessNormalized ? 'left-[22px]' : 'left-1'}`}></div>
                      </button>
                    </div>
                    <p className="text-[9px] opacity-30 leading-relaxed uppercase tracking-wider">Loudness Normalization</p>
                  </div>

                  {/* Master Volume */}
                  <div className="flex flex-col gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Master</span>
                      <span className="text-[10px] font-mono text-white/60">{Math.round(masterVolume * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01" 
                      value={masterVolume} 
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                    />
                  </div>
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

                {/* Test Tone */}
                <div className="flex flex-col gap-6 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Reference Tone</span>
                      <p className="text-[9px] opacity-30 leading-relaxed uppercase tracking-wider">1kHz @ -18dBFS</p>
                    </div>
                    <button 
                      onClick={() => setIsTestToneOn(!isTestToneOn)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${isTestToneOn ? 'bg-amber-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isTestToneOn ? 'left-[22px]' : 'left-1'}`}></div>
                    </button>
                  </div>

                  {isTestToneOn && (
                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <span className="text-[9px] font-bold uppercase tracking-widest opacity-30">Channel Selection</span>
                      <div className="grid grid-cols-3 gap-2">
                        {(['left', 'both', 'right'] as TestToneChannel[]).map((ch) => (
                          <button
                            key={ch}
                            onClick={() => setTestToneChannel(ch)}
                            className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                              testToneChannel === ch 
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                                : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
                            }`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
