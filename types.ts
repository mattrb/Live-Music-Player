export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
  url: string;
  cover: string;
  playbackMode: PlaybackMode;
  averageLevel?: number;
  isAnalyzing?: boolean;
  startTime?: number;
  endTime?: number;
  volumeTrim?: number;
  waveformData?: number[];
}

export enum PlaybackMode {
  STOP = 'stop',       // Mode 3: Keep current track selected, don't play
  ADVANCE = 'advance', // Mode 2: Advance selection, don't play
  FOLLOW = 'follow'    // Mode 1: Advance selection and play
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrackIndex: number;
  selectedTrackIndex: number;
  volume: number;
  progress: number;
  isFading: boolean;
  isShuffle: boolean;
  currentTime: number;
  duration: number;
  isDucked: boolean;
  duckingLevel: number;
  fadeOutDuration: number;
  isLoudnessNormalized: boolean;
}
