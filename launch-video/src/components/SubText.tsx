import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * SubText - Lighter secondary text.
 * Defaults to slate-500 for a clean light layout style.
 */
export const SubText: React.FC<{text: string; delay?: number; size?: number; color?: string}> = ({
  text, delay = 0, size = 26, color = '#475569'
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16, stiffness: 90 }
  });
  
  const yOffset = interpolate(progress, [0, 1], [40, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  
  return (
    <div style={{
      fontSize: `${size}px`,
      fontWeight: 500,
      color,
      fontFamily: 'Inter, system-ui, sans-serif',
      letterSpacing: '-0.01em',
      transform: `translateY(${yOffset}px)`,
      opacity,
      textAlign: 'center',
      lineHeight: 1.5,
      maxWidth: '1000px',
    }}>
      {text}
    </div>
  );
};
