import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * GoogleTitle — Renders "Support247.chat" where "Support247" is styled
 * with a premium, smooth Google-inspired colorful text gradient.
 */
export const GoogleTitle: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 90 }
  });

  const yOffset = interpolate(progress, [0, 1], [50, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.9, 1]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '100px',
      fontWeight: 800,
      fontFamily: 'Inter, system-ui, sans-serif',
      letterSpacing: '-0.04em',
      transform: `translateY(${yOffset}px) scale(${scale})`,
      opacity,
    }}>
      {/* Gradient-clipped word */}
      <span style={{
        background: 'linear-gradient(135deg, #4285F4 0%, #a78bfa 35%, #ec4899 70%, #ea4335 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'inline-block',
        paddingRight: '2px', // Prevent clipping issues on some browsers
      }}>
        Support247
      </span>
      {/* Slate-colored suffix */}
      <span style={{ color: '#475569', display: 'inline-block' }}>
        .chat
      </span>
    </div>
  );
};
