# Sound File Player: Technical Specification & Design Prompt

## Core Concept
A professional-grade, high-fidelity "Session Console" audio player designed for live environments, studio monitoring, and seamless background playback. The app prioritizes audio integrity, precise control, and a "hardware-inspired" aesthetic. Beta Release.

## GUI Architecture

### 1. Header & Global Actions (Top Right)
- **Title Block**: "Sound File Player" in a minimalist, bold font.
- **Global Shuffle**: A circular button next to the load action. It features a shuffle icon and glows amber (`#f59e0b`) when active.
- **Load Tracks**: A pill-shaped button labeled "LOAD TRACKS" with a folder icon. It allows multi-selection of individual audio files (MP3, WAV, OGG, FLAC, M4A).

### 2. Main Playback Console (Center Card)
- **Display Area**: Large, bold typography for the current track title. Muted, uppercase metadata for the artist.
- **Seek & Progress**: A thin, high-contrast progress bar.
    - **Elapsed Time**: Left-aligned (e.g., 1:24).
    - **Remaining Time**: Right-aligned with a negative sign (e.g., -2:45).
    - **Interaction**: Draggable seek with a hidden range input for precision.

### 3. Primary Command Row (Large Controls)
- **Play/Pause/Switch**: A dominant emerald green (`#10b981`) button. 
    - **Behavior**: If a new track is selected in the playlist but not playing, it displays "PLAY SELECTED". Otherwise, toggles "START" / "PAUSE".
- **Fade Out**: A rose-red (`#e11d48`) button with a "wind" icon. Triggers a smooth exponential volume ramp to zero before advancing.
- **Duck**: An indigo (`#4f46e5`) button. Manually toggles a volume reduction (ducking) for voice-over or background utility.
- **Edit Mode**: A toggleable state that reveals a precision trim window for the "Next Up" track.

### 4. Precision Knobs (Secondary Controls)
- **Ducking Offset**: A slider controlling the attenuation level (0dB to -40dB).
- **Loudness Mode**: A toggle switch for EBU R128-inspired normalization. When ON, it targets -16 LUFS for consistent perceived volume across different files.
- **Fade Time**: A slider adjusting the duration of the "Fade Out" command (1s to 15s).
- **Track Trimming**: Draggable IN and OUT points on a waveform visualization to set custom start and end times for any track.

### 5. Smart Playlist (Bottom Section)
- **Selection Logic**: Clicking a track highlights it (Selection) but does **not** interrupt the current playback.
- **Edit Button**: A pencil icon next to each track that opens the "Next Up" edit window for that specific track.
- **Infinite Loop**: A circular arrow icon (`fa-arrows-rotate`) that, when active, causes the track to repeat indefinitely, overriding the sequence logic.
- **Playback Modes**: Each track has a toggleable mode icon:
    - **Mode 1 (Follow)**: Seamlessly plays the next track (indicated by a down arrow).
    - **Mode 2 (Advance)**: Loads the next track but pauses (indicated by a down arrow).
    - **Mode 3 (Stop)**: Stops playback after the track ends (indicated by a stop icon).
- **Reordering**: Drag-and-drop support for manual setlist management.
- **Metadata**: Displays accurate `MM:SS` durations extracted from file headers.

## Audio Engine Behavior

- **Dual-Channel Crossfading**: When Shuffle is ON, the engine prepares a second audio channel 5 seconds before the end of the current track. It performs a 5-second exponential crossfade between the two channels for a gapless "DJ-style" transition.
- **Normalization**: Real-time gain adjustment based on the Loudness Mode setting.
- **Peak Protection**: A built-in Dynamics Compressor acting as a limiter at -1.0dB to prevent digital clipping during crossfades or normalization boosts.
- **Keyboard Shortcuts**:
    - `Space`: Play/Pause
    - `Enter`: Play Selected
    - `Esc`: Fade Out
    - `D`: Toggle Ducking
    - `S`: Toggle Shuffle
    - `Arrow Up/Down`: Navigate/Select tracks in playlist

## Visual Aesthetic
- **Theme**: Deep Obsidian / Dark Mode (`#0a0a0a` background).
- **Accents**: Emerald (Success), Rose (Warning/Action), Indigo (Utility), Amber (Shuffle).
- **Typography**: Inter (Sans) for UI, Monospace for timecodes.
- **Atmosphere**: Glassmorphism, subtle borders (`white/5`), and high-density information layout.
