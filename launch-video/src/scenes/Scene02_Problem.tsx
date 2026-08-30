import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene02_Problem — Chaos of unstructured support.
 * Light Google theme with clean, border-shadowed white cards.
 */
export const Scene02_Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drift = interpolate(frame, [0, 210], [0, 10]);

  const cards = [
    { icon: '🔴', title: 'Ticket #4821', desc: 'Billing issue — zero context, passed to 4 agents, fr fr 💀', color: '#ea4335' },
    { icon: '📄', title: 'Refund Policy v3', desc: 'Is this the latest doc? The info is NOT giving 😭', color: '#fbbc05' },
    { icon: '💬', title: 'Chat: Jane', desc: '"Waiting 40 mins? Support is officially not understanding the assignment."', color: '#4285f4' },
    { icon: '⚠️', title: 'Escalation Failed', desc: 'Agent has no clue. Escalation is sending me to the wrong dept 🕯️', color: '#fb923c' },
    { icon: '📊', title: 'No Analytics', desc: 'How many tickets resolved? Just vibes, no metrics 📈', color: '#a78bfa' },
  ];

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(234, 67, 53, 0.08)" />

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
          <KineticText text="The Problem" delay={0} />
          <SubText text="Support teams drown in tickets, scattered docs, and zero context." delay={20} />
        </div>

        {/* Card grid — flex-wrap centered, no absolute overlap */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '24px',
          justifyContent: 'center', maxWidth: '1250px',
          transform: `translateY(${drift}px)`,
        }}>
          {cards.map((c, i) => {
            const p = spring({ frame: frame - 20 - i * 8, fps, config: { damping: 14 } });
            return (
              <div key={c.title} style={{
                width: '330px', padding: '24px 28px', borderRadius: '22px',
                background: '#ffffff', border: '1px solid #e2e8f0',
                boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                fontFamily: 'Inter, sans-serif',
                transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
                opacity: interpolate(p, [0, 1], [0, 1]),
                display: 'flex', flexDirection: 'column', gap: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{c.icon}</span>
                  <span style={{ color: c.color, fontSize: '18px', fontWeight: 700 }}>{c.title}</span>
                </div>
                <span style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5 }}>{c.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
