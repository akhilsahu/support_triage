import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene05_KnowledgeBase — Upload & ingestion.
 * Light Google theme with clean, border-shadowed white panel.
 */
export const Scene05_KnowledgeBase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tabs = [
    { label: '📄 File Upload', active: true },
    { label: '✏️ Text', active: false },
    { label: '❓ Q&A', active: false },
    { label: '🌐 URL', active: false },
  ];

  const ingestionProgress = interpolate(frame, [40, 100], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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
          <KineticText text="Knowledge Base" delay={0} />
          <SubText text="Upload docs, text, Q&A, or URLs — auto-chunked and ready for RAG." delay={20} />
        </div>

        {/* KB Panel mockup — clean light box */}
        {(() => {
          const p = spring({ frame: frame - 20, fps, config: { damping: 14 } });
          return (
            <div style={{
              width: '1000px',
              transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
              opacity: interpolate(p, [0, 1], [0, 1]),
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '24px',
              padding: '32px',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {tabs.map((t) => (
                  <div key={t.label} style={{
                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: t.active ? 'rgba(66, 133, 244, 0.1)' : '#f8f9fa',
                    border: t.active ? '1px solid rgba(66, 133, 244, 0.3)' : '1px solid #e2e8f0',
                    color: t.active ? '#1a73e8' : '#5f6368',
                  }}>{t.label}</div>
                ))}
              </div>
              <div style={{
                border: '2px dashed rgba(66, 133, 244, 0.25)', borderRadius: '16px',
                padding: '30px', textAlign: 'center', marginBottom: '16px',
                background: '#f8f9fa',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                <div style={{ color: '#5f6368', fontSize: '14px', fontWeight: 500 }}>Drop PDF, DOCX, TXT, or CSV here</div>
                <div style={{ color: '#9aa0a6', fontSize: '11px', marginTop: '4px' }}>Up to 50MB per file</div>
              </div>
              <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#202124', fontSize: '13px', fontWeight: 600 }}>📄 product-manual.pdf</span>
                  <span style={{ color: '#137333', fontSize: '12px', fontWeight: 600 }}>{ingestionProgress >= 100 ? '✓ Indexed' : `${Math.round(ingestionProgress)}%`}</span>
                </div>
                <div style={{ width: '100%', height: '5px', borderRadius: '100px', background: '#dadce0' }}>
                  <div style={{
                    width: `${ingestionProgress}%`, height: '100%', borderRadius: '100px',
                    background: 'linear-gradient(90deg, #4285f4, #34a853)',
                    boxShadow: '0 0 10px rgba(66, 133, 244, 0.2)',
                  }} />
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
