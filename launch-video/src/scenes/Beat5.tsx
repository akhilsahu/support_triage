import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';

export const Beat5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const slideIn = spring({ frame, fps, config: { damping: 16 } });
  const yOffset = interpolate(slideIn, [0, 1], [300, 0]);
  
  const clickDelay = 45;
  const colorTransition = interpolate(frame - clickDelay, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const statusColor = `rgba(${interpolate(colorTransition, [0, 1], [245, 16])}, ${interpolate(colorTransition, [0, 1], [158, 185])}, ${interpolate(colorTransition, [0, 1], [11, 129])}, 1)`; // Amber to Emerald
  const statusText = frame > clickDelay + 5 ? "Claimed" : "Escalated";

  return (
    <AbsoluteFill>
      <Starfield />
      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          transform: `translateY(${yOffset}px)`,
          width: '800px',
          height: '400px',
          background: 'rgba(30, 30, 45, 0.6)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '32px',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <h2 style={{ color: 'white', margin: 0, fontSize: '32px' }}>Space Inbox</h2>
            <div style={{
              background: statusColor,
              padding: '8px 24px',
              borderRadius: '100px',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '18px',
              boxShadow: `0 0 20px ${statusColor}`
            }}>{statusText}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '16px', padding: '20px', color: 'rgba(255,255,255,0.7)', fontSize: '20px' }}>
            <strong>User:</strong> I need to speak to a human about my order.<br/><br/>
            <strong>AI:</strong> Escalating to a support agent now.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
