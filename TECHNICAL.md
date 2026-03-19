# Technical Documentation: Sound File Player

## Overview
The Sound File Player is a high-performance, browser-based audio playback system built with React, Tailwind CSS, and the Web Audio API. It features loudness normalization, real-time waveform visualization, and advanced playback controls.

## Core Architecture

### 1. Audio Engine
The application uses a hybrid approach combining the standard HTML5 `<audio>` element with the **Web Audio API**.
- **HTML5 Audio:** Handles the heavy lifting of decoding and streaming audio files.
- **Web Audio API:** Provides precision control over gain (volume), loudness normalization, and real-time analysis.
- **MediaElementSource:** The audio element is piped into the Web Audio graph via `createMediaElementSource`.

### 2. State Management
The app uses a centralized React state (`state` object) and a separate `playlist` state.
- **Playback State:** Tracks `isPlaying`, `currentTrackIndex`, `currentTime`, and `progress`.
- **Audio Processing State:** Manages `isFading`, `isDucked`, and `isLoudnessNormalized`.
- **Session Management:** Persists metadata (but not file blobs) to `localStorage`.

### 3. Loudness Normalization (LUFS)
The player implements a simplified LUFS-based normalization.
- **Analysis:** When a folder is loaded, each track is analyzed using an `OfflineAudioContext`.
- **RMS Calculation:** It calculates the Root Mean Square (RMS) of the audio samples to estimate the average loudness.
- **Gain Adjustment:** A target gain is calculated to bring the track's average level to a consistent target (e.g., -14 LUFS).

### 4. Playback Logic & Stability
- **Effect-Driven Playback:** A `useEffect` hook monitors the `currentTrack` and `isPlaying` state. It handles source changes, loading, and `play()` promises.
- **Infinite Loop Logic:** The `onEnded` handler (and the manual end-time check in `onTimeUpdate`) checks the `isLooping` flag on the current track. If true, it resets `currentTime` to the track's `startTime` and maintains `isPlaying: true`, bypassing the standard `playbackMode` logic.
- **Race Condition Prevention:** Uses `playPromiseRef` to ensure that `play()` calls are not interrupted by `pause()` or source changes, which would otherwise throw `AbortError`.
- **Ready State Checks:** Before calling `play()`, the engine verifies the `readyState` of the audio element and waits for the `canplay` event if necessary.

## Key Components
- `App.tsx`: Main entry point, state coordinator, and audio engine host.
- `LargeControls.tsx`: High-visibility playback controls with animation.
- `TrackItem.tsx`: Individual playlist items with drag-and-drop and trim controls.
- `Waveform.tsx`: Canvas-based real-time waveform visualization.

## Development Constraints
- **Iframe Context:** The app is designed to run within an iframe, avoiding restricted APIs like `window.alert`.
- **Autoplay Policy:** Requires user interaction (e.g., clicking "Start") to resume the `AudioContext`.
