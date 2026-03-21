import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MOCK_PLAYLIST } from './constants';
import { PlayerState, Track, PlaybackMode } from './types';
import { TrackItem } from './components/TrackItem';
import { LargeControls } from './components/LargeControls';
import { SettingsModal } from './components/SettingsModal';

const NUM_PLAYLISTS = 3;

const INITIAL_PLAYER_STATE: PlayerState = {
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
  isLoudnessNormalized: true,
  isTestToneOn: false,
  testToneChannel: 'both'
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [playlists, setPlaylists] = useState<Track[][]>([[], [], []]);
  const [states, setStates] = useState<PlayerState[]>([
    { ...INITIAL_PLAYER_STATE },
    { ...INITIAL_PLAYER_STATE },
    { ...INITIAL_PLAYER_STATE }
  ]);
  const [playlistTitles, setPlaylistTitles] = useState<string[]>(['Playlist 1', 'Playlist 2', 'Playlist 3']);
  const [editingTabIndex, setEditingTabIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [maxAverageLevel, setMaxAverageLevel] = useState<number>(0.1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [oscStatus, setOscStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [analysisQueue, setAnalysisQueue] = useState<string[]>([]);
  const [isWorkerBusy, setIsWorkerBusy] = useState(false);
  const sessionFileInputRef = useRef<HTMLInputElement | null>(null);
  
  const audioRefs = [useRef<HTMLAudioElement | null>(null), useRef<HTMLAudioElement | null>(null), useRef<HTMLAudioElement | null>(null)];
  const nextAudioRefs = [useRef<HTMLAudioElement | null>(null), useRef<HTMLAudioElement | null>(null), useRef<HTMLAudioElement | null>(null)];
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainGainsRef = useRef<(GainNode | null)[]>([null, null, null]);
  const nextGainsRef = useRef<(GainNode | null)[]>([null, null, null]);
  const duckGainsRef = useRef<(GainNode | null)[]>([null, null, null]);
  const tabGainsRef = useRef<(GainNode | null)[]>([null, null, null]);
  const masterGainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const testToneOscRef = useRef<OscillatorNode | null>(null);
  const testToneGainRef = useRef<GainNode | null>(null);
  const testTonePannerRef = useRef<StereoPannerNode | null>(null);
  const fadeIntervalRefs = useRef<(number | null)[]>([null, null, null]);
  const playlistContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const isCrossfadingRefs = useRef<boolean[]>([false, false, false]);
  const playPromiseRefs = useRef<(Promise<void> | null)[]>([null, null, null]);
  const crossfadeTimeoutRefs = useRef<(number | null)[]>([null, null, null]);

  const lastLoadedUrlRefs = useRef<string[]>(['', '', '']);

  const isMountedRef = useRef(true);
  const statesRef = useRef(states);
  const playlistsRef = useRef(playlists);
  const activeTabRef = useRef(activeTab);
  const playlistTitlesRef = useRef(playlistTitles);
  
  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    playlistTitlesRef.current = playlistTitles;
  }, [playlistTitles]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const state = states[activeTab];
  const playlist = playlists[activeTab];
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
    if (audioContextRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const masterGain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();

      // Limiter settings for peak protection
      limiter.threshold.setValueAtTime(-1.0, ctx.currentTime);
      limiter.knee.setValueAtTime(0, ctx.currentTime);
      limiter.ratio.setValueAtTime(20, ctx.currentTime);
      limiter.attack.setValueAtTime(0.001, ctx.currentTime);
      limiter.release.setValueAtTime(0.1, ctx.currentTime);

      masterGain.connect(ctx.destination);
      limiter.connect(masterGain);

      // Create 3 chains
      for (let i = 0; i < NUM_PLAYLISTS; i++) {
        const audio = audioRefs[i].current;
        const nextAudio = nextAudioRefs[i].current;
        if (!audio || !nextAudio) continue;

        const source = ctx.createMediaElementSource(audio);
        const nextSource = ctx.createMediaElementSource(nextAudio);
        
        const mainGain = ctx.createGain();
        const nextGain = ctx.createGain();
        const duckGain = ctx.createGain();
        const tabGain = ctx.createGain();

        mainGain.gain.value = 0;
        nextGain.gain.value = 0;
        duckGain.gain.value = statesRef.current[i].isDucked ? dbToLinear(statesRef.current[i].duckingLevel) : 1;
        tabGain.gain.value = statesRef.current[i].volume;
        
        source.connect(mainGain);
        nextSource.connect(nextGain);
        
        mainGain.connect(duckGain);
        nextGain.connect(duckGain);
        duckGain.connect(tabGain);
        tabGain.connect(limiter);

        mainGainsRef.current[i] = mainGain;
        nextGainsRef.current[i] = nextGain;
        duckGainsRef.current[i] = duckGain;
        tabGainsRef.current[i] = tabGain;
      }
      
      // Test Tone Setup
      const testToneOsc = ctx.createOscillator();
      const testToneGain = ctx.createGain();
      const testTonePanner = ctx.createStereoPanner();

      testToneOsc.frequency.setValueAtTime(1000, ctx.currentTime);
      testToneGain.gain.value = 0;
      testTonePanner.pan.value = 0;

      testToneOsc.connect(testToneGain);
      testToneGain.connect(testTonePanner);
      testTonePanner.connect(limiter);
      testToneOsc.start();

      limiter.connect(masterGain);
      masterGain.connect(ctx.destination);

      audioContextRef.current = ctx;
      masterGainRef.current = masterGain;
      limiterRef.current = limiter;
      testToneOscRef.current = testToneOsc;
      testToneGainRef.current = testToneGain;
      testTonePannerRef.current = testTonePanner;
    } catch (err) {
      console.warn("Audio Context init deferred.");
    }
  }, [dbToLinear]);

  // Handle Normalization Parameter Changes Real-time
  useEffect(() => {
    const i = 0;
    const state = states[i];
    const playlist = playlists[i];
    const currentTrack = playlist[state.currentTrackIndex];
    if (mainGainsRef.current[i] && audioContextRef.current && state.isPlaying) {
      const now = audioContextRef.current.currentTime;
      const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
      const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
      const finalGain = baseGain * trim;
      mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.1);
    }
  }, [states[0].isLoudnessNormalized, states[0].isPlaying, playlists[0][states[0].currentTrackIndex]?.volumeTrim, getNormalizationGain, TARGET_LUFS_GAIN]);

  useEffect(() => {
    const i = 1;
    const state = states[i];
    const playlist = playlists[i];
    const currentTrack = playlist[state.currentTrackIndex];
    if (mainGainsRef.current[i] && audioContextRef.current && state.isPlaying) {
      const now = audioContextRef.current.currentTime;
      const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
      const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
      const finalGain = baseGain * trim;
      mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.1);
    }
  }, [states[1].isLoudnessNormalized, states[1].isPlaying, playlists[1][states[1].currentTrackIndex]?.volumeTrim, getNormalizationGain, TARGET_LUFS_GAIN]);

  useEffect(() => {
    const i = 2;
    const state = states[i];
    const playlist = playlists[i];
    const currentTrack = playlist[state.currentTrackIndex];
    if (mainGainsRef.current[i] && audioContextRef.current && state.isPlaying) {
      const now = audioContextRef.current.currentTime;
      const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
      const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
      const finalGain = baseGain * trim;
      mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.1);
    }
  }, [states[2].isLoudnessNormalized, states[2].isPlaying, playlists[2][states[2].currentTrackIndex]?.volumeTrim, getNormalizationGain, TARGET_LUFS_GAIN]);

  // Handle Ducking Parameter Changes Real-time
  useEffect(() => {
    const i = 0;
    const state = states[i];
    if (duckGainsRef.current[i] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      duckGainsRef.current[i]!.gain.cancelScheduledValues(now);
      duckGainsRef.current[i]!.gain.linearRampToValueAtTime(targetGain, now + 0.3);
    }
  }, [states[0].isDucked, states[0].duckingLevel]);

  useEffect(() => {
    const i = 1;
    const state = states[i];
    if (duckGainsRef.current[i] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      duckGainsRef.current[i]!.gain.cancelScheduledValues(now);
      duckGainsRef.current[i]!.gain.linearRampToValueAtTime(targetGain, now + 0.3);
    }
  }, [states[1].isDucked, states[1].duckingLevel]);

  useEffect(() => {
    const i = 2;
    const state = states[i];
    if (duckGainsRef.current[i] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isDucked ? dbToLinear(state.duckingLevel) : 1;
      duckGainsRef.current[i]!.gain.cancelScheduledValues(now);
      duckGainsRef.current[i]!.gain.linearRampToValueAtTime(targetGain, now + 0.3);
    }
  }, [states[2].isDucked, states[2].duckingLevel]);

  // Handle Tab Volume Changes Real-time
  useEffect(() => {
    if (tabGainsRef.current[0] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      tabGainsRef.current[0]!.gain.setTargetAtTime(states[0].volume, now, 0.05);
    }
  }, [states[0].volume]);

  useEffect(() => {
    if (tabGainsRef.current[1] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      tabGainsRef.current[1]!.gain.setTargetAtTime(states[1].volume, now, 0.05);
    }
  }, [states[1].volume]);

  useEffect(() => {
    if (tabGainsRef.current[2] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      tabGainsRef.current[2]!.gain.setTargetAtTime(states[2].volume, now, 0.05);
    }
  }, [states[2].volume]);

  // Handle Test Tone Changes Real-time
  useEffect(() => {
    const i = 0;
    const state = states[i];
    if (testToneGainRef.current && testTonePannerRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isTestToneOn ? dbToLinear(-18) : 0;
      let targetPan = 0;
      if (state.testToneChannel === 'left') targetPan = -1;
      else if (state.testToneChannel === 'right') targetPan = 1;

      testToneGainRef.current.gain.cancelScheduledValues(now);
      testToneGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);

      testTonePannerRef.current.pan.cancelScheduledValues(now);
      testTonePannerRef.current.pan.setTargetAtTime(targetPan, now, 0.05);
    }
  }, [states[0].isTestToneOn, states[0].testToneChannel]);

  useEffect(() => {
    const i = 1;
    const state = states[i];
    if (testToneGainRef.current && testTonePannerRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isTestToneOn ? dbToLinear(-18) : 0;
      let targetPan = 0;
      if (state.testToneChannel === 'left') targetPan = -1;
      else if (state.testToneChannel === 'right') targetPan = 1;

      testToneGainRef.current.gain.cancelScheduledValues(now);
      testToneGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);

      testTonePannerRef.current.pan.cancelScheduledValues(now);
      testTonePannerRef.current.pan.setTargetAtTime(targetPan, now, 0.05);
    }
  }, [states[1].isTestToneOn, states[1].testToneChannel]);

  useEffect(() => {
    const i = 2;
    const state = states[i];
    if (testToneGainRef.current && testTonePannerRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const targetGain = state.isTestToneOn ? dbToLinear(-18) : 0;
      let targetPan = 0;
      if (state.testToneChannel === 'left') targetPan = -1;
      else if (state.testToneChannel === 'right') targetPan = 1;

      testToneGainRef.current.gain.cancelScheduledValues(now);
      testToneGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);

      testTonePannerRef.current.pan.cancelScheduledValues(now);
      testTonePannerRef.current.pan.setTargetAtTime(targetPan, now, 0.05);
    }
  }, [states[2].isTestToneOn, states[2].testToneChannel]);

  const toggleDucking = useCallback((tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], isDucked: !next[tab].isDucked };
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    const tab = activeTabRef.current;
    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], isShuffle: !next[tab].isShuffle };
      return next;
    });
  }, []);

  const toggleTrackPlaybackMode = useCallback((index: number) => {
    const tab = activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
      const track = newPlaylist[index];
      const modes = [PlaybackMode.FOLLOW, PlaybackMode.ADVANCE, PlaybackMode.STOP];
      const currentIndex = modes.indexOf(track.playbackMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      newPlaylist[index] = { ...track, playbackMode: modes[nextIndex] };
      next[tab] = newPlaylist;
      return next;
    });
  }, []);

  const toggleTrackLoop = useCallback((index: number) => {
    const tab = activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
      const track = newPlaylist[index];
      newPlaylist[index] = { ...track, isLooping: !track.isLooping };
      next[tab] = newPlaylist;
      return next;
    });
  }, []);

  const removeTrack = useCallback((index: number) => {
    const tab = activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
      const removedTrack = newPlaylist.splice(index, 1)[0];
      if (removedTrack?.url.startsWith('blob:')) {
        URL.revokeObjectURL(removedTrack.url);
      }
      next[tab] = newPlaylist;
      return next;
    });

    // Adjust current and selected indices
    setStates(prev => {
      const next = [...prev];
      let { currentTrackIndex, selectedTrackIndex, isPlaying } = next[tab];
      const playlist = playlistsRef.current[tab];
      
      if (index === currentTrackIndex) {
        // If we removed the currently playing track, stop playback or move to next
        isPlaying = false;
        const stopAudio = async () => {
          if (audioRefs[tab].current) {
            // Anti-click fade out
            if (mainGainsRef.current[tab] && audioContextRef.current) {
              const now = audioContextRef.current.currentTime;
              mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
              mainGainsRef.current[tab]!.gain.setValueAtTime(mainGainsRef.current[tab]!.gain.value, now);
              mainGainsRef.current[tab]!.gain.setTargetAtTime(0, now, 0.015);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            if (playPromiseRefs.current[tab]) {
              try { await playPromiseRefs.current[tab]; } catch (e) {}
            }
            audioRefs[tab].current!.pause();
            audioRefs[tab].current!.src = '';
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

      next[tab] = { ...next[tab], currentTrackIndex, selectedTrackIndex, isPlaying };
      return next;
    });
  }, []);

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
          setPlaylists(prev => {
            const next = [...prev];
            next[activeTabRef.current] = restoredTracks;
            return next;
          });
          setLoadError("Session metadata loaded. Please re-add audio files to enable playback.");
        }
      } catch (err) {
        setLoadError("Failed to parse session file.");
      }
    };
    reader.readAsText(file);
  };

  const clearPlaylist = useCallback(() => {
    const tab = activeTabRef.current;
    const playlist = playlistsRef.current[tab];
    if (playlist.length > 0 && !window.confirm('Are you sure you want to clear the entire playlist?')) {
      return;
    }
    setIsClearing(true);
    playlist.forEach(track => {
      if (track.url.startsWith('blob:')) URL.revokeObjectURL(track.url);
    });
    setPlaylists(prev => {
      const next = [...prev];
      next[tab] = [];
      return next;
    });
    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], currentTrackIndex: 0, selectedTrackIndex: 0, isPlaying: false, currentTime: 0, progress: 0 };
      return next;
    });
    
    const stopAudio = async () => {
      if (audioRefs[tab].current) {
        // Anti-click fade out
        if (mainGainsRef.current[tab] && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
          mainGainsRef.current[tab]!.gain.setValueAtTime(mainGainsRef.current[tab]!.gain.value, now);
          mainGainsRef.current[tab]!.gain.setTargetAtTime(0, now, 0.015);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (playPromiseRefs.current[tab]) {
          try { await playPromiseRefs.current[tab]; } catch (e) {}
        }
        audioRefs[tab].current!.pause();
        audioRefs[tab].current!.src = '';
      }
    };
    stopAudio();
    
    setTimeout(() => setIsClearing(false), 500);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const analyzeLevel = useCallback(async (url: string): Promise<{ rms: number, waveform: number[], bpm?: number, firstBeat?: number }> => {
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
  }, []);

  // Analysis Worker Effect
  useEffect(() => {
    if (isWorkerBusy || analysisQueue.length === 0) return;

  const processQueue = async () => {
      setIsWorkerBusy(true);
      const trackId = analysisQueue[0];
      
      // Find track in any playlist
      let track: Track | undefined;
      let pIdx = -1;
      for (let i = 0; i < NUM_PLAYLISTS; i++) {
        track = playlists[i].find(t => t.id === trackId);
        if (track) {
          pIdx = i;
          break;
        }
      }

      if (!track || pIdx === -1) {
        setAnalysisQueue(prev => prev.slice(1));
        setIsWorkerBusy(false);
        return;
      }

      console.log(`Analyzing track: ${track.title} (${analysisQueue.length} remaining)`);

      try {
        const [metadata, analysis] = await Promise.all([
          new Promise<{ duration: number, durationStr: string }>((resolve) => {
            const tempAudio = new Audio();
            tempAudio.src = track!.url;
            tempAudio.onloadedmetadata = () => resolve({
              duration: tempAudio.duration,
              durationStr: formatTime(tempAudio.duration)
            });
            tempAudio.onerror = () => resolve({ duration: 0, durationStr: "--:--" });
            setTimeout(() => resolve({ duration: 0, durationStr: "--:--" }), 5000);
          }),
          analyzeLevel(track.url)
        ]);

        setPlaylists(prev => {
          const next = [...prev];
          next[pIdx] = next[pIdx].map(t => t.id === trackId ? { 
            ...t, 
            duration: metadata.durationStr, 
            fullDuration: metadata.duration,
            averageLevel: analysis.rms, 
            waveformData: analysis.waveform,
            endTime: metadata.duration,
            startTime: analysis.firstBeat || 0,
            bpm: analysis.bpm,
            firstBeat: analysis.firstBeat,
            isAnalyzing: false 
          } : t);
          return next;
        });
      } catch (e) {
        console.error("Error analyzing", track.title, e);
        setPlaylists(prev => {
          const next = [...prev];
          next[pIdx] = next[pIdx].map(t => t.id === trackId ? { ...t, isAnalyzing: false } : t);
          return next;
        });
      } finally {
        setAnalysisQueue(prev => prev.slice(1));
        setIsWorkerBusy(false);
      }
    };

    processQueue();
  }, [analysisQueue, isWorkerBusy, playlist, analyzeLevel]);

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

    setPlaylists(prev => {
      const next = [...prev];
      next[activeTabRef.current] = [...next[activeTabRef.current], ...newTracks];
      return next;
    });
    setAnalysisQueue(prev => [...prev, ...newTracks.map(t => t.id)]);
    setLoadError(null);
  };

  // Update maxAverageLevel whenever playlist changes
  useEffect(() => {
    const levels = playlist.filter(t => !t.isAnalyzing).map(t => t.averageLevel || 0.1);
    if (levels.length > 0) {
      setMaxAverageLevel(Math.max(...levels));
    }
  }, [playlist]);

  const switchTrack = useCallback(async (index: number, tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    // Cancel any ongoing fade out
    if (fadeIntervalRefs.current[tab]) {
      clearTimeout(fadeIntervalRefs.current[tab]!);
      fadeIntervalRefs.current[tab] = null;
    }

    // Cancel any ongoing crossfade
    if (crossfadeTimeoutRefs.current[tab]) {
      clearTimeout(crossfadeTimeoutRefs.current[tab]!);
      crossfadeTimeoutRefs.current[tab] = null;
    }
    if (nextAudioRefs[tab].current) {
      nextAudioRefs[tab].current!.pause();
    }
    isCrossfadingRefs.current[tab] = false;

    // Fade out current track if playing
    if (statesRef.current[tab].isPlaying && mainGainsRef.current[tab] && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
      mainGainsRef.current[tab]!.gain.setValueAtTime(mainGainsRef.current[tab]!.gain.value, now);
      mainGainsRef.current[tab]!.gain.setTargetAtTime(0, now, 0.015); // Super short 15ms fade
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const targetTrack = playlistsRef.current[tab][index];
    if (!targetTrack) return;

    setStates(prev => {
      const next = [...prev];
      next[tab] = {
        ...next[tab],
        currentTrackIndex: index,
        selectedTrackIndex: index,
        currentTime: targetTrack.startTime || 0,
        progress: 0,
        isPlaying: true,
        isFading: false
      };
      return next;
    });
  }, []);

  const handlePlayPause = useCallback(async (tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    const audio = audioRefs[tab].current;
    const playlist = playlistsRef.current[tab];
    const state = statesRef.current[tab];

    if (!audio || playlist.length === 0) return;
    
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // If selected track is different from current playing track, switch to it immediately
    if (state.selectedTrackIndex !== state.currentTrackIndex) {
      if (fadeIntervalRefs.current[tab]) {
        clearTimeout(fadeIntervalRefs.current[tab]!);
        fadeIntervalRefs.current[tab] = null;
      }
      
      switchTrack(state.selectedTrackIndex, tab);
      return;
    }

    if (state.isPlaying || isCrossfadingRefs.current[tab]) {
      if (state.isFading || isCrossfadingRefs.current[tab]) {
        // Cancel any ongoing fade out
        if (fadeIntervalRefs.current[tab]) {
          clearTimeout(fadeIntervalRefs.current[tab]!);
          fadeIntervalRefs.current[tab] = null;
        }

        // Cancel any ongoing crossfade
        if (crossfadeTimeoutRefs.current[tab]) {
          clearTimeout(crossfadeTimeoutRefs.current[tab]!);
          crossfadeTimeoutRefs.current[tab] = null;
        }
        
        if (isCrossfadingRefs.current[tab]) {
          // If we were crossfading, we need to make sure the main audio is at full volume
          // and the next audio is stopped.
          if (mainGainsRef.current[tab] && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const currentTrack = playlist[state.currentTrackIndex];
            const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
            const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
            const finalGain = baseGain * trim;
            mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
            mainGainsRef.current[tab]!.gain.setTargetAtTime(finalGain, now, 0.1);
          }
          if (nextAudioRefs[tab].current) {
            nextAudioRefs[tab].current!.pause();
          }
          isCrossfadingRefs.current[tab] = false;
        }

        setStates(prev => {
          const next = [...prev];
          next[tab] = { ...next[tab], isPlaying: true, isFading: false };
          return next;
        });
        return;
      }
      // Start smooth pause
      if (mainGainsRef.current[tab] && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
        mainGainsRef.current[tab]!.gain.setValueAtTime(mainGainsRef.current[tab]!.gain.value, now);
        mainGainsRef.current[tab]!.gain.setTargetAtTime(0, now, 0.015); // Super short 15ms fade
        
        setStates(prev => {
          const next = [...prev];
          next[tab] = { ...next[tab], isPlaying: false };
          return next;
        });
      } else {
        setStates(prev => {
          const next = [...prev];
          next[tab] = { ...next[tab], isPlaying: false };
          return next;
        });
      }
    } else {
      // Play
      if (fadeIntervalRefs.current[tab]) {
        clearTimeout(fadeIntervalRefs.current[tab]!);
        fadeIntervalRefs.current[tab] = null;
      }
      
      // Ensure we start from silence for a smooth fade-in
      if (mainGainsRef.current[tab] && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
        mainGainsRef.current[tab]!.gain.setValueAtTime(0, now);
      }
      
      setStates(prev => {
        const next = [...prev];
        next[tab] = { ...next[tab], isPlaying: true, isFading: false };
        return next;
      });
    }
  }, [initAudioEngine, getNormalizationGain, TARGET_LUFS_GAIN, switchTrack]);

  const startCrossfade = useCallback(async (tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    const audio = audioRefs[tab].current;
    const nextAudio = nextAudioRefs[tab].current;
    const mainGain = mainGainsRef.current[tab];
    const nextGain = nextGainsRef.current[tab];
    const playlist = playlistsRef.current[tab];
    const state = statesRef.current[tab];

    if (isCrossfadingRefs.current[tab] || !audio || !nextAudio || !mainGain || !nextGain || !audioContextRef.current) return;
    
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
    
    isCrossfadingRefs.current[tab] = true;
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    const baseGain = state.isLoudnessNormalized ? getNormalizationGain(nextTrack) : TARGET_LUFS_GAIN;

    // --- Beat Alignment for Looping ---
    let nextStartTime = nextTrack.startTime || 0;
    if (isLooping && nextTrack.bpm && nextTrack.bpm > 0) {
      const beatInterval = 60 / nextTrack.bpm;
      const currentPos = audio.currentTime;
      const elapsedSinceStart = currentPos - (currentTrack.startTime || 0);
      
      const beatsPlayed = elapsedSinceStart / beatInterval;
      const fractionalBeat = beatsPlayed % 1;
      nextStartTime = (nextTrack.startTime || 0) + (fractionalBeat * beatInterval);
    }

    // Prepare next audio
    nextAudio.src = nextTrack.url;
    nextAudio.load();
    
    // Fade out current
    mainGain.gain.cancelScheduledValues(now);
    mainGain.gain.setValueAtTime(mainGain.gain.value, now);
    mainGain.gain.setTargetAtTime(0, now, CROSSFADE_DURATION / 3);
    
    // Fade in next
    nextGain.gain.cancelScheduledValues(now);
    nextGain.gain.setValueAtTime(0, now);
    nextGain.gain.setTargetAtTime(baseGain, now, CROSSFADE_DURATION / 3);
    
    try {
      // Wait for next audio to be ready
      if (nextAudio.readyState < 2) {
        await new Promise((resolve) => {
          const onCanPlay = () => {
            nextAudio?.removeEventListener('canplay', onCanPlay);
            resolve(null);
          };
          nextAudio?.addEventListener('canplay', onCanPlay);
          setTimeout(resolve, 2000);
        });
      }
      if (nextAudio) {
        nextAudio.currentTime = nextStartTime;
      }
      await nextAudio.play();
    } catch (e) {
      console.error("Crossfade play failed", e);
    }
    
    crossfadeTimeoutRefs.current[tab] = window.setTimeout(async () => {
      if (!isMountedRef.current) return;
      console.log(`Crossfade timeout completed. Syncing audio elements...`);
      const currentAudio = audioRefs[tab].current;
      const currentNextAudio = nextAudioRefs[tab].current;
      const currentMainGain = mainGainsRef.current[tab];
      const currentNextGain = nextGainsRef.current[tab];

      if (currentAudio && currentNextAudio && currentMainGain && currentNextGain) {
        try {
          currentAudio.pause();
          currentAudio.src = nextTrack.url;
          currentAudio.load();
          
          await new Promise((resolve) => {
            const onLoaded = () => {
              currentAudio?.removeEventListener('loadedmetadata', onLoaded);
              resolve(null);
            };
            currentAudio?.addEventListener('loadedmetadata', onLoaded);
            setTimeout(resolve, 1000); // Fallback
          });

          if (!isMountedRef.current) return;
          currentAudio.currentTime = currentNextAudio.currentTime;
          lastLoadedUrlRefs.current[tab] = nextTrack.url;
          
          // Reset gains to primary
          const currentNow = audioContextRef.current?.currentTime || 0;
          currentMainGain.gain.cancelScheduledValues(currentNow);
          currentMainGain.gain.setValueAtTime(baseGain, currentNow);
          currentNextGain.gain.cancelScheduledValues(currentNow);
          currentNextGain.gain.setValueAtTime(0, currentNow);
          
          await currentAudio.play();
          currentNextAudio.pause();
          
          setStates(prev => {
            const next = [...prev];
            next[tab] = { 
              ...next[tab], 
              currentTrackIndex: nextIndex, 
              selectedTrackIndex: nextIndex, 
              currentTime: currentAudio?.currentTime || 0 
            };
            return next;
          });
        } catch (err) {
          console.error("Error during crossfade sync/play:", err);
          setLoadError(`Crossfade failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
          isCrossfadingRefs.current[tab] = false;
          crossfadeTimeoutRefs.current[tab] = null;
        }
      }
    }, CROSSFADE_DURATION * 1000) as unknown as number;
  }, [getNormalizationGain, TARGET_LUFS_GAIN]);

  const cancelFadeOut = useCallback((tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    const state = statesRef.current[tab];
    const playlist = playlistsRef.current[tab];
    const currentTrack = playlist[state.currentTrackIndex];
    const mainGain = mainGainsRef.current[tab];

    if (!state.isFading || !mainGain || !audioContextRef.current) return;

    if (fadeIntervalRefs.current[tab]) {
      clearTimeout(fadeIntervalRefs.current[tab]!);
      fadeIntervalRefs.current[tab] = null;
    }

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
    const trim = currentTrack?.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
    const finalGain = baseGain * trim;

    mainGain.gain.cancelScheduledValues(now);
    mainGain.gain.setValueAtTime(mainGain.gain.value, now);
    mainGain.gain.setTargetAtTime(finalGain, now, 0.1); // Quick restore

    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], isFading: false };
      return next;
    });
  }, [getNormalizationGain, TARGET_LUFS_GAIN]);

  const startFadeOut = useCallback((tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    const audio = audioRefs[tab].current;
    const mainGain = mainGainsRef.current[tab];
    const state = statesRef.current[tab];
    const playlist = playlistsRef.current[tab];

    if (!audio || !mainGain || !audioContextRef.current || state.isFading || !state.isPlaying) return;

    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], isFading: true };
      return next;
    });

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    const duration = state.fadeOutDuration;

    mainGain.gain.cancelScheduledValues(now);
    mainGain.gain.setValueAtTime(mainGain.gain.value, now);
    mainGain.gain.setTargetAtTime(0, now, duration / 4);

    fadeIntervalRefs.current[tab] = window.setTimeout(() => {
      const currentAudio = audioRefs[tab].current;
      const currentMainGain = mainGainsRef.current[tab];
      const currentState = statesRef.current[tab];
      const currentPlaylist = playlistsRef.current[tab];

      if (currentAudio && currentMainGain) {
        currentAudio.pause();
        currentMainGain.gain.setValueAtTime(0, audioContextRef.current?.currentTime || 0);
        
        const currentTrack = currentPlaylist[currentState.currentTrackIndex];
        const nextIndex = (currentState.isShuffle) ? Math.floor(Math.random() * currentPlaylist.length) : (currentState.currentTrackIndex + 1) % currentPlaylist.length;
        
        if (currentTrack.playbackMode === PlaybackMode.FOLLOW) {
          setStates(prev => {
            const next = [...prev];
            next[tab] = { ...next[tab], isPlaying: true, isFading: false, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, progress: 0 };
            return next;
          });
        } else if (currentTrack.playbackMode === PlaybackMode.ADVANCE) {
          setStates(prev => {
            const next = [...prev];
            next[tab] = { ...next[tab], isPlaying: false, isFading: false, currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, progress: 0 };
            return next;
          });
        } else {
          setStates(prev => {
            const next = [...prev];
            next[tab] = { ...next[tab], isPlaying: false, isFading: false, currentTime: 0, progress: 0 };
            return next;
          });
          currentAudio.currentTime = 0;
        }
      }
    }, duration * 1000) as unknown as number;
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut triggers when typing in input fields (though our controls are mostly ranges)
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;

      const tab = activeTabRef.current;
      const playlist = playlistsRef.current[tab];
      const state = statesRef.current[tab];

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'Escape':
          e.preventDefault();
          if (state.isFading) {
            cancelFadeOut();
          } else {
            startFadeOut();
          }
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
          setStates(prev => {
            const next = [...prev];
            next[tab] = { 
              ...next[tab], 
              currentTrackIndex: next[tab].selectedTrackIndex, 
              isPlaying: true, 
              currentTime: 0,
              progress: 0 
            };
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setStates(prev => {
            const next = [...prev];
            next[tab] = {
              ...next[tab],
              selectedTrackIndex: next[tab].selectedTrackIndex > 0 ? next[tab].selectedTrackIndex - 1 : playlist.length - 1
            };
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setStates(prev => {
            const next = [...prev];
            next[tab] = {
              ...next[tab],
              selectedTrackIndex: next[tab].selectedTrackIndex < playlist.length - 1 ? next[tab].selectedTrackIndex + 1 : 0
            };
            return next;
          });
          break;
        case 'Digit1':
          if (e.altKey) { e.preventDefault(); setActiveTab(0); }
          break;
        case 'Digit2':
          if (e.altKey) { e.preventDefault(); setActiveTab(1); }
          break;
        case 'Digit3':
          if (e.altKey) { e.preventDefault(); setActiveTab(2); }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, startFadeOut, toggleDucking, toggleShuffle]);

  // Scroll active track into view
  useEffect(() => {
    const activeElement = document.querySelector('.track-selected');
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [state.selectedTrackIndex]);

  const updateTrackRange = useCallback((index: number, start?: number, end?: number) => {
    const tab = activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
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
      next[tab] = newPlaylist;
      return next;
    });
  }, []);

  const updateTrackVolumeTrim = useCallback((index: number, trim: number, tabIndex?: number) => {
    const tab = tabIndex !== undefined ? tabIndex : activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
      newPlaylist[index] = { ...newPlaylist[index], volumeTrim: trim };
      next[tab] = newPlaylist;
      return next;
    });
  }, []);

  const updateTrackTitle = useCallback((index: number, title: string) => {
    const tab = activeTabRef.current;
    setPlaylists(prev => {
      const next = [...prev];
      const newPlaylist = [...next[tab]];
      newPlaylist[index] = { ...newPlaylist[index], title };
      next[tab] = newPlaylist;
      return next;
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    // WebSocket for OSC
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    let socket: WebSocket;

    const connectWS = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('OSC WebSocket connected');
        setOscStatus('connected');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'OSC_MESSAGE') {
            const { address, args } = msg.data;
            // Extract value from OSC argument (handles both metadata and raw values)
            const value = args[0]?.value !== undefined ? args[0].value : args[0];

            console.log(`OSC: ${address} = ${value}`);

            const catchErr = (err: any) => console.error(`OSC action error (${address}):`, err);

            // Target specific tab if address starts with /1/, /2/, or /3/
            let targetTab = activeTabRef.current;
            let finalAddress = address;
            
            const tabMatch = address.match(/^\/([1-3])(\/.*)/);
            if (tabMatch) {
              targetTab = parseInt(tabMatch[1]) - 1;
              finalAddress = tabMatch[2];
            }

            const state = statesRef.current[targetTab];
            const playlist = playlistsRef.current[targetTab];

            switch (finalAddress) {
              case '/play':
                if (value === 1 || value === true || value === '1') {
                  if (!state.isPlaying) handlePlayPause(targetTab).catch(catchErr);
                } else if (value === 0 || value === false || value === '0') {
                  if (state.isPlaying) handlePlayPause(targetTab).catch(catchErr);
                }
                break;
              case '/pause':
                if (state.isPlaying) handlePlayPause(targetTab).catch(catchErr);
                break;
              case '/toggle':
                handlePlayPause(targetTab).catch(catchErr);
                break;
              case '/fade':
                startFadeOut(targetTab);
                break;
              case '/duck':
                toggleDucking(targetTab);
                break;
              case '/volume':
                if (typeof value === 'number') {
                  // Map 0-1 to 0-2 (volume trim)
                  updateTrackVolumeTrim(state.selectedTrackIndex, value * 2, targetTab);
                }
                break;
              case '/track':
                if (typeof value === 'number') {
                  const idx = Math.floor(value);
                  if (idx >= 0 && idx < playlist.length) {
                    switchTrack(idx, targetTab).catch(catchErr);
                  }
                }
                break;
              case '/next':
                if (playlist.length > 0) {
                  const nextIdx = (state.currentTrackIndex + 1) % playlist.length;
                  switchTrack(nextIdx, targetTab).catch(catchErr);
                }
                break;
              case '/prev':
                if (playlist.length > 0) {
                  const prevIdx = (state.currentTrackIndex - 1 + playlist.length) % playlist.length;
                  switchTrack(prevIdx, targetTab).catch(catchErr);
                }
                break;
              case '/title':
                if (typeof value === 'string') {
                  setPlaylistTitles(prev => {
                    const next = [...prev];
                    next[targetTab] = value;
                    return next;
                  });
                }
                break;
            }
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        if (isMountedRef.current) {
          console.log('OSC WebSocket disconnected, retrying...');
          setOscStatus('disconnected');
          setTimeout(connectWS, 3000);
        }
      };

      socket.onerror = () => {
        setOscStatus('error');
      };
    };

    connectWS();

    return () => {
      isMountedRef.current = false;
      if (socket) {
        // Only close if it's not already closed or closing
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
    };
  }, [handlePlayPause, startFadeOut, toggleDucking, switchTrack, updateTrackVolumeTrim, playlist.length]);

  const handleSeek = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const tab = activeTabRef.current;
    const state = statesRef.current[tab];
    const playlist = playlistsRef.current[tab];
    const audio = audioRefs[tab].current;
    const currentTrack = playlist[state.currentTrackIndex];

    if (state.isFading || isCrossfadingRefs.current[tab]) return; 
    const time = parseFloat(e.target.value);
    
    if (audio && currentTrack) {
      const startTime = currentTrack.startTime || 0;
      const endTime = currentTrack.endTime || state.duration;
      const clampedTime = Math.max(startTime, Math.min(endTime, time));

      // Anti-click fade dip
      if (state.isPlaying && mainGainsRef.current[tab] && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        mainGainsRef.current[tab]!.gain.cancelScheduledValues(now);
        mainGainsRef.current[tab]!.gain.setValueAtTime(mainGainsRef.current[tab]!.gain.value, now);
        mainGainsRef.current[tab]!.gain.setTargetAtTime(0, now, 0.01); // 10ms dip
        
        // Very short wait for the dip
        await new Promise(resolve => setTimeout(resolve, 30));
        
        audio.currentTime = clampedTime;
        
        const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
        const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
        const finalGain = baseGain * trim;
        mainGainsRef.current[tab]!.gain.setTargetAtTime(finalGain, ctx.currentTime, 0.015); // 15ms fade back in
      } else {
        audio.currentTime = clampedTime;
      }
      
      setStates(prev => {
        const next = [...prev];
        next[tab] = { ...next[tab], currentTime: clampedTime, progress: (clampedTime / state.duration) * 100 };
        return next;
      });
    }
  }, [getNormalizationGain, TARGET_LUFS_GAIN]);

  const handleDragStart = (index: number) => { 
    const tab = activeTabRef.current;
    if (!statesRef.current[tab].isFading) setDraggedItemIndex(index); 
  };
  const handleDrop = (dropIndex: number) => {
    const tab = activeTabRef.current;
    const playlist = playlistsRef.current[tab];
    const state = statesRef.current[tab];

    if (draggedItemIndex === null || draggedItemIndex === dropIndex) { setDraggedItemIndex(null); return; }
    const newPlaylist = [...playlist];
    const [movedItem] = newPlaylist.splice(draggedItemIndex, 1);
    newPlaylist.splice(dropIndex, 0, movedItem);
    let newCurrentIndex = state.currentTrackIndex;
    if (draggedItemIndex === state.currentTrackIndex) newCurrentIndex = dropIndex;
    else if (draggedItemIndex < state.currentTrackIndex && dropIndex >= state.currentTrackIndex) newCurrentIndex--;
    else if (draggedItemIndex > state.currentTrackIndex && dropIndex <= state.currentTrackIndex) newCurrentIndex++;
    
    setPlaylists(prev => {
      const next = [...prev];
      next[tab] = newPlaylist;
      return next;
    });
    setStates(prev => {
      const next = [...prev];
      next[tab] = { ...next[tab], currentTrackIndex: newCurrentIndex };
      return next;
    });
    setDraggedItemIndex(null);
  };

  // Explicit useEffect calls for each playlist's audio playback (Rules of Hooks)
  useEffect(() => {
    let isStale = false;
    const i = 0;
    const audio = audioRefs[i].current;
    const playlist = playlists[i];
    const state = states[i];
    const currentTrack = playlist[state.currentTrackIndex];

    if (!audio || !currentTrack || !currentTrack.url) return;
    
    const loadAndPlay = async () => {
      if (!currentTrack.url) {
        console.warn(`Cannot play track "${currentTrack.title}": No URL provided.`);
        if (i === activeTab) setLoadError(`Missing audio file for: ${currentTrack.title}`);
        return;
      }

      if (lastLoadedUrlRefs.current[i] !== currentTrack.url) {
        lastLoadedUrlRefs.current[i] = currentTrack.url;
        if (i === activeTab) setLoadError(null);
        if (playPromiseRefs.current[i]) {
          try { await playPromiseRefs.current[i]; } catch (e) {}
        }
        if (isStale) return;
        if (mainGainsRef.current[i] && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
          mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
          mainGainsRef.current[i]!.gain.setTargetAtTime(0, now, 0.015);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (isStale) return;
        audio.pause();
        audio.src = currentTrack.url;
        audio.load();
        audio.currentTime = currentTrack.startTime || 0;
      } else if (state.isPlaying && audio.currentTime < (currentTrack.startTime || 0)) {
        audio.currentTime = currentTrack.startTime || 0;
      }

      if (state.isPlaying) {
        if (currentTrack.isAnalyzing) return;
        try {
          if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
          if (mainGainsRef.current[i] && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
            const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
            const finalGain = baseGain * trim;
            mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
            if (audio.currentTime <= (currentTrack.startTime || 0) + 0.1) {
              mainGainsRef.current[i]!.gain.setValueAtTime(0, now);
            } else {
              mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
            }
            mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.02);
          }
          if (isStale) return;
          if (audio.readyState < 2) {
            await new Promise((resolve) => {
              const onCanPlay = () => { audio.removeEventListener('canplay', onCanPlay); resolve(null); };
              const onError = () => { audio.removeEventListener('error', onError); resolve(null); };
              audio.addEventListener('canplay', onCanPlay);
              audio.addEventListener('error', onError);
              setTimeout(() => { audio.removeEventListener('canplay', onCanPlay); audio.removeEventListener('error', onError); resolve(null); }, 2000);
            });
          }
          if (isStale) return;
          playPromiseRefs.current[i] = audio.play();
          await playPromiseRefs.current[i];
          playPromiseRefs.current[i] = null;
        } catch (e: any) {
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            if (audio.error && i === activeTab) setLoadError("Could not load audio file.");
          }
          playPromiseRefs.current[i] = null;
        }
      } else {
        if (playPromiseRefs.current[i]) { try { await playPromiseRefs.current[i]; } catch (e) {} }
        if (mainGainsRef.current[i] && audioContextRef.current) await new Promise(resolve => setTimeout(resolve, 80));
        if (isStale) return;
        audio.pause();
      }
    };
    loadAndPlay();
    return () => { isStale = true; };
  }, [playlists[0][states[0].currentTrackIndex]?.id, playlists[0][states[0].currentTrackIndex]?.isAnalyzing, states[0].isPlaying, states[0].isLoudnessNormalized, getNormalizationGain]);

  useEffect(() => {
    let isStale = false;
    const i = 1;
    const audio = audioRefs[i].current;
    const playlist = playlists[i];
    const state = states[i];
    const currentTrack = playlist[state.currentTrackIndex];

    if (!audio || !currentTrack || !currentTrack.url) return;
    
    const loadAndPlay = async () => {
      if (!currentTrack.url) {
        if (i === activeTab) setLoadError(`Missing audio file for: ${currentTrack.title}`);
        return;
      }

      if (lastLoadedUrlRefs.current[i] !== currentTrack.url) {
        lastLoadedUrlRefs.current[i] = currentTrack.url;
        if (i === activeTab) setLoadError(null);
        if (playPromiseRefs.current[i]) { try { await playPromiseRefs.current[i]; } catch (e) {} }
        if (isStale) return;
        if (mainGainsRef.current[i] && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
          mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
          mainGainsRef.current[i]!.gain.setTargetAtTime(0, now, 0.015);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (isStale) return;
        audio.pause();
        audio.src = currentTrack.url;
        audio.load();
        audio.currentTime = currentTrack.startTime || 0;
      } else if (state.isPlaying && audio.currentTime < (currentTrack.startTime || 0)) {
        audio.currentTime = currentTrack.startTime || 0;
      }

      if (state.isPlaying) {
        if (currentTrack.isAnalyzing) return;
        try {
          if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
          if (mainGainsRef.current[i] && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
            const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
            const finalGain = baseGain * trim;
            mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
            if (audio.currentTime <= (currentTrack.startTime || 0) + 0.1) {
              mainGainsRef.current[i]!.gain.setValueAtTime(0, now);
            } else {
              mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
            }
            mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.02);
          }
          if (isStale) return;
          if (audio.readyState < 2) {
            await new Promise((resolve) => {
              const onCanPlay = () => { audio.removeEventListener('canplay', onCanPlay); resolve(null); };
              const onError = () => { audio.removeEventListener('error', onError); resolve(null); };
              audio.addEventListener('canplay', onCanPlay);
              audio.addEventListener('error', onError);
              setTimeout(() => { audio.removeEventListener('canplay', onCanPlay); audio.removeEventListener('error', onError); resolve(null); }, 2000);
            });
          }
          if (isStale) return;
          playPromiseRefs.current[i] = audio.play();
          await playPromiseRefs.current[i];
          playPromiseRefs.current[i] = null;
        } catch (e: any) {
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            if (audio.error && i === activeTab) setLoadError("Could not load audio file.");
          }
          playPromiseRefs.current[i] = null;
        }
      } else {
        if (playPromiseRefs.current[i]) { try { await playPromiseRefs.current[i]; } catch (e) {} }
        if (mainGainsRef.current[i] && audioContextRef.current) await new Promise(resolve => setTimeout(resolve, 80));
        if (isStale) return;
        audio.pause();
      }
    };
    loadAndPlay();
    return () => { isStale = true; };
  }, [playlists[1][states[1].currentTrackIndex]?.id, playlists[1][states[1].currentTrackIndex]?.isAnalyzing, states[1].isPlaying, states[1].isLoudnessNormalized, getNormalizationGain]);

  useEffect(() => {
    let isStale = false;
    const i = 2;
    const audio = audioRefs[i].current;
    const playlist = playlists[i];
    const state = states[i];
    const currentTrack = playlist[state.currentTrackIndex];

    if (!audio || !currentTrack || !currentTrack.url) return;
    
    const loadAndPlay = async () => {
      if (!currentTrack.url) {
        if (i === activeTab) setLoadError(`Missing audio file for: ${currentTrack.title}`);
        return;
      }

      if (lastLoadedUrlRefs.current[i] !== currentTrack.url) {
        lastLoadedUrlRefs.current[i] = currentTrack.url;
        if (i === activeTab) setLoadError(null);
        if (playPromiseRefs.current[i]) { try { await playPromiseRefs.current[i]; } catch (e) {} }
        if (isStale) return;
        if (mainGainsRef.current[i] && audioContextRef.current) {
          const now = audioContextRef.current.currentTime;
          mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
          mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
          mainGainsRef.current[i]!.gain.setTargetAtTime(0, now, 0.015);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (isStale) return;
        audio.pause();
        audio.src = currentTrack.url;
        audio.load();
        audio.currentTime = currentTrack.startTime || 0;
      } else if (state.isPlaying && audio.currentTime < (currentTrack.startTime || 0)) {
        audio.currentTime = currentTrack.startTime || 0;
      }

      if (state.isPlaying) {
        if (currentTrack.isAnalyzing) return;
        try {
          if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
          if (mainGainsRef.current[i] && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
            const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
            const finalGain = baseGain * trim;
            mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
            if (audio.currentTime <= (currentTrack.startTime || 0) + 0.1) {
              mainGainsRef.current[i]!.gain.setValueAtTime(0, now);
            } else {
              mainGainsRef.current[i]!.gain.setValueAtTime(mainGainsRef.current[i]!.gain.value, now);
            }
            mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.02);
          }
          if (isStale) return;
          if (audio.readyState < 2) {
            await new Promise((resolve) => {
              const onCanPlay = () => { audio.removeEventListener('canplay', onCanPlay); resolve(null); };
              const onError = () => { audio.removeEventListener('error', onError); resolve(null); };
              audio.addEventListener('canplay', onCanPlay);
              audio.addEventListener('error', onError);
              setTimeout(() => { audio.removeEventListener('canplay', onCanPlay); audio.removeEventListener('error', onError); resolve(null); }, 2000);
            });
          }
          if (isStale) return;
          playPromiseRefs.current[i] = audio.play();
          await playPromiseRefs.current[i];
          playPromiseRefs.current[i] = null;
        } catch (e: any) {
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            if (audio.error && i === activeTab) setLoadError("Could not load audio file.");
          }
          playPromiseRefs.current[i] = null;
        }
      } else {
        if (playPromiseRefs.current[i]) { try { await playPromiseRefs.current[i]; } catch (e) {} }
        if (mainGainsRef.current[i] && audioContextRef.current) await new Promise(resolve => setTimeout(resolve, 80));
        if (isStale) return;
        audio.pause();
      }
    };
    loadAndPlay();
    return () => { isStale = true; };
  }, [playlists[2][states[2].currentTrackIndex]?.id, playlists[2][states[2].currentTrackIndex]?.isAnalyzing, states[2].isPlaying, states[2].isLoudnessNormalized, getNormalizationGain]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-xl h-[850px] flex flex-col gap-8 p-8 rounded-[2.5rem] border border-white/5 bg-zinc-900/50 backdrop-blur-xl shadow-2xl overflow-hidden">
        
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

          {/* Playlist Tabs */}
          <div className="flex items-center gap-1 mb-4 p-1 rounded-2xl bg-black/20 border border-white/5">
            {[0, 1, 2].map((tabIndex) => (
              <div
                key={tabIndex}
                className={`flex-1 relative group rounded-xl transition-all duration-300 ${
                  activeTab === tabIndex 
                    ? 'bg-white/10 text-white shadow-lg' 
                    : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                }`}
              >
                {editingTabIndex === tabIndex ? (
                  <input
                    autoFocus
                    className="w-full bg-transparent border-none outline-none py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-center"
                    value={playlistTitles[tabIndex]}
                    onChange={(e) => {
                      const next = [...playlistTitles];
                      next[tabIndex] = e.target.value;
                      setPlaylistTitles(next);
                    }}
                    onBlur={() => setEditingTabIndex(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingTabIndex(null)}
                  />
                ) : (
                  <button
                    onClick={() => setActiveTab(tabIndex)}
                    onDoubleClick={() => setEditingTabIndex(tabIndex)}
                    className="w-full py-2 px-4 text-[10px] font-bold tracking-wider uppercase text-center flex items-center justify-center gap-2"
                  >
                    {playlistTitles[tabIndex]}
                    {playlists[tabIndex].length > 0 && (
                      <span className="ml-2 opacity-50">({playlists[tabIndex].length})</span>
                    )}
                    {states[tabIndex].isPlaying && (
                      <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold tracking-tight text-white">Sound File Player</h1>
            </div>
            <div className={`flex items-center gap-3 transition-all duration-500 ${states[activeTab].isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {analysisQueue.length > 0 && (
                <div 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-right-4"
                  title={`${analysisQueue.length} tracks remaining in analysis queue`}
                >
                  <i className="fa-solid fa-microchip animate-pulse"></i>
                  <span>Analyzing {analysisQueue.length} {analysisQueue.length === 1 ? 'track' : 'tracks'}</span>
                </div>
              )}
              <div 
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-bold uppercase tracking-widest transition-all ${
                  oscStatus === 'connected' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : oscStatus === 'error'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : 'bg-white/5 border-white/5 text-white/20'
                }`}
                title={`OSC: ${oscStatus}`}
              >
                <div className={`w-1 h-1 rounded-full ${
                  oscStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-current'
                }`}></div>
                OSC
              </div>
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
              <div className="p-6 border-b border-white/5 h-[110px] flex flex-col justify-center">
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
                        >
                          {/* White Playhead Highlight */}
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full translate-x-1/2"></div>
                        </div>
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
                  isPlaying={states[activeTab].isPlaying} 
                  isSelectionDifferent={states[activeTab].selectedTrackIndex !== states[activeTab].currentTrackIndex}
                  onPlayPause={handlePlayPause} 
                  onFadeOut={startFadeOut} 
                  onCancelFade={cancelFadeOut}
                  onToggleDuck={toggleDucking} 
                  isFading={states[activeTab].isFading} 
                  isDucked={states[activeTab].isDucked} 
                  isEnding={states[activeTab].duration - states[activeTab].currentTime <= 10}
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
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full transition-transform"></div>
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
                  
                  <div className="w-full flex justify-between items-center text-[10px] font-mono opacity-40 mb-6">
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

                  {/* Volume Trim Slider moved from playlist to edit window */}
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">VOLUME</span>
                    </div>
                    
                    <div className="flex-1 flex items-center gap-3">
                      <button 
                        onClick={() => {
                          const currentTrim = selectedTrack.volumeTrim !== undefined ? selectedTrack.volumeTrim : 1.0;
                          updateTrackVolumeTrim(state.selectedTrackIndex, Math.max(0, currentTrim * Math.pow(10, -1/20)));
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-xs text-white/40 hover:text-white transition-colors"
                        title="-1dB"
                      >
                        -
                      </button>

                      <input 
                        type="range" 
                        min="0" 
                        max="2" 
                        step="0.01" 
                        value={selectedTrack.volumeTrim !== undefined ? selectedTrack.volumeTrim : 1.0} 
                        onChange={(e) => updateTrackVolumeTrim(state.selectedTrackIndex, parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white hover:bg-white/20 transition-colors"
                      />

                      <button 
                        onClick={() => {
                          const currentTrim = selectedTrack.volumeTrim !== undefined ? selectedTrack.volumeTrim : 1.0;
                          updateTrackVolumeTrim(state.selectedTrackIndex, Math.min(2, currentTrim * Math.pow(10, 1/20)));
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-xs text-white/40 hover:text-white transition-colors"
                        title="+1dB"
                      >
                        +
                      </button>
                    </div>

                    <div className="min-w-[45px] text-right">
                      <span className="text-xs font-mono text-white/60">
                        {Math.round((selectedTrack.volumeTrim !== undefined ? selectedTrack.volumeTrim : 1.0) * 100)}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end mt-6">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="text-[9px] font-bold tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20"
                      title="Close editor"
                    >
                      <i className="fa-solid fa-xmark"></i> Close Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full p-12 bg-[#1a1a1a] rounded-3xl border border-white/10 shadow-xl flex items-center justify-center">
              <button onClick={() => folderInputRef.current?.click()} className="btn-primary px-12 py-5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em]">Load Folder</button>
            </div>
          )}
        </div>

        {playlist.length > 0 && !isEditing && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex items-center justify-between px-2 shrink-0">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Playlist</h3>
              <div className={`flex items-center gap-2 transition-all duration-500 ${state.isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <button onClick={toggleShuffle} className={`text-[10px] p-2 rounded-full border transition-all ${state.isShuffle ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white/60'}`} title="Shuffle (S)"><i className="fa-solid fa-shuffle"></i></button>
                <button onClick={clearPlaylist} className="text-[10px] p-2 rounded-full border bg-white/5 border-white/5 text-white/30 hover:text-rose-400 hover:bg-white/10 transition-all" title="Clear Playlist"><i className="fa-solid fa-trash-can"></i></button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="text-[10px] font-bold tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-3 bg-indigo-500/10 px-5 py-2.5 rounded-full border border-indigo-500/20 hover:shadow-[0_0_20px_rgba(129,140,248,0.3)] hover:-translate-y-0.5" 
                  title="Load more tracks"
                >
                  <i className="fa-solid fa-folder-open"></i> Load Tracks
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 pb-8">
            {playlists[activeTab].map((track, index) => (
              <TrackItem 
                key={track.id} 
                track={track} 
                index={index} 
                isActive={states[activeTab].currentTrackIndex === index} 
                isSelected={states[activeTab].selectedTrackIndex === index}
                onClick={() => {
                  if (states[activeTab].currentTrackIndex === index) {
                    handlePlayPause();
                  } else {
                    switchTrack(index);
                  }
                }} 
                onDragStart={handleDragStart} 
                onDragOver={() => {}} 
                onDrop={handleDrop}
                onTogglePlaybackMode={() => toggleTrackPlaybackMode(index)}
                onToggleLoop={() => toggleTrackLoop(index)}
                onRemove={() => removeTrack(index)}
                onEdit={() => {
                  setStates(prev => {
                    const next = [...prev];
                    next[activeTab] = { ...next[activeTab], selectedTrackIndex: index };
                    return next;
                  });
                  setIsEditing(true);
                }}
                onVolumeTrimChange={(trim) => updateTrackVolumeTrim(index, trim)}
              />
            ))}
          </div>
        </div>
      )}

        {[0, 1, 2].map(i => (
          <React.Fragment key={i}>
            <audio 
              ref={audioRefs[i]} 
              onTimeUpdate={() => { 
                if (!isDraggingProgress && audioRefs[i].current && playlists[i][states[i].currentTrackIndex]) {
                  const audio = audioRefs[i].current;
                  const state = states[i];
                  const currentTrack = playlists[i][state.currentTrackIndex];
                  const time = audio.currentTime;
                  const duration = audio.duration;
                  const endTime = currentTrack.endTime || duration;
                  
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], currentTime: time, progress: (time / duration) * 100 };
                    return next;
                  });
                  
                  // Handle End Time
                  if (duration > 0 && endTime > 0 && time >= endTime && time > 0.5 && state.isPlaying && !isCrossfadingRefs.current[i]) {
                    if (mainGainsRef.current[i] && audioContextRef.current) {
                      const now = audioContextRef.current.currentTime;
                      mainGainsRef.current[i]!.gain.setTargetAtTime(0, now, 0.015);
                    }

                    setTimeout(() => {
                      if (audioRefs[i].current) {
                        const event = new Event('ended');
                        audioRefs[i].current.dispatchEvent(event);
                      }
                    }, 40);
                  }

                  // Trigger crossfade
                  const startTime = currentTrack.startTime || 0;
                  const isNearEnd = endTime > 0 && time > endTime - CROSSFADE_DURATION && time > startTime + 1;
                  if ((state.isShuffle || currentTrack.isLooping) && isNearEnd && !isCrossfadingRefs.current[i]) {
                    // We need a way to call startCrossfade for a specific tab
                    // I'll update startCrossfade to take an optional tab index
                    startCrossfade(i);
                  }
                }
              }}
              onLoadedMetadata={() => {
                if (audioRefs[i].current) {
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], duration: audioRefs[i].current!.duration };
                    return next;
                  });
                }
              }}
              onError={(e) => {
                const audio = audioRefs[i].current;
                if (audio && audio.error) {
                  console.error(`Audio error (Tab ${i+1}):`, audio.error.message);
                  if (i === activeTab) setLoadError(`Playback failed: ${audio.error.message}`);
                }
              }}
              onEnded={() => { 
                const playlist = playlists[i];
                const state = states[i];
                if (playlist.length === 0 || isCrossfadingRefs.current[i]) return;
                const currentTrack = playlist[state.currentTrackIndex];
                
                if (currentTrack.isLooping) {
                  if (mainGainsRef.current[i] && audioContextRef.current) {
                    const now = audioContextRef.current.currentTime;
                    mainGainsRef.current[i]!.gain.cancelScheduledValues(now);
                    mainGainsRef.current[i]!.gain.setValueAtTime(0, now);
                    const baseGain = state.isLoudnessNormalized ? getNormalizationGain(currentTrack) : TARGET_LUFS_GAIN;
                    const trim = currentTrack.volumeTrim !== undefined ? currentTrack.volumeTrim : 1.0;
                    const finalGain = baseGain * trim;
                    mainGainsRef.current[i]!.gain.setTargetAtTime(finalGain, now, 0.015);
                  }
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], currentTime: 0, isPlaying: true };
                    return next;
                  });
                  if (audioRefs[i].current) audioRefs[i].current.currentTime = currentTrack.startTime || 0;
                  return;
                }

                const nextIndex = (state.isShuffle) ? Math.floor(Math.random() * playlist.length) : (state.currentTrackIndex + 1) % playlist.length;
                
                if (currentTrack.playbackMode === PlaybackMode.FOLLOW) {
                  if (nextIndex === state.currentTrackIndex && audioRefs[i].current) {
                    audioRefs[i].current.currentTime = playlist[nextIndex].startTime || 0;
                    audioRefs[i].current.play().catch(() => {});
                  }
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: true };
                    return next;
                  });
                } else if (currentTrack.playbackMode === PlaybackMode.ADVANCE) {
                  if (nextIndex === state.currentTrackIndex && audioRefs[i].current) {
                    audioRefs[i].current.currentTime = playlist[nextIndex].startTime || 0;
                  }
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], currentTrackIndex: nextIndex, selectedTrackIndex: nextIndex, currentTime: 0, isPlaying: false };
                    return next;
                  });
                } else {
                  setStates(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], isPlaying: false, currentTime: 0 };
                    return next;
                  });
                  if (audioRefs[i].current) audioRefs[i].current.currentTime = 0;
                }
              }}
            />
            <audio 
              ref={nextAudioRefs[i]} 
              style={{ display: 'none' }} 
              onError={(e) => {
                const audio = nextAudioRefs[i].current;
                if (audio && audio.error) {
                  console.error(`Next audio element error (Tab ${i+1}):`, audio.error.message);
                }
              }}
            />
          </React.Fragment>
        ))}

        <SettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          masterVolume={states[activeTab].volume}
          setMasterVolume={(vol) => setStates(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], volume: vol };
            return next;
          })}
          duckingLevel={states[activeTab].duckingLevel}
          setDuckingLevel={(level) => setStates(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], duckingLevel: level };
            return next;
          })}
          fadeOutDuration={states[activeTab].fadeOutDuration}
          setFadeOutDuration={(duration) => setStates(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], fadeOutDuration: duration };
            return next;
          })}
          isLoudnessNormalized={states[activeTab].isLoudnessNormalized}
          setIsLoudnessNormalized={(value) => setStates(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], isLoudnessNormalized: value };
            return next;
          })}
          isTestToneOn={states[activeTab].isTestToneOn}
          setIsTestToneOn={(value) => {
            initAudioEngine();
            setStates(prev => {
              const next = [...prev];
              next[activeTab] = { ...next[activeTab], isTestToneOn: value };
              return next;
            });
          }}
          testToneChannel={states[activeTab].testToneChannel}
          setTestToneChannel={(channel) => setStates(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], testToneChannel: channel };
            return next;
          })}
        />
      </main>
    </div>
  );
};

export default App;