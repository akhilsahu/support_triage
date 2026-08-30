import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

export const GlowingCard: React.FC<{
  title: string; 
  content: string; 
  delay?: number;
  xOffset?: number;
  yOffset?: number;
  color?: string;
}> = ({title, content, delay = 0, xOffset = 0, yOffset = 0, color = '#a855f7'}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 100 }
  });
  
  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  
  return (
    <div style={{
      position: 'absolute',
      left: `calc(50% + ${xOffset}px)`,
      top: `calc(50% + ${yOffset}px)`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity,
      width: '320px',
      background: 'rgba(20, 20, 35, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '24px',
      padding: '32px',
      boxShadow: `0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 30px ${color}33`,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      color: 'white',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>{title}</div>
      <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{content}</div>
    </div>
  );
};
