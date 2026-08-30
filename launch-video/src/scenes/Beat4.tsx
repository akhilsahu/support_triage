import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';

const Node: React.FC<{ label: string; x: number; y: number; delay: number; color: string }> = ({ label, x, y, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  
  return (
    <div style={{
      position: 'absolute',
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      width: '180px',
      height: '180px',
      borderRadius: '50%',
      background: 'rgba(20, 20, 35, 0.8)',
      border: `2px solid ${color}`,
      boxShadow: `0 0 40px ${color}66`,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fontSize: '24px',
      textAlign: 'center',
      backdropFilter: 'blur(10px)'
    }}>
      {label}
    </div>
  );
};

export const Beat4: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield />
      <AbsoluteFill>
        <Node label="Triage" x={0} y={-150} delay={0} color="#a855f7" />
        <Node label="Finance" x={-250} y={150} delay={15} color="#06b6d4" />
        <Node label="Logistics" x={250} y={150} delay={30} color="#d946ef" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
