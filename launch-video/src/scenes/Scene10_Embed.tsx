import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene10_Embed — Platform code snippets.
 * Light Google theme with clean, bordered code box.
 */
export const Scene10_Embed: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const platforms = [
    { label: 'HTML', icon: '🌐', active: true },
    { label: 'Shopify', icon: '🛍️', active: false },
    { label: 'WordPress', icon: '📝', active: false },
    { label: 'React', icon: '⚛️', active: false },
  ];

  const codeLines = [
    { text: '<!-- Support247 Widget -->', color: '#94a3b8' },
    { text: '<script', color: '#3b82f6' },
    { text: '  src="https://app.support247.ai/widget.js"', color: '#059669' },
    { text: '  data-api-key="sk_live_abc123..."', color: '#d97706' },
    { text: '  async', color: '#3b82f6' },
    { text: '></script>', color: '#3b82f6' },
  ];

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(66, 133, 244, 0.08)" />

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
          <KineticText text="Embed Anywhere" delay={0} />
          <SubText text="One script tag. HTML, Shopify, WordPress, or React." delay={20} />
        </div>

        {/* Code box panel mockup — single flex, no overlap */}
        {(() => {
          const p = spring({ frame: frame - 20, fps, config: { damping: 14 } });
          return (
            <div style={{
              width: '960px',
              transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
              opacity: interpolate(p, [0, 1], [0, 1]),
              background: '#ffffff', border: '1px solid #e2e8f0',
              borderRadius: '22px', padding: '24px',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
              boxSizing: 'border-box',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {platforms.map((pl) => (
                  <div key={pl.label} style={{
                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: pl.active ? 'rgba(66, 133, 244, 0.1)' : '#f8f9fa',
                    border: pl.active ? '1px solid rgba(66, 133, 244, 0.3)' : '1px solid #e2e8f0',
                    color: pl.active ? '#1a73e8' : '#5f6368',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>{pl.icon} {pl.label}</div>
                ))}
              </div>
              <div style={{
                background: '#f8f9fa', borderRadius: '14px', padding: '20px',
                border: '1px solid #e2e8f0',
              }}>
                {codeLines.map((l, i) => {
                  const lp = interpolate(frame - 40 - i * 5, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  return (
                    <div key={i} style={{
                      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
                      fontSize: '14px', lineHeight: 2, color: l.color,
                      opacity: lp, transform: `translateX(${(1 - lp) * 16}px)`,
                    }}>{l.text}</div>
                  );
                })}
              </div>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '8px 20px', borderRadius: '10px',
                  background: '#1a73e8',
                  color: 'white', fontSize: '13px', fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(26, 115, 232, 0.25)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>📋 Copy Snippet</div>
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
