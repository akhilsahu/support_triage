import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * AgentNode - circular agent node styled for light Google theme.
 */
export const AgentNode: React.FC<{
  label: string;
  icon: string;
  x: number;
  y: number;
  delay: number;
  color: string;
  size?: number;
}> = ({ label, icon, x, y, delay, color, size = 140 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  
  return (
    <div style={{
      position: 'absolute',
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: '#ffffff',
      border: `2px solid ${color}`,
      boxShadow: `0 10px 25px rgba(0, 0, 0, 0.05), 0 0 20px ${color}22`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: '#1e293b',
      fontFamily: 'Inter, sans-serif',
      gap: '4px',
    }}>
      <div style={{ fontSize: `${size * 0.22}px` }}>{icon}</div>
      <div style={{ fontSize: `${size * 0.1}px`, fontWeight: 700, textAlign: 'center', padding: '0 8px' }}>{label}</div>
    </div>
  );
};

/**
 * DataBeam - a clean line representing data routing.
 */
export const DataBeam: React.FC<{
  fromX: number; fromY: number; toX: number; toY: number;
  delay: number; color: string;
}> = ({ fromX, fromY, toX, toY, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 80 } });
  
  const cx = 960, cy = 540;
  const x1 = cx + fromX, y1 = cy + fromY;
  const x2 = cx + toX, y2 = cy + toY;
  
  const currentX2 = interpolate(progress, [0, 1], [x1, x2]);
  const currentY2 = interpolate(progress, [0, 1], [y1, y2]);
  const opacity = interpolate(progress, [0, 1], [0, 0.6]);
  
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '1920px', height: '1080px', pointerEvents: 'none' }}>
      <line
        x1={x1} y1={y1} x2={currentX2} y2={currentY2}
        stroke={color}
        strokeWidth="3.5"
        strokeDasharray="6,6"
        opacity={opacity}
      />
    </svg>
  );
};
