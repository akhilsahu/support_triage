import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

export const KineticText: React.FC<{text: string; delay?: number; color?: string}> = ({
  text, delay = 0, color = '#1e293b'
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 100 }
  });
  
  const yOffset = interpolate(progress, [0, 1], [100, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.85, 1]);
  
  return (
    <div style={{
      fontSize: '80px', // Comfortably sized for 1920x1080 to prevent overflow
      fontWeight: 800,
      color,
      fontFamily: 'Inter, system-ui, sans-serif',
      letterSpacing: '-0.04em',
      transform: `translateY(${yOffset}px) scale(${scale})`,
      opacity,
      textAlign: 'center',
    }}>
      {text}
    </div>
  );
};
