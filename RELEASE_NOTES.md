# Aether Player - Release Notes

## Overview
Aether Player is a focused, minimalist audio player designed for local library playback with precise transition controls.

## Core Functions

### 1. Media Playback
*   **Standard Controls**: Play, pause, and seek functionality.
*   **Shuffle Mode**: Randomize playback order across the current playlist.
*   **Progress Tracking**: Real-time visual feedback of track duration and remaining time.

### 2. Library Management
*   **Folder Import**: Load entire directories of audio files directly into the session.
*   **Format Support**: Compatible with standard audio formats including MP3, WAV, OGG, FLAC, and M4A.

### 3. Playlist Interaction
*   **Dynamic Reordering**: Drag-and-drop tracks within the list to customize the playback sequence.
*   **Active Tracking**: Visual indicators for the currently playing track.

### 4. Audio Engine Features
*   **Cinematic Fade-out**: A dedicated command to gradually reduce volume over a set duration before stopping or skipping.
*   **Audio Ducking**: Instantly reduce volume to a preset "background" level without pausing.
*   **Parameter Tuning**: Independent sliders to adjust Fade Time (1s–15s) and Ducking Offset (-40dB–0dB).

### 5. Keyboard Shortcuts
*   `Space`: Play / Pause
*   `Escape`: Trigger Fade-out
*   `D`: Toggle Ducking Mode

## Technical Specifications
*   **Platform**: macOS (Standalone Electron App)
*   **Engine**: Web Audio API with Dynamics Compression
*   **Interface**: High-contrast, minimalist dashboard optimized for focused sessions.
