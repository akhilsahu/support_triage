import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { GlowingCard } from '../components/GlowingCard';

export const Beat2: React.FC = () => {
  const frame = useCurrentFrame();
  // const { fps } = useVideoConfig();
  
  const chaosScale = interpolate(frame, [0, 120], [1, 1.2]);
  
  return (
    <AbsoluteFill>
      <Starfield />
      <AbsoluteFill style={{ transform: `scale(${chaosScale})` }}>
        <GlowingCard title="Ticket #1029" content="Customer cannot login..." delay={10} xOffset={-300} yOffset={-150} color="#f43f5e" />
        <GlowingCard title="Refund Policy" content="Docs: refunds are..." delay={20} xOffset={200} yOffset={-200} color="#eab308" />
        <GlowingCard title="Chat: User54" content="I need help with billing." delay={30} xOffset={-250} yOffset={150} color="#3b82f6" />
        <GlowingCard title="API Error" content="500 Internal Server Error" delay={40} xOffset={300} yOffset={100} color="#ef4444" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
