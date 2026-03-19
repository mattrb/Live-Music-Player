
import { Track, PlaybackMode } from './types';

// Start with some bundled music placeholders
export const MOCK_PLAYLIST: Track[] = [
  {
    id: 'bundled-1',
    title: 'Sample Track 1',
    artist: 'Bundled Track',
    duration: '06:12',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    cover: 'https://picsum.photos/seed/sample1/400/400',
    playbackMode: PlaybackMode.ADVANCE
  },
  {
    id: 'bundled-2',
    title: 'Sample Track 2',
    artist: 'Bundled Track',
    duration: '07:05',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    cover: 'https://picsum.photos/seed/sample2/400/400',
    playbackMode: PlaybackMode.ADVANCE
  }
];

export const FADE_OUT_DURATION_MS = 5000;
