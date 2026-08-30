import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene11_Features — Quick-fire feature wall.
 * Light Google theme withbordered badges.
 */
export const Scene11_Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const features = [
    { icon: '🧠', label: 'RAG Pipeline',     color: '#4285f4' },
    { icon: '🔄', label: 'Reranking',        color: '#00bac6' },
    { icon: '💾', label: 'Session Memory',    color: '#805ad5' },
    { icon: '🔐', label: 'KB Scoping',       color: '#34a853' },
    { icon: '⚡', label: 'Async Ingestion',  color: '#ea4335' },
    { icon: '🌐', label: 'Multi-Chatbot',    color: '#ec4899' },
    { icon: '🎯', label: 'Auto Triage',      color: '#a78bfa' },
    { icon: '📊', label: 'Real Analytics',   color: '#2dd4bf' },
    { icon: '🔗', label: 'Embed Widget',     color: '#1a73e8' },
    { icon: '🤝', label: 'Human Handoff',    color: '#fb923c' },
    { icon: '💡', label: 'Chain-of-Thought', color: '#e879f9' },
    { icon: '🏢', label: 'Multi-Tenant',     color: '#64748b' },
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
          <KineticText text="Everything You Need" delay={0} />
          <SubText text="Production-ready. No assembly required." delay={20} />
        </div>

        {/* Feature badge grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', justifyContent: 'center', maxWidth: '1150px', padding: '0 40px' }}>
          {features.map((f, i) => {
            const p = spring({ frame: frame - 20 - i * 3, fps, config: { damping: 14, stiffness: 120 } });
            return (
              <div key={f.label} style={{
                transform: `scale(${interpolate(p, [0, 1], [0.85, 1])}) translateY(${interpolate(p, [0, 1], [20, 0])}px)`,
                padding: '12px 20px', borderRadius: '12px',
                background: '#ffffff', border: `1px solid #e2e8f0`,
                display: 'flex', alignItems: 'center', gap: '8px',
                fontFamily: 'Inter, sans-serif',
                boxShadow: `0 4px 12px rgba(0,0,0,0.03), 0 0 10px ${f.color}0a`,
              }}>
                <span style={{ fontSize: '20px' }}>{f.icon}</span>
                <span style={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{f.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
