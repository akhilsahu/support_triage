import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * CTAButton - Google blue action button.
 */
export const CTAButton: React.FC<{text: string; delay?: number}> = ({text, delay = 0}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 90 }
  });
  
  const scale = interpolate(progress, [0, 1], [0.8, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  
  return (
    <div style={{
      transform: `scale(${scale})`,
      opacity,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 48px',
      borderRadius: '100px',
      background: '#4285F4',
      color: 'white',
      fontSize: '32px',
      fontWeight: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(66, 133, 244, 0.3)',
      border: '1px solid rgba(255,255,255,0.2)',
    }}>
      {text}
    </div>
  );
};
