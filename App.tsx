import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MOCK_PLAYLIST } from './constants';
import { PlayerState, Track, PlaybackMode } from './types';
import { TrackItem } from './components/TrackItem';
import { LargeControls } from './components/LargeControls';
import { SettingsModal } from './components/SettingsModal';

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
  const [isEditing, setIsEditing] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [maxAverageLevel, setMaxAverageLevel] = useState<number>(0.1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const sessionFileInputRef = useRef<HTMLInputElement | null>(null);
  
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
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const isCrossfadingRef = useRef(false);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const lastLoadedUrlRef = useRef<string>('');

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const currentTrack = playlist[state.currentTrackIndex];
  const selectedTrack = playlist[state.selectedTrackIndex];
  const isViewingCurrent = state.selectedTrackIndex === state.currentTrackIndex;
  
  const TARGET_LUFS_GAIN = 0.65; 
  const CROSSFADE_DURATION = 5;
  // Helper to convert dB to linear gain
  const dbToLinear = (db: number) => Math.pow(10, db / 20);

  const getNormalizationGain = useCallback((track: Track | undefined) => {
    if (!track || !track.averageLevel || maxAverageLevel === 0) return 1.0;
    // Bring up the level to the loudest one
    const gain = maxAverageLevel / track.averageLevel;
    return Math.min(gain, 4.0); // Cap at +12dB boost for safety
  }, [maxAverageLevel]);

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
      const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
      const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
      const finalGain = baseGain * trim;
      mainGainRef.current.gain.setTargetAtTime(finalGain, now, 0.1);
    }
  }, [state.isLoudnessNormalized, state.isPlaying, currentTrack, currentTrack?.volumeTrim, getNormalizationGain, TARGET_LUFS_GAIN]);

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

  const toggleTrackLoop = useCallback((index: number) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      const track = newPlaylist[index];
      newPlaylist[index] = { ...track, isLooping: !track.isLooping };
      return newPlaylist;
    });
  }, []);

  const removeTrack = useCallback((index: number) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      const removedTrack = newPlaylist.splice(index, 1)[0];
      if (removedTrack?.url.startsWith('blob:')) {
        URL.revokeObjectURL(removedTrack.url);
      }
      return newPlaylist;
    });

    // Adjust current and selected indices
    setState(prev => {
      let { currentTrackIndex, selectedTrackIndex, isPlaying } = prev;
      
      if (index === currentTrackIndex) {
        // If we removed the currently playing track, stop playback or move to next
        isPlaying = false;
        const stopAudio = async () => {
          if (audioRef.current) {
            // Anti-click fade out
            if (mainGainRef.current && audioContextRef.current) {
              const now = audioContextRef.current.currentTime;
              mainGainRef.current.gain.cancelScheduledValues(now);
              mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
              mainGainRef.current.gain.setTargetAtTime(0, now, 0.015);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            if (playPromiseRef.current) {
              try { await playPromiseRef.current; } catch (e) {}
            }
            audioRef.current.pause();
            audioRef.current.src = '';
          }
        };
        stopAudio();
      } else if (index < currentTrackIndex) {
        currentTrackIndex--;
      }

      if (index === selectedTrackIndex) {
        selectedTrackIndex = Math.max(0, Math.min(selectedTrackIndex, playlist.length - 2));
      } else if (index < selectedTrackIndex) {
        selectedTrackIndex--;
      }

      return { ...prev, currentTrackIndex, selectedTrackIndex, isPlaying };
    });
  }, [playlist.length]);

  const saveSession = () => {
    const sessionData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      playlist: playlist.map(t => ({
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        playbackMode: t.playbackMode,
        averageLevel: t.averageLevel
      }))
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session-${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadSession = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        if (data.playlist) {
          // Note: URLs cannot be restored from text files for security reasons
          // We restore the metadata and mark them as "Missing File"
          const restoredTracks: Track[] = data.playlist.map((t: any, i: number) => ({
            ...t,
            id: `restored-${i}-${Date.now()}`,
            url: '', // User needs to re-link or we handle as placeholders
            isAnalyzing: false,
            cover: t.cover || ''
          }));
          setPlaylist(restoredTracks);
          setLoadError("Session metadata loaded. Please re-add audio files to enable playback.");
        }
      } catch (err) {
        setLoadError("Failed to parse session file.");
      }
    };
    reader.readAsText(file);
  };

  const clearPlaylist = useCallback(() => {
    if (playlist.length > 0 && !window.confirm('Are you sure you want to clear the entire playlist?')) {
      return;
    }
    setIsClearing(true);
    playlist.forEach(track => {
      if (track.url.startsWith('blob:')) URL.revokeObjectURL(track.url);
    });
    setPlaylist([]);
    setState(prev => ({ ...prev, currentTrackIndex: 0, selectedTrackIndex: 0, isPlaying: false, currentTime: 0, progress: 0 }));
    
    const stopAudio = async () => {
      if (audioRef.current) {
        // Anti-click fade out
        if (mainGainRef.current && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainRef.current.gain.cancelScheduledValues(now);
          mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
          mainGainRef.current.gain.setTargetAtTime(0, now, 0.015);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (playPromiseRef.current) {
          try { await playPromiseRef.current; } catch (e) {}
        }
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
    stopAudio();
    
    setTimeout(() => setIsClearing(false), 500);
  }, [playlist]);

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
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

    const analyzeLevel = async (url: string): Promise<{ rms: number, waveform: number[], bpm?: number, firstBeat?: number }> => {
      let audioContext: AudioContext | null = null;
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        
        let sum = 0;
        const step = Math.max(1, Math.floor(data.length / 10000));
        let count = 0;
        for (let i = 0; i < data.length; i += step) {
          sum += data[i] * data[i];
          count++;
        }
        const rms = Math.sqrt(sum / count);

        // Waveform calculation (100 points)
        const waveform: number[] = [];
        const waveformPoints = 100;
        const waveformStep = Math.floor(data.length / waveformPoints);
        for (let i = 0; i < waveformPoints; i++) {
          let max = 0;
          for (let j = 0; j < waveformStep; j++) {
            const val = Math.abs(data[i * waveformStep + j]);
            if (val > max) max = val;
          }
          waveform.push(max);
        }

        // --- BPM & First Beat Detection ---
        // 1. Find the first significant peak (threshold 0.2)
        let firstBeat = 0;
        const threshold = 0.2;
        for (let i = 0; i < data.length; i++) {
          if (Math.abs(data[i]) > threshold) {
            firstBeat = i / sampleRate;
            break;
          }
        }

        // 2. Simple BPM detection by peak counting
        // We'll look for peaks above a dynamic threshold (0.6 * max)
        let maxVal = 0;
        for (let i = 0; i < data.length; i += 100) {
          if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
        }
        const peakThreshold = maxVal * 0.6;
        const peaks: number[] = [];
        let lastPeakTime = -1;
        const minPeakDistance = 0.3; // Minimum 0.3s between beats (~200 BPM max)

        for (let i = 0; i < data.length; i += 100) {
          const time = i / sampleRate;
          if (Math.abs(data[i]) > peakThreshold && (time - lastPeakTime) > minPeakDistance) {
            peaks.push(time);
            lastPeakTime = time;
          }
        }

        let bpm = 0;
        if (peaks.length > 2) {
          const intervals: number[] = [];
          for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
          }
          // Median interval for stability
          intervals.sort((a, b) => a - b);
          const medianInterval = intervals[Math.floor(intervals.length / 2)];
          bpm = Math.round(60 / medianInterval);
          // Clamp to reasonable range
          if (bpm < 60) bpm *= 2;
          if (bpm > 200) bpm /= 2;
        }

        await audioContext.close();
        return { rms, waveform, bpm: bpm || 120, firstBeat };
      } catch (e) {
        if (audioContext) await audioContext.close();
        return { rms: 0.1, waveform: new Array(100).fill(0.1), bpm: 120, firstBeat: 0 };
      }
    };

    const newTracks: Track[] = audioFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      return {
        id: `local-${index}-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
        artist: "Local Storage",
        duration: "--:--",
        url: url,
        cover: '',
        playbackMode: PlaybackMode.ADVANCE,
        averageLevel: 0.1,
        isAnalyzing: true,
        startTime: 0,
        endTime: 0,
        volumeTrim: 1.0,
        waveformData: [],
        bpm: 120,
        firstBeat: 0
      };
    });

    setPlaylist(prev => [...prev, ...newTracks]);
    setLoadError(null);

    // Asynchronously analyze each track
    newTracks.forEach(async (track, idx) => {
      try {
        const [metadata, analysis] = await Promise.all([
          new Promise<{ duration: number, durationStr: string }>((resolve) => {
            const tempAudio = new Audio();
            tempAudio.src = track.url;
            tempAudio.onloadedmetadata = () => resolve({
              duration: tempAudio.duration,
              durationStr: formatTime(tempAudio.duration)
            });
            tempAudio.onerror = () => resolve({ duration: 0, durationStr: "--:--" });
            setTimeout(() => resolve({ duration: 0, durationStr: "--:--" }), 5000);
          }),
          analyzeLevel(track.url)
        ]);

        setPlaylist(prev => prev.map(t => t.id === track.id ? { 
          ...t, 
          duration: metadata.durationStr, 
          fullDuration: metadata.duration,
          averageLevel: analysis.rms, 
          waveformData: analysis.waveform,
          endTime: metadata.duration,
          startTime: analysis.firstBeat || 0, // Automatically set start to first peak
          bpm: analysis.bpm,
          firstBeat: analysis.firstBeat,
          isAnalyzing: false 
        } : t));
      } catch (e) {
        console.error("Error analyzing", track.title);
        setPlaylist(prev => prev.map(t => t.id === track.id ? { ...t, isAnalyzing: false } : t));
      }
    });
  };

  // Update maxAverageLevel whenever playlist changes
  useEffect(() => {
    const levels = playlist.filter(t => !t.isAnalyzing).map(t => t.averageLevel || 0.1);
    if (levels.length > 0) {
      setMaxAverageLevel(Math.max(...levels));
    }
  }, [playlist]);

  const switchTrack = useCallback(async (index: number) => {
    if (state.isFading || isCrossfadingRef.current) return;

    // Fade out current track if playing
    if (state.isPlaying && mainGainRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      mainGainRef.current.gain.cancelScheduledValues(now);
      mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
      mainGainRef.current.gain.setTargetAtTime(0, now, 0.015); // Super short 15ms fade
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const targetTrack = playlist[index];
    if (!targetTrack) return;

    setState(prev => ({
      ...prev,
      currentTrackIndex: index,
      selectedTrackIndex: index,
      currentTime: targetTrack.startTime || 0,
      progress: 0,
      isPlaying: true,
      isFading: false
    }));
  }, [state.isPlaying, state.isFading, playlist]);

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current || playlist.length === 0) return;
    
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // If selected track is different from current playing track, switch to it immediately
    if (state.selectedTrackIndex !== state.currentTrackIndex) {
      if (fadeIntervalRef.current) {
        clearTimeout(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      
      switchTrack(state.selectedTrackIndex);
      return;
    }

    if (state.isPlaying) {
      // Start smooth pause
      if (mainGainRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainRef.current.gain.cancelScheduledValues(now);
        mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
        mainGainRef.current.gain.setTargetAtTime(0, now, 0.015); // Super short 15ms fade
        
        // We set isPlaying to false immediately to prevent race conditions
        setState(prev => ({ ...prev, isPlaying: false }));
      } else {
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    } else {
      // Play
      if (fadeIntervalRef.current) {
        clearTimeout(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      
      // Ensure we start from silence for a smooth fade-in
      if (mainGainRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainRef.current.gain.cancelScheduledValues(now);
        mainGainRef.current.gain.setValueAtTime(0, now);
      }
      
      setState(prev => ({ ...prev, isPlaying: true, isFading: false }));
    }
  }, [state.isPlaying, state.isFading, state.selectedTrackIndex, state.currentTrackIndex, initAudioEngine, playlist]);

  const startCrossfade = useCallback(async () => {
    if (isCrossfadingRef.current || !audioRef.current || !nextAudioRef.current || !mainGainRef.current || !nextGainRef.current || !audioContextRef.current) return;
    
    const currentTrack = playlist[state.currentTrackIndex];
    const isLooping = currentTrack.isLooping;
    const nextIndex = isLooping 
      ? state.currentTrackIndex 
      : (state.isShuffle ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length);
    const nextTrack = playlist[nextIndex];

    if (!nextTrack || !nextTrack.url) {
      console.warn("Cannot crossfade: next track has no URL");
      return;
    }
    
    isCrossfadingRef.current = true;
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    const baseGain = state.isLoudnessNormalized ? getNormalizationGain(nextTrack) : TARGET_LUFS_GAIN;

    // --- Beat Alignment for Looping ---
    let nextStartTime = nextTrack.startTime || 0;
    if (isLooping && nextTrack.bpm && nextTrack.bpm > 0) {
      const beatInterval = 60 / nextTrack.bpm;
      const currentPos = audioRef.current.currentTime;
      const elapsedSinceStart = currentPos - (currentTrack.startTime || 0);
      
      // We want to jump to a point that maintains the beat phase
      // For a simple loop, we just go to startTime, but we can nudge it
      // to ensure the transition is on a beat.
      // Actually, if the loop length is a multiple of beats, it's perfect.
      // If not, we nudge the start time of the NEXT iteration to align.
      const beatsPlayed = elapsedSinceStart / beatInterval;
      const fractionalBeat = beatsPlayed % 1;
      // If we are at 0.9 of a beat, we should start the next one at 0.9 of a beat too
      // to maintain the rhythm.
      nextStartTime = (nextTrack.startTime || 0) + (fractionalBeat * beatInterval);
    }

    // Prepare next audio
    nextAudioRef.current.src = nextTrack.url;
    nextAudioRef.current.load();
    
    // Fade out current
    mainGainRef.current.gain.cancelScheduledValues(now);
    mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
    mainGainRef.current.gain.setTargetAtTime(0, now, CROSSFADE_DURATION / 3);
    
    // Fade in next
    nextGainRef.current.gain.cancelScheduledValues(now);
    nextGainRef.current.gain.setValueAtTime(0, now);
    nextGainRef.current.gain.setTargetAtTime(baseGain, now, CROSSFADE_DURATION / 3);
    
    try {
      // Wait for next audio to be ready
      if (nextAudioRef.current.readyState < 2) {
        await new Promise((resolve) => {
          const onCanPlay = () => {
            nextAudioRef.current?.removeEventListener('canplay', onCanPlay);
            resolve(null);
          };
          nextAudioRef.current?.addEventListener('canplay', onCanPlay);
          setTimeout(resolve, 2000);
        });
      }
      if (nextAudioRef.current) {
        nextAudioRef.current.currentTime = nextStartTime;
      }
      await nextAudioRef.current.play();
    } catch (e) {
      console.error("Crossfade play failed", e);
    }
    
    setTimeout(async () => {
      if (!isMountedRef.current) return;
      console.log(`Crossfade timeout completed. Syncing audio elements...`);
      if (audioRef.current && nextAudioRef.current && mainGainRef.current && nextGainRef.current) {
        try {
          // Instead of swapping refs (which React breaks), we sync the main audio to the next one
          audioRef.current.pause();
          console.log(`Main audio paused. Syncing to: ${nextTrack.url}`);
          audioRef.current.src = nextTrack.url;
          audioRef.current.load();
          
          // Wait for metadata before setting currentTime
          await new Promise((resolve) => {
            const onLoaded = () => {
              audioRef.current?.removeEventListener('loadedmetadata', onLoaded);
              resolve(null);
            };
            audioRef.current?.addEventListener('loadedmetadata', onLoaded);
            setTimeout(resolve, 1000); // Fallback
          });

          if (!isMountedRef.current) return;
          audioRef.current.currentTime = nextAudioRef.current.currentTime;
          lastLoadedUrlRef.current = nextTrack.url;
          
          // Reset gains to primary
          const currentNow = audioContextRef.current?.currentTime || 0;
          mainGainRef.current.gain.cancelScheduledValues(currentNow);
          mainGainRef.current.gain.setValueAtTime(baseGain, currentNow);
          nextGainRef.current.gain.cancelScheduledValues(currentNow);
          nextGainRef.current.gain.setValueAtTime(0, currentNow);
          
          console.log(`Starting playback of synced main audio...`);
          await audioRef.current.play();
          console.log(`Main audio playback started successfully.`);
          nextAudioRef.current.pause();
          
          setState(prev => ({ ...prev, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: audioRef.current?.currentTime || 0 }));
        } catch (err) {
          console.error("Error during crossfade sync/play:", err);
          setLoadError(`Crossfade failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
          isCrossfadingRef.current = false;
        }
      }
    }, CROSSFADE_DURATION * 1000);
  }, [state.isShuffle, state.currentTrackIndex, state.isLoudnessNormalized, playlist, getNormalizationGain, TARGET_LUFS_GAIN]);

  const startFadeOut = useCallback(() => {
    if (!audioRef.current || !mainGainRef.current || !audioContextRef.current || state.isFading || !state.isPlaying) return;

    setState(prev => ({ ...prev, isFading: true }));
    const ctx = audioContextRef.current;
    const gainNode = mainGainRef.current;
    const now = ctx.currentTime;
    const duration = state.fadeOutDuration;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    // Use setTargetAtTime for a more natural, smoother logarithmic-like decay
    gainNode.gain.setTargetAtTime(0, now, duration / 4);

    fadeIntervalRef.current = window.setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        
        const currentTrack = playlist[state.currentTrackIndex];
        const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
        
        if (currentTrack.playbackMode === PlaybackMode.FOLLOW) {
          setState(prev => ({ ...prev, isPlaying: true, isFading: false, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, progress: 0 }));
        } else if (currentTrack.playbackMode === PlaybackMode.ADVANCE) {
          setState(prev => ({ ...prev, isPlaying: false, isFading: false, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, progress: 0 }));
        } else {
          setState(prev => ({ ...prev, isPlaying: false, isFading: false, currentTime: 0, progress: 0 }));
          if (audioRef.current) audioRef.current.currentTime = 0;
        }
      }
    }, duration * 1000) as unknown as number;
  }, [state.isPlaying, state.isFading, state.fadeOutDuration, state.isShuffle, state.currentTrackIndex, playlist]);

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
          initAudioEngine();
          setState(prev => ({ 
            ...prev, 
            currentTrackIndex: prev.selectedTrackIndex, 
            isPlaying: true, 
            currentTime: 0,
            progress: 0 
          }));
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

  const updateTrackRange = useCallback((index: number, start?: number, end?: number) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      const track = newPlaylist[index];
      const maxDuration = track.fullDuration || 0;
      
      let newStart = start !== undefined ? start : (track.startTime || 0);
      let newEnd = end !== undefined ? end : (track.endTime || maxDuration);
      
      // Handle NaN (empty inputs)
      if (isNaN(newStart)) newStart = 0;
      if (isNaN(newEnd)) newEnd = maxDuration;

      // Enforce constraints and round to 0.1s
      newStart = Math.round(Math.max(0, Math.min(newStart, newEnd - 0.1)) * 10) / 10;
      newEnd = Math.round(Math.max(newStart + 0.1, Math.min(newEnd, maxDuration)) * 10) / 10;
      
      newPlaylist[index] = { 
        ...track, 
        startTime: newStart,
        endTime: newEnd
      };
      return newPlaylist;
    });
  }, []);

  const updateTrackVolumeTrim = useCallback((index: number, trim: number) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      newPlaylist[index] = { ...newPlaylist[index], volumeTrim: trim };
      return newPlaylist;
    });
  }, []);

  const updateTrackTitle = useCallback((index: number, title: string) => {
    setPlaylist(prev => {
      const newPlaylist = [...prev];
      newPlaylist[index] = { ...newPlaylist[index], title };
      return newPlaylist;
    });
  }, []);

  const handleSeek = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (state.isFading || isCrossfadingRef.current) return; 
    const time = parseFloat(e.target.value);
    
    if (audioRef.current && currentTrack) {
      const startTime = currentTrack.startTime || 0;
      const endTime = currentTrack.endTime || state.duration;
      const clampedTime = Math.max(startTime, Math.min(endTime, time));

      // Anti-click fade dip
      if (state.isPlaying && mainGainRef.current && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        mainGainRef.current.gain.cancelScheduledValues(now);
        mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
        mainGainRef.current.gain.setTargetAtTime(0, now, 0.01); // 10ms dip
        
        // Very short wait for the dip
        await new Promise(resolve => setTimeout(resolve, 30));
        
        audioRef.current.currentTime = clampedTime;
        
        const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
        const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
        const finalGain = baseGain * trim;
        mainGainRef.current.gain.setTargetAtTime(finalGain, ctx.currentTime, 0.015); // 15ms fade back in
      } else {
        audioRef.current.currentTime = clampedTime;
      }
      
      setState(prev => ({ ...prev, currentTime: clampedTime, progress: (clampedTime / state.duration) * 100 }));
    }
  }, [state.isPlaying, state.isFading, state.duration, state.isLoudnessNormalized, currentTrack, getNormalizationGain, TARGET_LUFS_GAIN]);

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
    let isStale = false;
    const audio = audioRef.current;
    if (!audio || !currentTrack || !currentTrack.url) return;
    
    const loadAndPlay = async () => {
      if (!currentTrack.url) {
        console.warn(`Cannot play track "${currentTrack.title}": No URL provided.`);
        setLoadError(`Missing audio file for: ${currentTrack.title}`);
        return;
      }

      // 1. Handle Source Change
      if (lastLoadedUrlRef.current !== currentTrack.url) {
        console.log(`Loading new track URL: ${currentTrack.title}`);
        lastLoadedUrlRef.current = currentTrack.url;
        setLoadError(null);
        
        // Wait for any pending play to finish before changing src
        if (playPromiseRef.current) {
          try { await playPromiseRef.current; } catch (e) {}
        }
        
        if (isStale) return;

        // Anti-click fade out before changing source
        if (mainGainRef.current && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainRef.current.gain.cancelScheduledValues(now);
          mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
          mainGainRef.current.gain.setTargetAtTime(0, now, 0.015); // 15ms fade
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (isStale) return;
        audio.pause();
        
        // Reset audio element
        audio.src = currentTrack.url;
        audio.load(); // Explicitly call load after setting src
        
        // Reset currentTime for new track
        audio.currentTime = currentTrack.startTime || 0;
      } else if (state.isPlaying && audio.currentTime < (currentTrack.startTime || 0)) {
        // Ensure we start from the marker if we are behind it
        audio.currentTime = currentTrack.startTime || 0;
      }

      // 2. Handle Playback State
      if (state.isPlaying) {
        if (currentTrack.isAnalyzing) {
          console.log("Waiting for analysis to complete before playing...");
          return;
        }

        try {
          if (audioContextRef.current?.state === 'suspended') {
            await audioContextRef.current.resume();
          }
          
          if (mainGainRef.current && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
            const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
            const finalGain = baseGain * trim;
            
            mainGainRef.current.gain.cancelScheduledValues(now);
            // If we are just starting, ensure we start from 0 for a smooth fade-in
            if (audio.currentTime <= (currentTrack.startTime || 0) + 0.1) {
              mainGainRef.current.gain.setValueAtTime(0, now);
            } else {
              mainGainRef.current.gain.setValueAtTime(mainGainRef.current.gain.value, now);
            }
            mainGainRef.current.gain.setTargetAtTime(finalGain, now, 0.02); // 20ms fade in
          }
          
          if (isStale) return;

          // Ensure audio is ready to play
          if (audio.readyState < 2) { // HAVE_CURRENT_DATA
            console.log(`Audio not ready for ${currentTrack.title}, waiting for canplay... (readyState: ${audio.readyState})`);
            await new Promise((resolve) => {
              const onCanPlay = () => {
                console.log(`canplay event fired for ${currentTrack.title}`);
                audio.removeEventListener('canplay', onCanPlay);
                resolve(null);
              };
              const onError = () => {
                console.error(`error event fired for ${currentTrack.title}:`, audio.error?.message);
                audio.removeEventListener('error', onError);
                resolve(null); // Resolve anyway to let play() handle the error
              };
              audio.addEventListener('canplay', onCanPlay);
              audio.addEventListener('error', onError);
              // Timeout as fallback
              setTimeout(() => {
                audio.removeEventListener('canplay', onCanPlay);
                audio.removeEventListener('error', onError);
                resolve(null);
              }, 2000);
            });
          }

          if (isStale) return;

          console.log(`Playing track: ${currentTrack.title} (currentTime: ${audio.currentTime}s, readyState: ${audio.readyState})`);
          playPromiseRef.current = audio.play();
          await playPromiseRef.current;
          playPromiseRef.current = null;
          console.log(`Playback started successfully for ${currentTrack.title}`);
        } catch (e: any) {
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            console.warn("Playback failed", e);
            if (audio.error) setLoadError("Could not load audio file.");
          }
          playPromiseRef.current = null;
        }
      } else {
        // If we want to pause, wait for any pending play to resolve first
        if (playPromiseRef.current) {
          try { await playPromiseRef.current; } catch (e) {}
        }
        
        // Small delay for smooth pause if gain node exists
        if (mainGainRef.current && audioContextRef.current) {
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        
        if (isStale) return;
        audio.pause();
      }
    };
    
    loadAndPlay();
    return () => { isStale = true; };
  }, [currentTrack?.id, currentTrack?.isAnalyzing, state.isPlaying, state.isLoudnessNormalized, getNormalizationGain]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-xl flex flex-col gap-8 p-8 rounded-[2.5rem] border border-white/5 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
        
        <div className="flex flex-col gap-1">
          {loadError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{loadError}</span>
              </div>
              <button onClick={() => setLoadError(null)} className="hover:text-white transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold tracking-tight text-white">Sound File Player</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={saveSession}
                className="text-[10px] p-2 rounded-full border bg-white/5 border-white/5 text-white/30 hover:text-emerald-400 hover:bg-white/10 transition-all"
                title="Save Session"
              >
                <i className="fa-solid fa-floppy-disk"></i>
              </button>
              <button 
                onClick={() => sessionFileInputRef.current?.click()}
                className="text-[10px] p-2 rounded-full border bg-white/5 border-white/5 text-white/30 hover:text-indigo-400 hover:bg-white/10 transition-all"
                title="Load Session"
              >
                <i className="fa-solid fa-upload"></i>
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-[10px] p-2 rounded-full border bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/10 transition-all"
                title="Settings"
              >
                <i className="fa-solid fa-cog"></i>
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFolderSelect} style={{ display: 'none' }} multiple accept="audio/*" />
            <input type="file" ref={folderInputRef} onChange={handleFolderSelect} style={{ display: 'none' }} webkitdirectory="" directory="" multiple />
            <input type="file" ref={sessionFileInputRef} onChange={loadSession} style={{ display: 'none' }} accept=".txt,.json" />
          </div>
        </div>
        
        <div className="flex flex-col gap-6">
          {playlist.length > 0 && selectedTrack ? (
            <div className="w-full bg-[#1a1a1a] rounded-3xl border border-white/10 shadow-xl overflow-hidden">
              {/* Combined Block: Now Playing + Controls + Next Up */}
              <div className="p-6 border-b border-white/5">
                {state.isPlaying && currentTrack ? (
                  <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-widest opacity-30 mb-1">Now Playing</span>
                        <span className="text-xs font-bold truncate max-w-[200px]">{currentTrack.title}</span>
                      </div>
                      <div className="text-[9px] font-mono opacity-40 text-right">
                        {currentTrack.artist}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 group/nowplaying">
                      <span className="text-[10px] font-mono opacity-40 min-w-[35px]">
                        {Math.floor(state.currentTime / 60)}:{(Math.floor(state.currentTime % 60)).toString().padStart(2,'0')}
                      </span>
                      
                      <div className="flex-1 h-1 bg-white/10 rounded-full relative">
                        <div 
                          className="absolute h-full bg-emerald-500 transition-all duration-300" 
                          style={{ width: `${state.progress}%` }}
                        ></div>
                        <input 
                          type="range" 
                          min="0" 
                          max={state.duration || 100} 
                          step="0.01" 
                          value={state.currentTime} 
                          onChange={handleSeek} 
                          onMouseDown={() => setIsDraggingProgress(true)} 
                          onMouseUp={() => setIsDraggingProgress(false)} 
                          disabled={state.isFading} 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        />
                      </div>
                      
                      <div className="text-[10px] font-mono opacity-40 flex gap-2 min-w-[80px] justify-end">
                        <span>-{Math.floor((state.duration - state.currentTime) / 60)}:{(Math.floor((state.duration - state.currentTime) % 60)).toString().padStart(2,'0')}</span>
                        <span className="opacity-20">|</span>
                        <span>{currentTrack.duration}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4 opacity-20">
                    <span className="text-[10px] uppercase tracking-widest">Player Idle</span>
                  </div>
                )}
              </div>

              <div className="p-6 bg-white/[0.02] border-b border-white/5 flex justify-center">
                <LargeControls 
                  isPlaying={state.isPlaying} 
                  isSelectionDifferent={state.selectedTrackIndex !== state.currentTrackIndex}
                  onPlayPause={handlePlayPause} 
                  onFadeOut={startFadeOut} 
                  onToggleDuck={toggleDucking} 
                  isFading={state.isFading} 
                  isDucked={state.isDucked} 
                  isEnding={state.duration - state.currentTime <= 10}
                />
              </div>

              {isEditing && (
                <div className="p-6 bg-indigo-500/5 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col flex-1">
                      <span className="text-[9px] uppercase tracking-widest text-indigo-400 mb-1 font-bold">Editing Track</span>
                      <input 
                        type="text"
                        value={selectedTrack.title}
                        onChange={(e) => updateTrackTitle(state.selectedTrackIndex, e.target.value)}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm font-bold text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all w-full"
                        placeholder="Track Title"
                      />
                    </div>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all ml-4 border border-white/5"
                    >
                      Close Edit
                    </button>
                  </div>

                  <div className="w-full mb-6 group/seek relative h-16 flex items-center">
                    {/* Waveform Visualization */}
                    <div className="absolute inset-0 flex items-center justify-between pointer-events-none opacity-20">
                      {selectedTrack.waveformData?.map((val, i) => (
                        <div 
                          key={i} 
                          className="w-[0.8%] bg-white rounded-full" 
                          style={{ height: `${val * 100}%`, minHeight: '2px' }}
                        ></div>
                      ))}
                    </div>

                    <div className="h-1.5 w-full bg-white/5 rounded-full relative">
                      {/* Active Region (between start and end) */}
                      <div 
                        className="absolute h-full bg-emerald-500/20"
                        style={{ 
                          left: `${((selectedTrack.startTime || 0) / (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 1))) * 100}%`,
                          width: `${(((selectedTrack.endTime || (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 0))) - (selectedTrack.startTime || 0)) / (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 1))) * 100}%`
                        }}
                      ></div>

                      {/* Progress Bar (Only visible if viewing current track) */}
                      <div className={`h-full bg-white ${state.isPlaying && isViewingCurrent ? 'opacity-100' : 'opacity-20'} transition-all relative`} style={{ width: `${isViewingCurrent ? state.progress : 0}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover/seek:scale-100 transition-transform"></div>
                      </div>

                      {/* Start Handle */}
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 cursor-ew-resize z-20"
                        style={{ left: `${((selectedTrack.startTime || 0) / (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 1))) * 100}%` }}
                        onMouseDown={() => setDraggingHandle('start')}
                      >
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                          <input 
                            type="number"
                            step="0.1"
                            value={selectedTrack.startTime || 0}
                            onChange={(e) => updateTrackRange(state.selectedTrackIndex, parseFloat(e.target.value))}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-14 bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 text-[10px] font-mono rounded px-1 py-0.5 text-center focus:border-emerald-400 outline-none shadow-lg"
                          />
                        </div>
                      </div>

                      {/* End Handle */}
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-rose-500 cursor-ew-resize z-20"
                        style={{ left: `${((selectedTrack.endTime || (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 1))) / (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 1))) * 100}%` }}
                        onMouseDown={() => setDraggingHandle('end')}
                      >
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                          <input 
                            type="number"
                            step="0.1"
                            value={selectedTrack.endTime || 0}
                            onChange={(e) => updateTrackRange(state.selectedTrackIndex, undefined, parseFloat(e.target.value))}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-14 bg-rose-950/90 border border-rose-500/50 text-rose-400 text-[10px] font-mono rounded px-1 py-0.5 text-center focus:border-rose-400 outline-none shadow-lg"
                          />
                        </div>
                      </div>

                      <input 
                        type="range" 
                        min="0" 
                        max={selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 100)} 
                        step="0.1" 
                        value={isViewingCurrent ? state.currentTime : (selectedTrack.startTime || 0)} 
                        onChange={handleSeek} 
                        onMouseDown={() => setIsDraggingProgress(true)} 
                        onMouseUp={() => setIsDraggingProgress(false)} 
                        disabled={state.isFading || !isViewingCurrent} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0" 
                      />
                    </div>

                    {/* Dragging Overlay for Handles */}
                    {draggingHandle && (
                      <div 
                        className="fixed inset-0 z-50 cursor-ew-resize"
                        onMouseMove={(e) => {
                          const seekBar = document.querySelector('.group\\/seek')?.getBoundingClientRect();
                          if (seekBar) {
                            const relativeX = Math.max(0, Math.min(seekBar.width, e.clientX - seekBar.left));
                            const rawTime = (relativeX / seekBar.width) * (selectedTrack.fullDuration || (isViewingCurrent ? state.duration : 0));
                            const time = Math.round(rawTime * 10) / 10;
                            if (draggingHandle === 'start') {
                              updateTrackRange(state.selectedTrackIndex, time);
                            } else {
                              updateTrackRange(state.selectedTrackIndex, undefined, time);
                            }
                          }
                        }}
                        onMouseUp={() => setDraggingHandle(null)}
                      ></div>
                    )}
                  </div>
                  
                  <div className="w-full flex justify-between items-center text-[10px] font-mono opacity-40 mb-4">
                    <span>
                      {isViewingCurrent 
                        ? `${Math.floor(state.currentTime / 60)}:${(Math.floor(state.currentTime % 60)).toString().padStart(2,'0')}`
                        : `${Math.floor((selectedTrack.startTime || 0) / 60)}:${(Math.floor((selectedTrack.startTime || 0) % 60)).toString().padStart(2,'0')}`
                      }
                    </span>
                    <span>
                      {isViewingCurrent
                        ? `-${Math.floor((state.duration - state.currentTime) / 60)}:${(Math.floor((state.duration - state.currentTime) % 60)).toString().padStart(2,'0')}`
                        : selectedTrack.duration
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full p-12 bg-[#1a1a1a] rounded-3xl border border-white/10 shadow-xl flex items-center justify-center">
              <button onClick={() => folderInputRef.current?.click()} className="btn-primary px-10 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em]">Load Folder</button>
            </div>
          )}
        </div>

        {playlist.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Playlist</h3>
              <div className="flex items-center gap-2">
                <button onClick={toggleShuffle} className={`text-[10px] p-2 rounded-full border transition-all ${state.isShuffle ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white/60'}`} title="Shuffle (S)"><i className="fa-solid fa-shuffle"></i></button>
                <button onClick={clearPlaylist} className="text-[10px] p-2 rounded-full border bg-white/5 border-white/5 text-white/30 hover:text-rose-400 hover:bg-white/10 transition-all" title="Clear Playlist"><i className="fa-solid fa-trash-can"></i></button>
                <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-bold tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20" title="Load more tracks"><i className="fa-solid fa-folder-open"></i> Load Tracks</button>
              </div>
            </div>
            <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2 pb-8">
            {playlist.map((track, index) => (
              <TrackItem 
                key={track.id} 
                track={track} 
                index={index} 
                isActive={state.currentTrackIndex === index} 
                isSelected={state.selectedTrackIndex === index}
                onClick={() => {
                  setState(p => ({ 
                    ...p, 
                    selectedTrackIndex: index, 
                  }));
                }} 
                onDragStart={handleDragStart} 
                onDragOver={() => {}} 
                onDrop={handleDrop}
                onTogglePlaybackMode={() => toggleTrackPlaybackMode(index)}
                onToggleLoop={() => toggleTrackLoop(index)}
                onRemove={() => removeTrack(index)}
                onEdit={() => {
                  setState(p => ({ ...p, selectedTrackIndex: index }));
                  setIsEditing(true);
                }}
                onVolumeTrimChange={(trim) => updateTrackVolumeTrim(index, trim)}
              />
            ))}
          </div>
        </div>
      )}

        <audio 
          ref={audioRef} 
          onTimeUpdate={() => { 
            if (!isDraggingProgress && audioRef.current && currentTrack) {
              const time = audioRef.current.currentTime;
              const duration = audioRef.current.duration;
              const endTime = currentTrack.endTime || duration;
              
              setState(p => ({ ...p, currentTime: time, progress: (time / duration) * 100 }));
              
              // Handle End Time - only if duration is valid and we've actually played a bit
              if (duration > 0 && endTime > 0 && time >= endTime && time > 0.5 && state.isPlaying && !isCrossfadingRef.current) {
                console.log(`Track end reached: ${time} >= ${endTime}`);
                
                // Anti-click fade out before ending
                if (mainGainRef.current && audioContextRef.current) {
                  const now = audioContextRef.current.currentTime;
                  mainGainRef.current.gain.setTargetAtTime(0, now, 0.015);
                }

                // Trigger end logic manually after a tiny fade
                setTimeout(() => {
                  if (audioRef.current) {
                    const event = new Event('ended');
                    audioRef.current.dispatchEvent(event);
                  }
                }, 40);
              }

              // Trigger crossfade if shuffle is on OR looping is on and we're 5s from end
              const startTime = currentTrack.startTime || 0;
              const isNearEnd = endTime > 0 && time > endTime - CROSSFADE_DURATION && time > startTime + 1;
              if ((state.isShuffle || currentTrack.isLooping) && isNearEnd && !isCrossfadingRef.current) {
                startCrossfade();
              }
            }
          }}
          onLoadedMetadata={() => audioRef.current && setState(p => ({ ...p, duration: audioRef.current!.duration }))}
          onError={(e) => {
            const audio = audioRef.current;
            if (audio && audio.error) {
              console.error("Audio error:", audio.error.message, "Code:", audio.error.code);
              setLoadError(`Playback failed: ${audio.error.message || 'The element has no supported sources.'}`);
            }
          }}
          onEnded={() => { 
            if (playlist.length === 0 || isCrossfadingRef.current) return;
            const currentTrack = playlist[state.currentTrackIndex];
            
            if (currentTrack.isLooping) {
              if (mainGainRef.current && audioContextRef.current) {
                const now = audioContextRef.current.currentTime;
                mainGainRef.current.gain.cancelScheduledValues(now);
                mainGainRef.current.gain.setValueAtTime(0, now);
                const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
                const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
                const finalGain = baseGain * trim;
                mainGainRef.current.gain.setTargetAtTime(finalGain, now, 0.015);
              }
              setState(p => ({ ...p, currentTime: 0, isPlaying: true }));
              if (audioRef.current) audioRef.current.currentTime = currentTrack.startTime || 0;
              return;
            }

            const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
            
            if (currentTrack.playbackMode === PlaybackMode.FOLLOW) {
              if (nextIndex === state.currentTrackIndex && audioRef.current) {
                audioRef.current.currentTime = playlist[nextIndex].startTime || 0;
                // We don't need to call play() here because isPlaying is already true or being set to true,
                // and the useEffect will handle it if the index changed. 
                // If index didn't change, we need to make sure the audio element actually plays.
                audioRef.current.play().catch(() => {});
              }
              setState(p => ({ ...p, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: true }));
            } else if (currentTrack.playbackMode === PlaybackMode.ADVANCE) {
              if (nextIndex === state.currentTrackIndex && audioRef.current) {
                audioRef.current.currentTime = playlist[nextIndex].startTime || 0;
              }
              setState(p => ({ ...p, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: false }));
            } else {
              setState(p => ({ ...p, isPlaying: false, currentTime: 0 }));
              if (audioRef.current) audioRef.current.currentTime = 0;
            }
          }}
        />
        <audio 
          ref={nextAudioRef} 
          style={{ display: 'none' }} 
          onError={(e) => {
            const audio = nextAudioRef.current;
            if (audio && audio.error) {
              console.error("Next audio element error:", audio.error.message, "Code:", audio.error.code);
            }
          }}
        />

        <SettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          duckingLevel={state.duckingLevel}
          setDuckingLevel={(level) => setState(p => ({ ...p, duckingLevel: level }))}
          fadeOutDuration={state.fadeOutDuration}
          setFadeOutDuration={(duration) => setState(p => ({ ...p, fadeOutDuration: duration }))}
          isLoudnessNormalized={state.isLoudnessNormalized}
          setIsLoudnessNormalized={(value) => setState(p => ({ ...p, isLoudnessNormalized: value }))}
        />
      </main>
    </div>
  );
};

export default App;