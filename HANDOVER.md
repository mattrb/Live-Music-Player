# Project Handover: Aether Player

## Project Status
Aether Player is a minimalist, high-end Electron music player. It is currently **operational** in the Google AI Studio environment and configured for **standalone macOS builds**.

## Solved Problems & Technical Decisions

### 1. Electron Architecture (ESM vs CommonJS)
*   **Problem:** The project uses `"type": "module"` for modern React development, but Electron's main process often requires CommonJS.
*   **Solution:** Renamed the entry point to `main.cjs`. This allows the main process to use `require()` while the rest of the app remains ESM.

### 2. Styling Pipeline (Tailwind 4 to 3)
*   **Problem:** Tailwind 4's Vite plugin encountered `undefined` object errors during production builds in this specific environment.
*   **Solution:** Reverted to **Tailwind 3.4** with a standard **PostCSS** configuration. This provides a stable, predictable build pipeline for Electron.

### 3. Asset Resolution (The "White Screen" Fix)
*   **Problem:** Electron uses the `file://` protocol. Absolute paths (e.g., `/assets/...`) fail to load, resulting in a blank screen.
*   **Solution:** 
    *   Set `base: './'` in `vite.config.ts`.
    *   Updated `index.html` to use relative paths (`./index.css`, `./index.tsx`).

### 4. macOS Build & Code Signing
*   **Problem:** macOS build failed with "resource fork, Finder information, or similar detritus not allowed" during the `codesign` step.
*   **Solution:** 
    *   Added `"identity": null` to the `mac` build config in `package.json` to bypass ad-hoc signing issues.
    *   Recommended running `xattr -cr .` locally to strip hidden macOS metadata.

### 5. UI/UX Stability
*   **Problem:** Quirks Mode warnings and mounting errors.
*   **Solution:** Cleaned up `index.html` to ensure the `<!DOCTYPE html>` is the absolute first line and the root element is correctly targeted.

---

## Standalone Build Prompt
*Use this prompt to transform any AI Studio web project into a buildable Electron app.*

> "I have a React/Vite project running in AI Studio. Transform this into a standalone Electron application buildable for macOS. 
> 
> 1. **Dependencies**: Install `electron` and `electron-builder`.
> 2. **Main Process**: Create a `main.cjs` file (CommonJS) that creates a `BrowserWindow`, loads `dist/index.html` in production, and `http://localhost:3000` in development.
> 3. **Package Config**: 
>    - Set `"main": "main.cjs"`.
>    - Add a `"dist"` script: `"npm run build && electron-builder"`.
>    - Add a `"build"` configuration block defining `appId`, `files` (including `dist` and `main.cjs`), and `mac` settings.
> 4. **Vite Config**: Set `base: './'` in `vite.config.ts` to ensure relative asset paths.
> 5. **HTML**: Ensure `index.html` uses relative paths (`./`) for scripts and styles.
> 6. **Signing**: In the `mac` build config, set `"identity": null` to avoid 'detritus' errors during ad-hoc signing."

---

## Current Build Command
To generate the `.app` file on your Mac:
```bash
# 1. Strip macOS metadata (run once)
xattr -cr .

# 2. Build and Package
npm run dist
```
The output will be in the `/release` folder.
