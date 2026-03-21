
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
  onToggleLoop?: () => void;
  onRemove: () => void;
  onEdit?: () => void;
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
  onToggleLoop,
  onRemove,
  onEdit,
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
      className={`group flex items-center justify-between p-4 cursor-grab active:cursor-grabbing transition-all duration-200 rounded-lg mb-1 border-l-[10px]
        ${isActive ? 'bg-emerald-500/10 shadow-lg shadow-emerald-500/5 border-l-emerald-500' : 'border-l-transparent'}
        ${isSelected ? 'border-l-white/60' : ''}
        ${!isActive && isSelected ? 'bg-white/10' : ''}
        ${!isActive && !isSelected ? `hover:bg-white/10 hover:text-white ${index % 2 === 0 ? 'bg-white/[0.02]' : 'bg-white/[0.05]'}` : ''}`}
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
            track.playbackMode === PlaybackMode.FOLLOW ? 'fa-arrow-down' : 
            track.playbackMode === PlaybackMode.ADVANCE ? 'fa-arrow-down' : 
            'fa-stop'
          } text-[10px]`}></i>
          {track.playbackMode === PlaybackMode.FOLLOW && <span className="text-[8px] font-bold">PLAY</span>}
        </button>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onToggleLoop?.();
          }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all border ${
            track.isLooping ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/5 text-white/20 hover:text-white/40'
          }`}
          title="Infinite Loop"
        >
          <i className="fa-solid fa-arrows-rotate text-[10px]"></i>
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

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="p-2 rounded-md transition-all text-white/20 hover:text-indigo-400 hover:bg-indigo-500/10"
          title="Edit track range"
        >
          <i className="fa-solid fa-pen-to-square text-[10px]"></i>
        </button>
      </div>
    </div>
  );
};
