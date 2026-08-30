import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene03_Onboarding — 4-step wizard.
 * Light Google theme with clean, border-shadowed white cards.
 */
export const Scene03_Onboarding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { num: 1, label: 'Welcome',     icon: '👋', color: '#4285f4' },
    { num: 2, label: 'Upload Docs', icon: '📄', color: '#00bac6' },
    { num: 3, label: 'Your Agent',  icon: '🤖', color: '#a78bfa' },
    { num: 4, label: "You're Live", icon: '🚀', color: '#34a853' },
  ];

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(52, 168, 83, 0.08)" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '40px',
        boxSizing: 'border-box',
        gap: '40px',
      }}>
        {/* Header Block — clean, no overlap */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
          <KineticText text="Setup in 60 Seconds" delay={0} />
          <SubText text="From zero to live chatbot — just four steps." delay={20} />
        </div>

        {/* Step cards — horizontal row, no overlap */}
        <div style={{ display: 'flex', gap: '32px', justifyContent: 'center' }}>
          {steps.map((s, i) => {
            const cardP = spring({ frame: frame - 25 - i * 12, fps, config: { damping: 14 } });
            const fillDelay = 40 + i * 18;
            const fill = interpolate(frame - fillDelay, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

            return (
              <div key={s.num} style={{
                width: '230px', padding: '32px 24px', borderRadius: '24px',
                background: '#ffffff',
                border: `2px solid ${fill > 0.1 ? s.color : '#e2e8f0'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                fontFamily: 'Inter, sans-serif',
                transform: `scale(${interpolate(cardP, [0, 1], [0.85, 1])}) translateY(${interpolate(cardP, [0, 1], [30, 0])}px)`,
                opacity: interpolate(cardP, [0, 1], [0, 1]),
                boxShadow: fill > 0.5 ? `0 15px 35px rgba(0,0,0,0.06), 0 0 20px ${s.color}15` : '0 15px 35px rgba(0,0,0,0.05)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}>
                <div style={{ fontSize: '42px' }}>{s.icon}</div>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: s.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '13px', fontWeight: 800,
                }}>{s.num}</div>
                <div style={{ color: '#1e293b', fontSize: '18px', fontWeight: 700 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
