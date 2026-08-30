import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene08_Inbox — Dual-console inbox.
 * Light Google theme with clean, bordered layouts and warm yellow glow.
 */
export const Scene08_Inbox: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const categories = [
    { label: 'Waiting Claim', count: 3, color: '#f59e0b', icon: '🔔' },
    { label: 'Active Claims', count: 2, color: '#4285f4', icon: '💬' },
    { label: 'Open Chats',    count: 7, color: '#34a853', icon: '🟢' },
    { label: 'Resolved',      count: 42, color: '#64748b', icon: '✅' },
  ];

  const claimFrame = 70;
  const claimP = interpolate(frame - claimFrame, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(251, 188, 5, 0.08)" />

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
          <KineticText text="Human Inbox" delay={0} />
          <SubText text="AI handles routine. Humans handle escalations. Seamless handoff." delay={20} />
        </div>

        {/* Inbox panel mockup — flex center, no overlap */}
        {(() => {
          const p = spring({ frame: frame - 40, fps, config: { damping: 14 } });
          return (
            <div style={{
              width: '1200px', height: '540px',
              transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
              opacity: interpolate(p, [0, 1], [0, 1]),
              display: 'flex', borderRadius: '22px', overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              boxSizing: 'border-box',
              background: '#ffffff',
            }}>
              {/* Sidebar */}
              <div style={{
                width: '300px', background: '#f8f9fa', padding: '18px',
                fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: '10px',
                borderRight: '1px solid #e2e8f0',
              }}>
                <div style={{ color: '#202124', fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>📥 Sessions</div>
                {categories.map((c, i) => {
                  const cp = spring({ frame: frame - 30 - i * 6, fps, config: { damping: 14 } });
                  return (
                    <div key={c.label} style={{
                      padding: '12px 14px', borderRadius: '12px',
                      background: i === 0 ? 'rgba(245,158,11,0.08)' : '#ffffff',
                      border: `1px solid ${i === 0 ? '#f59e0b' : '#e2e8f0'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transform: `translateX(${interpolate(cp, [0, 1], [-24, 0])}px)`,
                      opacity: interpolate(cp, [0, 1], [0, 1]),
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>{c.icon}</span>
                        <span style={{ color: '#5f6368', fontSize: '13px', fontWeight: 600 }}>{c.label}</span>
                      </div>
                      <div style={{
                        background: i === 0 ? '#fef3c7' : '#f1f3f4', color: c.color,
                        fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px',
                      }}>{c.count}</div>
                    </div>
                  );
                })}
              </div>

              {/* Main panel */}
              <div style={{ flex: 1, background: '#ffffff', padding: '22px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <div>
                    <div style={{ color: '#202124', fontSize: '16px', fontWeight: 700 }}>Jane Cooper — Billing Issue</div>
                    <div style={{ color: '#5f6368', fontSize: '11px', marginTop: '3px' }}>Session #4821 · Escalated 3 min ago</div>
                  </div>
                  <div style={{
                    padding: '6px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: 700,
                    background: claimP < 0.5 ? '#fef3c7' : '#d1fae5',
                    color: claimP < 0.5 ? '#b45309' : '#065f46',
                    border: `1px solid ${claimP < 0.5 ? '#f59e0b' : '#34a853'}`,
                    boxShadow: `0 0 10px ${claimP < 0.5 ? 'rgba(245,158,11,0.1)' : 'rgba(52,168,83,0.1)'}`,
                  }}>{claimP < 0.5 ? '⏳ Waiting' : '✓ Claimed'}</div>
                </div>
                <div style={{ flex: 1, background: '#f8f9fa', borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#5f6368', fontSize: '13px' }}>
                    <strong style={{ color: '#1a73e8' }}>Customer:</strong> I was charged twice, it's NOT giving what it's supposed to give.
                  </div>
                  <div style={{ color: '#5f6368', fontSize: '13px' }}>
                    <strong style={{ color: '#805ad5' }}>AI (Finance):</strong> Oh that is not valid. Escalating to human bestie right now.
                  </div>
                  <div style={{ color: '#5f6368', fontSize: '13px' }}>
                    <strong style={{ color: '#ea4335' }}>⚡ Escalated to human support</strong>
                  </div>
                  {claimP > 0.5 && (
                    <div style={{
                      color: '#202124', fontSize: '13px', marginTop: '4px',
                      padding: '10px', background: '#d1fae5', borderRadius: '10px',
                      border: '1px solid #34a853',
                    }}>
                      <strong style={{ color: '#137333' }}>Agent Sarah:</strong> Double charge refunded! We are back to cooking, fr fr. 🍳
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
