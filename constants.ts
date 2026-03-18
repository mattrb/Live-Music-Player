
import { Track, PlaybackMode } from './types';

// Start with some bundled music placeholders
export const MOCK_PLAYLIST: Track[] = [
  {
    id: 'bundled-1',
    title: 'Midnight Echo',
    artist: 'Aether Bundled',
    duration: '03:45',
    url: './music/midnight_echo.mp3',
    cover: 'https://picsum.photos/seed/aether1/400/400',
    playbackMode: PlaybackMode.ADVANCE
  },
  {
    id: 'bundled-2',
    title: 'Neon Drift',
    artist: 'Aether Bundled',
    duration: '04:12',
    url: './music/neon_drift.mp3',
    cover: 'https://picsum.photos/seed/aether2/400/400',
    playbackMode: PlaybackMode.ADVANCE
  }
];

export const FADE_OUT_DURATION_MS = 5000;
