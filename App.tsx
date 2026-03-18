import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MOCK_PLAYLIST } from './constants';
import { PlayerState, Track, PlaybackMode } from './types';
import { TrackItem } from './components/TrackItem';
import { LargeControls } from './components/LargeControls';

const App: React.FC = () => {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTrackIndex: 0,
    selectedTrackIndex: 0,
    volume: 1,
    progress: 0,
    isFading: false,
    isShuffle: false,
    currentTime: 0,
    duration: 0,
    isDucked: false,
    duckingLevel: -10, // Initial -10dB
    fadeOutDuration: 5,  // Initial 5s
    isLoudnessNormalized: true
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  const nextGainRef = useRef<GainNode | null>(null);
  const duckGainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const playlistContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCrossfadingRef = useRef(false);

  const currentTrack = playlist[state.currentTrackIndex];
  const NORMALIZATION_GAIN = 1.8; // Approx boost for -16 LUFS target from typical -23 LUFS
  const TARGET_LUFS_GAIN = 0.65; 
  const CROSSFADE_DURATION = 5;
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
    if (audioContextRef.current || !audioRef.current || !nextAudioRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const source = ctx.createMediaElementSource(audioRef.current);
      const nextSource = ctx.createMediaElementSource(nextAudioRef.current);
      
      const mainGain = ctx.createGain();
      const nextGain = ctx.createGain();
      const duckGain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();

      // Limiter settings for peak protection
      limiter.threshold.setValueAtTime(-1.0, ctx.currentTime);
      limiter.knee.setValueAtTime(0, ctx.currentTime);
      limiter.ratio.setValueAtTime(20, ctx.currentTime);
      limiter.attack.setValueAtTime(0.001, ctx.currentTime);
      limiter.release.setValueAtTime(0.1, ctx.currentTime);

      mainGain.gain.value = 0;
      nextGain.gain.value = 0;
      duckGain.gain.value = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      
      source.connect(mainGain);
      nextSource.connect(nextGain);
      
      mainGain.connect(duckGain);
      nextGain.connect(duckGain);
      
      duckGain.connect(limiter);
      limiter.connect(ctx.destination);

      audioContextRef.current = ctx;
      mainGainRef.current = mainGain;
      nextGainRef.current = nextGain;
      duckGainRef.current = duckGain;
      limiterRef.current = limiter;
    } catch (err) {
      console.warn("Audio Context init deferred.");
    }
  }, [state.isDucked, state.duckingLevel]);

  // Handle Normalization Parameter Changes Real-time
  useEffect(() => {
    if (mainGainRef.current && audioContextRef.current && state.isPlaying) {
      const now = audioContextRef.current.currentTime;
      const baseGain = state.isLoudnessNormalized ? NORMALIZATION_GAIN : TARGET_LUFS_GAIN;
      mainGainRef.current.gain.setTargetAtTime(baseGain, now, 0.1);
    }
  }, [state.isLoudnessNormalized, state.isPlaying]);

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

  const toggleShuffle = useCallback(() => {
    setState(prev => ({ ...prev, isShuffle: !prev.isShuffle }));
  }, []);

  const toggleTrackPlaybackMode = useCallback((index: number) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      const track = newPlaylist[index];
      const modes = [PlaybackMode.FOLLOW, PlaybackMode.ADVANCE, PlaybackMode.STOP];
      const currentIndex = modes.indexOf(track.playbackMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      newPlaylist[index] = { ...track, playbackMode: modes[nextIndex] };
      return newPlaylist;
    });
  }, []);

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const newPlaylist: Track[] = await Promise.all(audioFiles.map(async (file, index) => {
      const url = URL.createObjectURL(file);
      
      // Get duration
      let durationStr = "--:--";
      try {
        durationStr = await new Promise((resolve) => {
          const tempAudio = new Audio();
          tempAudio.src = url;
          tempAudio.onloadedmetadata = () => {
            resolve(formatTime(tempAudio.duration));
          };
          tempAudio.onerror = () => resolve("--:--");
          // Timeout after 2s if metadata doesn't load
          setTimeout(() => resolve("--:--"), 2000);
        });
      } catch (e) {
        console.error("Error getting duration for", file.name);
      }

      return {
        id: `local-${index}-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
        artist: "Local Storage",
        duration: durationStr,
        url: url,
        cover: '',
        playbackMode: PlaybackMode.FOLLOW // Default to follow for seamless playback
      };
    }));

    setPlaylist(newPlaylist);
    setState(prev => ({ ...prev, currentTrackIndex: 0, selectedTrackIndex: 0, isPlaying: false, currentTime: 0, progress: 0, isFading: false }));
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
        
        // If selected track is different from current playing track, switch to it
        if (state.selectedTrackIndex !== state.currentTrackIndex) {
          setState(prev => ({ 
            ...prev, 
            currentTrackIndex: prev.selectedTrackIndex,
            currentTime: 0,
            progress: 0,
            isPlaying: true 
          }));
          // The useEffect for currentTrackIndex change will handle loading the new source
          return;
        }

        if (mainGainRef.current && audioContextRef.current) {
          const baseGain = state.isLoudnessNormalized ? NORMALIZATION_GAIN : TARGET_LUFS_GAIN;
          mainGainRef.current.gain.setTargetAtTime(baseGain, audioContextRef.current.currentTime, 0.01);
        }
        await audioRef.current.play();
        setState(prev => ({ ...prev, isPlaying: true }));
      } catch (error) {
        setLoadError("Playback failed.");
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    }
  }, [state.isPlaying, state.isLoudnessNormalized, state.selectedTrackIndex, state.currentTrackIndex, initAudioEngine, playlist.length, TARGET_LUFS_GAIN, NORMALIZATION_GAIN]);

  const startCrossfade = useCallback(async () => {
    if (isCrossfadingRef.current || !audioRef.current || !nextAudioRef.current || !mainGainRef.current || !nextGainRef.current || !audioContextRef.current) return;
    
    isCrossfadingRef.current = true;
    const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    const baseGain = state.isLoudnessNormalized ? NORMALIZATION_GAIN : TARGET_LUFS_GAIN;

    // Prepare next audio
    nextAudioRef.current.src = nextTrack.url;
    nextAudioRef.current.load();
    
    // Fade out current
    mainGainRef.current.gain.cancelScheduledValues(now);
    mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
    mainGainRef.current.gain.exponentialRampToValueAtTime(0.001, now + CROSSFADE_DURATION);
    
    // Fade in next
    nextGainRef.current.gain.cancelScheduledValues(now);
    nextGainRef.current.gain.setValueAtTime(0.001, now);
    nextGainRef.current.gain.exponentialRampToValueAtTime(baseGain, now + CROSSFADE_DURATION);
    
    try {
      await nextAudioRef.current.play();
    } catch (e) {
      console.error("Crossfade play failed", e);
    }
    
    setTimeout(() => {
      if (audioRef.current && nextAudioRef.current && mainGainRef.current && nextGainRef.current) {
        audioRef.current.pause();
        
        // Swap refs for the next cycle
        const tempAudio = audioRef.current;
        audioRef.current = nextAudioRef.current;
        nextAudioRef.current = tempAudio;
        
        const tempGain = mainGainRef.current;
        mainGainRef.current = nextGainRef.current;
        nextGainRef.current = tempGain;
        
        isCrossfadingRef.current = false;
        setState(prev => ({ ...prev, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0 }));
      }
    }, CROSSFADE_DURATION * 1000);
  }, [state.isShuffle, state.currentTrackIndex, state.isLoudnessNormalized, playlist, NORMALIZATION_GAIN, TARGET_LUFS_GAIN]);

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
        case 'KeyS':
          e.preventDefault();
          toggleShuffle();
          break;
        case 'Enter':
          e.preventDefault();
          setState(prev => ({ ...prev, currentTrackIndex: prev.selectedTrackIndex, isPlaying: true, currentTime: 0 }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            selectedTrackIndex: prev.selectedTrackIndex > 0 ? prev.selectedTrackIndex - 1 : playlist.length - 1
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            selectedTrackIndex: prev.selectedTrackIndex < playlist.length - 1 ? prev.selectedTrackIndex + 1 : 0
          }));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, startFadeOut, toggleDucking, toggleShuffle, playlist.length]);

  // Scroll active track into view
  useEffect(() => {
    const activeElement = document.querySelector('.track-selected');
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [state.selectedTrackIndex]);

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
    if (!audio || !currentTrack) return;
    const loadAndPlay = async () => {
      // Only reload if the source is actually different to avoid muting during reorder
      // We compare the resolved absolute URLs
      const absoluteUrl = new URL(currentTrack.url, window.location.href).href;
      if (audio.src !== absoluteUrl) {
        setLoadError(null);
        audio.pause();
        audio.src = currentTrack.url;
        audio.load();
        if (state.isPlaying) try { await audio.play(); } catch (e) {}
      }
    };
    loadAndPlay();
  }, [currentTrack?.id]); // Only depend on track ID to handle track changes and reordering

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-xl flex flex-col gap-8">
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h1 className="text-xs font-bold tracking-[0.3em] uppercase opacity-40">Aether Player</h1>
            <div className="flex items-center gap-3">
              <button onClick={toggleShuffle} className={`text-[10px] p-2 rounded-full border transition-all ${state.isShuffle ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white/60'}`} title="Shuffle"><i className="fa-solid fa-shuffle"></i></button>
              <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-bold tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20"><i className="fa-solid fa-folder-open"></i> Load Tracks</button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFolderSelect} style={{ display: 'none' }} multiple accept="audio/*" />
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
              
              <div className="w-full flex justify-between items-center mb-8 text-[10px] font-mono opacity-40">
                <span>{Math.floor(state.currentTime / 60)}:{(Math.floor(state.currentTime % 60)).toString().padStart(2,'0')}</span>
                <span>-{Math.floor((state.duration - state.currentTime) / 60)}:{(Math.floor((state.duration - state.currentTime) % 60)).toString().padStart(2,'0')}</span>
              </div>

              <LargeControls 
                isPlaying={state.isPlaying} 
                isSelectionDifferent={state.selectedTrackIndex !== state.currentTrackIndex}
                onPlayPause={handlePlayPause} 
                onFadeOut={startFadeOut} 
                onToggleDuck={toggleDucking} 
                isFading={state.isFading} 
                isDucked={state.isDucked} 
              />
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
              <span className="text-[9px] font-bold uppercase tracking-widest">Loudness Mode (-16 LUFS)</span>
              <button 
                onClick={() => setState(p => ({ ...p, isLoudnessNormalized: !p.isLoudnessNormalized }))}
                className={`w-10 h-5 rounded-full relative transition-colors ${state.isLoudnessNormalized ? 'bg-emerald-500' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${state.isLoudnessNormalized ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
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
              <TrackItem 
                key={track.id} 
                track={track} 
                index={index} 
                isActive={state.currentTrackIndex === index} 
                isSelected={state.selectedTrackIndex === index}
                onClick={() => setState(p => ({ ...p, selectedTrackIndex: index }))} 
                onDragStart={handleDragStart} 
                onDragOver={() => {}} 
                onDrop={handleDrop}
                onTogglePlaybackMode={() => toggleTrackPlaybackMode(index)}
              />
            ))}
          </div>
        )}

        <audio 
          ref={audioRef} 
          onTimeUpdate={() => { 
            if (!isDraggingProgress && audioRef.current) {
              const time = audioRef.current.currentTime;
              const duration = audioRef.current.duration;
              setState(p => ({ ...p, currentTime: time, progress: (time / duration) * 100 }));
              
              // Trigger crossfade if shuffle is on and we're 5s from end
              if (state.isShuffle && time > duration - CROSSFADE_DURATION && !isCrossfadingRef.current) {
                startCrossfade();
              }
            }
          }}
          onLoadedMetadata={() => audioRef.current && setState(p => ({ ...p, duration: audioRef.current!.duration }))}
          onEnded={() => { 
            if (playlist.length === 0 || isCrossfadingRef.current) return;
            const currentTrack = playlist[state.currentTrackIndex];
            const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
            
            if (currentTrack.playbackMode === PlaybackMode.FOLLOW) {
              setState(p => ({ ...p, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: true }));
            } else if (currentTrack.playbackMode === PlaybackMode.ADVANCE) {
              setState(p => ({ ...p, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: false }));
            } else {
              setState(p => ({ ...p, isPlaying: false, currentTime: 0 }));
              if (audioRef.current) audioRef.current.currentTime = 0;
            }
          }}
        />
        <audio ref={nextAudioRef} style={{ display: 'none' }} />
      </main>
    </div>
  );
};

export default App;