
import React from 'react';
import { Track, PlaybackMode } from '../types';

interface TrackItemProps {
  track: Track;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onTogglePlaybackMode: () => void;
}

export const TrackItem: React.FC<TrackItemProps> = ({ 
  track, 
  isActive, 
  isSelected,
  onClick, 
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onTogglePlaybackMode
}) => {
  return (
    <div 
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={() => onDrop(index)}
      className={`group flex items-center justify-between p-4 cursor-grab active:cursor-grabbing transition-all duration-200 rounded-lg mb-1 border
        ${isActive ? 'track-active bg-white/10 border-white/20 shadow-lg' : isSelected ? 'track-selected bg-white/5 border-white/10' : 'track-inactive border-transparent hover:bg-white/5 hover:text-white'}
        hover:border-white/10`}
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1" onClick={onClick}>
        <div className="flex flex-col items-center gap-0.5 opacity-20 group-hover:opacity-60 transition-opacity pr-1">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
        
        {isActive ? (
          <i className="fa-solid fa-volume-high text-xs text-white shrink-0"></i>
        ) : (
          <i className="fa-solid fa-file-audio text-xs opacity-40 shrink-0"></i>
        )}
        
        <span className="text-sm font-medium tracking-tight truncate">
          {track.title}
        </span>
      </div>
      
      <div className="flex items-center gap-4 shrink-0">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlaybackMode();
          }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all border ${
            track.playbackMode === PlaybackMode.FOLLOW ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
            track.playbackMode === PlaybackMode.ADVANCE ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 
            'bg-white/5 border-white/10 text-white/30'
          } hover:bg-white/10`}
          title="Toggle Track Playback Mode"
        >
          <i className={`fa-solid ${
            track.playbackMode === PlaybackMode.FOLLOW ? 'fa-forward-step' : 
            track.playbackMode === PlaybackMode.ADVANCE ? 'fa-arrow-right' : 
            'fa-stop'
          } text-[10px]`}></i>
        </button>

        <span className="text-xs font-mono opacity-30 group-hover:opacity-60">
          {track.duration}
        </span>
      </div>
    </div>
  );
};
