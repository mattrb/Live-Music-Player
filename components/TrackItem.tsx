
import React from 'react';
import { Track } from '../types';

interface TrackItemProps {
  track: Track;
  isActive: boolean;
  onClick: () => void;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
}

export const TrackItem: React.FC<TrackItemProps> = ({ 
  track, 
  isActive, 
  onClick, 
  index,
  onDragStart,
  onDragOver,
  onDrop
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
      onClick={onClick}
      className={`group flex items-center justify-between p-4 cursor-grab active:cursor-grabbing transition-all duration-200 rounded-lg mb-1 border border-transparent
        ${isActive ? 'track-active shadow-lg' : 'track-inactive hover:bg-white/5 hover:text-white'}
        hover:border-white/10`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
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
        <span className="text-xs font-mono opacity-30 group-hover:opacity-60">
          {track.duration}
        </span>
      </div>
    </div>
  );
};
