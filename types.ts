export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
  url: string;
  cover: string;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrackIndex: number;
  volume: number;
  progress: number;
  isFading: boolean;
  isShuffle: boolean;
  currentTime: number;
  duration: number;
  isDucked: boolean;
  duckingLevel: number;
  fadeOutDuration: number;
}