# Background Processes: How the Sound File Player Works

## Introduction
This document explains the "magic" happening behind the scenes of the Sound File Player for technically minded non-programmers.

## 1. Loading Your Files (Blob URLs)
When you select a folder, the application doesn't upload your files to a server. Instead, it creates a **Blob URL** for each file. This is a temporary, local link that points directly to the file's data in your computer's memory.
- **Why?** This allows for instant playback without waiting for uploads.
- **Limitation:** These links are temporary. If you refresh the page, the browser "forgets" them, which is why you're prompted to re-select the folder when loading a saved session.

## 2. Loudness Normalization (LUFS)
Have you ever noticed how some songs are much louder than others? The Sound File Player fixes this using **Loudness Normalization**.
- **The Analysis:** When you load a folder, the app quickly "listens" to each track in the background using a silent, high-speed audio processor.
- **The Calculation:** It calculates the average loudness (LUFS) of each track.
- **The Result:** When you play a track, the app automatically adjusts the volume (gain) so that every song sounds equally loud, saving you from constantly reaching for the volume knob.

## 3. The Audio Engine (Web Audio API)
The player uses a sophisticated system called the **Web Audio API**. Think of it like a virtual mixing desk:
- **Audio Source:** The raw sound from your file.
- **Gain Node:** A virtual volume fader that handles the loudness normalization and smooth fades.
- **Analyser Node:** A tool that "looks" at the sound waves in real-time.
- **Output:** The final sound sent to your speakers.
By piping the sound through this virtual desk, the app can perform complex tasks like crossfading and real-time visualization without any lag.

## 4. Crossfading and Transitions
When you have **Shuffle** enabled, the app uses a "look-ahead" system:
- **Preparation:** About 5 seconds before the current track ends, the app starts loading the next track in a hidden player.
- **The Transition:** As the current track reaches its end, the app smoothly fades it out while simultaneously fading in the next track.
- **Synchronization:** This ensures there are no gaps or silence between songs, creating a seamless listening experience.

## 5. Infinite Loop Mode
You can now set any track to loop infinitely.
- **How it works:** When a track is set to "Loop," the player will ignore the standard playlist sequence and simply restart the current track from its "IN" point as soon as it reaches the "OUT" point.
- **Persistence:** This loop remains active until you manually play a different track or toggle the loop button off.

## 6. Playback Stability (The "Play" Promise)
Modern browsers are very strict about when and how audio can play. To prevent errors and "stuttering," the app uses a **Promise-based system**:
- When you click "Play," the app makes a "promise" to the browser to start the sound.
- It then waits for the browser to confirm the file is ready (the `canplay` state).
- Only after this confirmation does it actually start the audio. This prevents the "nothing happens" issue that can occur if the app tries to play a file that isn't fully loaded yet.
