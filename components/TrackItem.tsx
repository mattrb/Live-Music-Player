
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
  onRemove: () => void;
  onVolumeTrimChange: (trim: number) => void;
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
  onTogglePlaybackMode,
  onRemove,
  onVolumeTrimChange
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
        
        <div className="flex flex-col flex-1 overflow-hidden">
          <span className="text-sm font-medium tracking-tight truncate">
            {track.title}
          </span>
          
          {/* Volume Trim Slider - Visible on hover */}
          <div 
            className="h-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <i className="fa-solid fa-sliders text-[8px] opacity-40"></i>
            <input 
              type="range" 
              min="0" 
              max="2" 
              step="0.01" 
              value={track.volumeTrim !== undefined ? track.volumeTrim : 1.0} 
              onChange={(e) => onVolumeTrimChange(parseFloat(e.target.value))}
              className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
            <span className="text-[8px] font-mono opacity-40">
              {Math.round((track.volumeTrim !== undefined ? track.volumeTrim : 1.0) * 100)}%
            </span>
          </div>
        </div>
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
          title={`Playback Mode: ${track.playbackMode.charAt(0).toUpperCase() + track.playbackMode.slice(1)}`}
        >
          <i className={`fa-solid ${
            track.playbackMode === PlaybackMode.FOLLOW ? 'fa-forward-step' : 
            track.playbackMode === PlaybackMode.ADVANCE ? 'fa-arrow-right' : 
            'fa-stop'
          } text-[10px]`}></i>
        </button>

        <span className="text-xs font-mono opacity-60">
          {track.isAnalyzing ? (
            <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
          ) : (
            track.duration
          )}
        </span>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-2 rounded-md transition-all text-white/20 hover:text-rose-400 hover:bg-rose-500/10"
          title="Remove from playlist"
        >
          <i className="fa-solid fa-trash-can text-[10px]"></i>
        </button>
      </div>
    </div>
  );
};
