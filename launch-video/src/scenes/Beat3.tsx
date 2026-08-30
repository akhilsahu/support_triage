import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { CTAButton } from '../components/CTAButton';

export const Beat3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const ringScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 12, stiffness: 80 }
  });
  
  const opacity = interpolate(ringScale, [0, 1], [0, 1]);
  
  return (
    <AbsoluteFill>
      <Starfield />
      <Sequence from={0} durationInFrames={40}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
          <CTAButton text="Initialize Workspace" delay={0} />
        </div>
      </Sequence>
      <Sequence from={40}>
        <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Glowing Ring */}
          <div style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            border: '4px solid rgba(6, 182, 212, 0.8)',
            boxShadow: '0 0 100px rgba(6, 182, 212, 0.4), inset 0 0 50px rgba(217, 70, 239, 0.4)',
            transform: `scale(${ringScale})`,
            opacity
          }}></div>
          {/* Central Core */}
          <div style={{
            position: 'absolute',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #06b6d4, #d946ef)',
            boxShadow: '0 0 80px #d946ef',
            transform: `scale(${ringScale})`,
            opacity
          }}></div>
          {/* Structured Text */}
          <div style={{
            position: 'absolute',
            color: 'white',
            fontSize: '32px',
            fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif',
            transform: `scale(${ringScale}) translateY(200px)`,
            opacity,
            textShadow: '0 0 20px rgba(255,255,255,0.5)'
          }}>Knowledge Base Synced</div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
