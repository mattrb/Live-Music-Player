import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MOCK_PLAYLIST } from './constants';
import { PlayerState, Track } from './types';
import { TrackItem } from './components/TrackItem';
import { LargeControls } from './components/LargeControls';

const App: React.FC = () => {
  const [playlist, setPlaylist] = useState<Track[]>(MOCK_PLAYLIST);
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTrackIndex: 0,
    volume: 1,
    progress: 0,
    isFading: false,
    isShuffle: false,
    currentTime: 0,
    duration: 0,
    isDucked: false,
    duckingLevel: -10, // Initial -10dB
    fadeOutDuration: 5  // Initial 5s
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  const duckGainRef = useRef<GainNode | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const playlistContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentTrack = playlist[state.currentTrackIndex];
  const TARGET_LUFS_GAIN = 0.65; 

  // Helper to convert dB to linear gain
  const dbToLinear = (db: number) => Math.pow(10, db / 20);

  useEffect(() => {
    return () => {
      playlist.forEach(track => {
        if (track.url.startsWith('blob:')) URL.revokeObjectURL(track.url);
      });
    };
  }, [playlist]);

  const initAudioEngine = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const source = ctx.createMediaElementSource(audioRef.current);
      const mainGain = ctx.createGain();
      const duckGain = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();

      mainGain.gain.value = 0;
      duckGain.gain.value = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      
      compressor.threshold.setValueAtTime(-20, ctx.currentTime);
      compressor.knee.setValueAtTime(12, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      source.connect(compressor);
      compressor.connect(duckGain);
      duckGain.connect(mainGain);
      mainGain.connect(ctx.destination);

      audioContextRef.current = ctx;
      mainGainRef.current = mainGain;
      duckGainRef.current = duckGain;
    } catch (err) {
      console.warn("Audio Context init deferred.");
    }
  }, [state.isDucked, state.duckingLevel]);

  // Handle Ducking Parameter Changes Real-time
  useEffect(() => {
    if (duckGainRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      duckGainRef.current.gain.cancelScheduledValues(now);
      duckGainRef.current.gain.linearRampToValueAtTime(targetGain, now + 0.3);
    }
  }, [state.isDucked, state.duckingLevel]);

  const toggleDucking = useCallback(() => {
    setState(prev => ({ ...prev, isDucked: !prev.isDucked }));
  }, []);

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    playlist.forEach(t => { if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url); });
    const audioFiles = (Array.from(files) as File[]).filter(file => 
      file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(file.name)
    );
    if (audioFiles.length === 0) {
      setLoadError("No audio files found.");
      return;
    }
    const newPlaylist: Track[] = audioFiles.map((file, index) => ({
      id: `local-${index}-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
      artist: "Local Storage",
      duration: "--:--",
      url: URL.createObjectURL(file),
      cover: ''
    }));
    setPlaylist(newPlaylist);
    setState(prev => ({ ...prev, currentTrackIndex: 0, isPlaying: false, currentTime: 0, progress: 0, isFading: false }));
    setLoadError(null);
  };

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current || playlist.length === 0) return;
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

    if (state.isPlaying) {
      if (mainGainRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainRef.current.gain.cancelScheduledValues(now);
        mainGainRef.current.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        setTimeout(() => {
          audioRef.current?.pause();
          setState(prev => ({ ...prev, isPlaying: false }));
        }, 120);
      } else {
        audioRef.current.pause();
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    } else {
      try {
        setLoadError(null);
        if (mainGainRef.current && audioContextRef.current) {
          mainGainRef.current.gain.setTargetAtTime(TARGET_LUFS_GAIN, audioContextRef.current.currentTime, 0.01);
        }
        await audioRef.current.play();
        setState(prev => ({ ...prev, isPlaying: true }));
      } catch (error) {
        setLoadError("Playback failed.");
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    }
  }, [state.isPlaying, initAudioEngine, playlist.length, TARGET_LUFS_GAIN]);

  const startFadeOut = useCallback(() => {
    if (!audioRef.current || !mainGainRef.current || !audioContextRef.current || state.isFading || !state.isPlaying) return;

    setState(prev => ({ ...prev, isFading: true }));
    const ctx = audioContextRef.current;
    const gainNode = mainGainRef.current;
    const now = ctx.currentTime;
    const duration = state.fadeOutDuration;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.001), now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    fadeIntervalRef.current = window.setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
        setState(prev => ({ ...prev, isPlaying: false, isFading: false, currentTrackIndex: nextIndex, currentTime: 0, progress: 0 }));
      }
    }, duration * 1000) as unknown as number;
  }, [state.isPlaying, state.isFading, state.fadeOutDuration, state.isShuffle, state.currentTrackIndex, playlist.length]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut triggers when typing in input fields (though our controls are mostly ranges)
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'Escape':
          e.preventDefault();
          startFadeOut();
          break;
        case 'KeyD':
          e.preventDefault();
          toggleDucking();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, startFadeOut, toggleDucking]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (state.isFading) return; 
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setState(prev => ({ ...prev, currentTime: time, progress: (time / state.duration) * 100 }));
    }
  };

  const handleDragStart = (index: number) => { if (!state.isFading) setDraggedItemIndex(index); };
  const handleDrop = (dropIndex: number) => {
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) { setDraggedItemIndex(null); return; }
    const newPlaylist = [...playlist];
    const [movedItem] = newPlaylist.splice(draggedItemIndex, 1);
    newPlaylist.splice(dropIndex, 0, movedItem);
    let newCurrentIndex = state.currentTrackIndex;
    if (draggedItemIndex === state.currentTrackIndex) newCurrentIndex = dropIndex;
    else if (draggedItemIndex < state.currentTrackIndex && dropIndex >= state.currentTrackIndex) newCurrentIndex--;
    else if (draggedItemIndex > state.currentTrackIndex && dropIndex <= state.currentTrackIndex) newCurrentIndex++;
    setPlaylist(newPlaylist);
    setState(prev => ({ ...prev, currentTrackIndex: newCurrentIndex }));
    setDraggedItemIndex(null);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || playlist.length === 0) return;
    const loadAndPlay = async () => {
      setLoadError(null);
      audio.pause();
      audio.src = currentTrack.url;
      audio.load();
      if (state.isPlaying) try { await audio.play(); } catch (e) {}
    };
    loadAndPlay();
  }, [state.currentTrackIndex, playlist]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-xl flex flex-col gap-8">
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h1 className="text-xs font-bold tracking-[0.3em] uppercase opacity-40">Aether Player</h1>
            <div className="flex items-center gap-3">
              <button onClick={() => setState(p => ({ ...p, isShuffle: !p.isShuffle }))} className={`text-[10px] p-2 rounded-full border transition-all ${state.isShuffle ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white/60'}`}><i className="fa-solid fa-shuffle"></i></button>
              <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-bold tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20"><i className="fa-solid fa-folder-open"></i> Browse</button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFolderSelect} style={{ display: 'none' }} webkitdirectory="" directory="" multiple />
          </div>
          <p className="text-sm font-medium opacity-80">Studio Grade Session Console</p>
        </div>

        <section className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5 flex flex-col items-center shadow-2xl relative min-h-[380px] justify-center overflow-hidden">
          {playlist.length > 0 ? (
            <>
              <div className="w-full mb-8 text-center">
                <h2 className="text-2xl font-bold truncate mb-2 px-4">{currentTrack.title}</h2>
                <span className="text-[10px] uppercase tracking-widest opacity-40">{currentTrack.artist}</span>
              </div>

              <div className="w-full mb-2 group/seek">
                <div className="h-1.5 w-full bg-white/5 rounded-full relative overflow-hidden">
                  <div className={`h-full bg-white ${state.isPlaying ? 'opacity-100' : 'opacity-20'} transition-all`} style={{ width: `${state.progress}%` }}></div>
                  <input type="range" min="0" max={state.duration || 100} step="0.01" value={state.currentTime} onChange={handleSeek} onMouseDown={() => setIsDraggingProgress(true)} onMouseUp={() => setIsDraggingProgress(false)} disabled={state.isFading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
              
              <div className="w-full flex justify-between mb-8 text-[10px] font-mono opacity-40">
                <span>{Math.floor(state.currentTime / 60)}:{(Math.floor(state.currentTime % 60)).toString().padStart(2,'0')}</span>
                <span>-{Math.floor((state.duration - state.currentTime) / 60)}:{(Math.floor((state.duration - state.currentTime) % 60)).toString().padStart(2,'0')}</span>
              </div>

              <LargeControls isPlaying={state.isPlaying} onPlayPause={handlePlayPause} onFadeOut={startFadeOut} onToggleDuck={toggleDucking} isFading={state.isFading} isDucked={state.isDucked} />
            </>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary px-10 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em]">Load Folder</button>
          )}
        </section>

        {/* Dynamic Controls / Knobs */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between opacity-40">
              <span className="text-[9px] font-bold uppercase tracking-widest">Ducking Offset (D)</span>
              <span className="text-[10px] font-mono">{state.duckingLevel}dB</span>
            </div>
            <input 
              type="range" min="-40" max="0" step="1" 
              value={state.duckingLevel} 
              onChange={(e) => setState(p => ({ ...p, duckingLevel: parseInt(e.target.value) }))}
              className="w-full accent-indigo-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between opacity-40">
              <span className="text-[9px] font-bold uppercase tracking-widest">Fade Time (Esc)</span>
              <span className="text-[10px] font-mono">{state.fadeOutDuration}s</span>
            </div>
            <input 
              type="range" min="1" max="15" step="0.5" 
              value={state.fadeOutDuration} 
              onChange={(e) => setState(p => ({ ...p, fadeOutDuration: parseFloat(e.target.value) }))}
              className="w-full accent-rose-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>
        </section>

        {playlist.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2 pb-8">
            {playlist.map((track, index) => (
              <TrackItem key={track.id} track={track} index={index} isActive={state.currentTrackIndex === index} onClick={() => setState(p => ({ ...p, currentTrackIndex: index, isPlaying: true, isFading: false, currentTime: 0 }))} onDragStart={handleDragStart} onDragOver={() => {}} onDrop={handleDrop} />
            ))}
          </div>
        )}

        <audio 
          ref={audioRef} 
          onTimeUpdate={() => { if (!isDraggingProgress && audioRef.current) setState(p => ({ ...p, currentTime: audioRef.current!.currentTime, progress: (audioRef.current!.currentTime / audioRef.current!.duration) * 100 })) }}
          onLoadedMetadata={() => audioRef.current && setState(p => ({ ...p, duration: audioRef.current!.duration }))}
          onEnded={() => { const next = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length; setState(p => ({ ...p, currentTrackIndex: next, currentTime: 0 })); }}
        />
      </main>
    </div>
  );
};

export default App;