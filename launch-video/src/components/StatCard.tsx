import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * StatCard - clean light theme stat card mimicking Dashboard.tsx stat cards.
 */
export const StatCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  delta: string;
  delay?: number;
}> = ({label, value, icon, gradientFrom, gradientTo, delta, delay = 0}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 100 }
  });
  
  const scale = interpolate(progress, [0, 1], [0.8, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const yOffset = interpolate(progress, [0, 1], [30, 0]);
  
  return (
    <div style={{
      transform: `scale(${scale}) translateY(${yOffset}px)`,
      opacity,
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '24px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      fontFamily: 'Inter, system-ui, sans-serif',
      width: '280px',
      boxShadow: '0 15px 35px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,1)',
    }}>
      {/* Icon badge */}
      <div style={{
        width: '48px', height: '48px', borderRadius: '15px',
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', boxShadow: `0 6px 16px ${gradientFrom}33`,
      }}>
        {icon}
      </div>
      {/* Value */}
      <div style={{ fontSize: '38px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
        {value}
      </div>
      {/* Label */}
      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
        {label}
      </div>
      {/* Delta badge */}
      <div style={{
        fontSize: '12px', color: '#047857', fontWeight: 700,
        background: '#ecfdf5',
        padding: '5px 12px', borderRadius: '100px',
        display: 'inline-flex', alignSelf: 'flex-start',
        border: '1px solid #d1fae5',
      }}>
        {delta}
      </div>
    </div>
  );
};
