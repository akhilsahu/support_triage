import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene09_Analytics — Charts & stats.
 * Light Google theme with clean white boxes.
 */
export const Scene09_Analytics: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barData = [
    { label: 'Mon', value: 85,  color: '#4285f4' },
    { label: 'Tue', value: 120, color: '#ea4335' },
    { label: 'Wed', value: 95,  color: '#fbbc05' },
    { label: 'Thu', value: 150, color: '#34a853' },
    { label: 'Fri', value: 180, color: '#4285f4' },
    { label: 'Sat', value: 60,  color: '#ea4335' },
    { label: 'Sun', value: 40,  color: '#fbbc05' },
  ];

  const stats = [
    { label: 'Messages Today', value: '342', color: '#4285f4' },
    { label: 'Avg Response',   value: '1.2s', color: '#34a853' },
    { label: 'RAG Hit Rate',   value: '94%',  color: '#805ad5' },
    { label: 'Escalation',     value: '4.1%', color: '#fb923c' },
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
        gap: '24px',
      }}>
        {/* Header Block — clean, no overlap */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
          <KineticText text="Analytics" delay={0} />
          <SubText text="Volume, response times, RAG accuracy, and escalation rates." delay={20} />
        </div>

        {/* Content Block — stats + chart */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: '14px' }}>
            {stats.map((s, i) => {
              const p = spring({ frame: frame - 20 - i * 5, fps, config: { damping: 14 } });
              return (
                <div key={s.label} style={{
                  padding: '12px 24px', borderRadius: '14px',
                  background: '#ffffff', border: '1px solid #e2e8f0',
                  textAlign: 'center', fontFamily: 'Inter, sans-serif',
                  transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
                  opacity: interpolate(p, [0, 1], [0, 1]),
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                }}>
                  <div style={{ color: s.color, fontSize: '24px', fontWeight: 800 }}>{s.value}</div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 500, marginTop: '2px' }}>{s.label}</div>
                </div>
              );
            })}
          </div>

          {/* Bar chart */}
          <div style={{
            width: '1000px', height: '300px',
            background: '#ffffff', border: '1px solid #e2e8f0',
            borderRadius: '18px', padding: '24px 32px',
            display: 'flex', alignItems: 'flex-end', gap: '20px', justifyContent: 'center',
            boxShadow: '0 10px 25px rgba(0,0,0,0.03)',
            boxSizing: 'border-box',
          }}>
            {barData.map((b, i) => {
              const h = interpolate(frame - 35 - i * 3, [0, 25], [0, b.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              return (
                <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '65px', height: `${h}px`, borderRadius: '8px 8px 2px 2px',
                    background: b.color,
                    boxShadow: `0 2px 8px ${b.color}20`,
                  }} />
                  <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'Inter, sans-serif' }}>{b.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
