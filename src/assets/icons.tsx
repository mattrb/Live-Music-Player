import React from 'react';

/**
 * Aether Player Custom SVG Icons
 * Designed for a high-fidelity, industrial audio aesthetic.
 */

export const ShuffleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 3H21V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 20L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 16V21H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15 15L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 4L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const FolderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 19V9C22 7.89543 21.1046 7 20 7H11L9 4H4C2.89543 4 2 4.89543 2 6V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const PlayIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 6L26 16L10 26V6Z" fill="currentColor"/>
  </svg>
);

export const PauseIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="6" width="4" height="20" fill="currentColor"/>
    <rect x="20" y="6" width="4" height="20" fill="currentColor"/>
  </svg>
);

export const WindIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12.59 19.41A2 2 0 1 0 14 16H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15.1 12.1a2 2 0 1 1 1.4 3.4H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const VolumeIcon = ({ level = 'high' }: { level?: 'high' | 'low' | 'mute' }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    {level !== 'mute' && (
      <path d="M15.54 8.46C16.4774 9.39764 17.004 10.6692 17.004 12C17.004 13.3308 16.4774 14.6024 15.54 15.54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    )}
    {level === 'high' && (
      <path d="M19.07 4.93C20.9447 6.80528 21.9979 9.34836 21.9979 12C21.9979 14.6516 20.9447 17.1947 19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    )}
    {level === 'mute' && (
      <path d="M23 9L17 15M17 9L23 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    )}
  </svg>
);
