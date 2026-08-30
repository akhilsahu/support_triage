import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene03B_SpaceCustomizer — Create custom Spaces & Tune for Best Response.
 * Shows space creation, brand persona guidelines,
 * reasoning effort, prompt rules, and response accuracy meter.
 */
export const Scene03B_SpaceCustomizer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const anim = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const scale = interpolate(anim, [0, 1], [0.92, 1]);
  const opacity = interpolate(anim, [0, 1], [0, 1]);

  const brandRules = [
    { name: 'Concise Tone', tag: 'Keep responses under 3 sentences', color: '#4285f4', active: true },
    { name: 'Strict RAG', tag: 'Only use verified uploaded docs', color: '#10b981', active: true },
    { name: 'Human Fallback', tag: 'Auto-escalate complex payments', color: '#ea4335', active: true },
  ];

  const tuningOptions = [
    { label: 'Reasoning Effort', val: 'High (Deep Thought)', color: '#8b5cf6' },
    { label: 'Temperature', val: '0.2 (Factual & Precise)', color: '#06b6d4' },
    { label: 'RAG Retrieval Scope', val: 'Top 5 Docs + Rerank', color: '#10b981' },
    { label: 'Human Fallback Trigger', val: 'Confidence < 85%', color: '#f59e0b' },
  ];

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(139, 92, 246, 0.08)" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '30px 40px',
        boxSizing: 'border-box',
        gap: '20px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <KineticText text="Custom Spaces & Brand Rules" delay={0} />
          <SubText text="Set up custom brand spaces and define agent rules for the most accurate responses." delay={10} />
        </div>

        {/* Main UI Mockup */}
        <div style={{
          width: '1200px',
          background: '#ffffff',
          borderRadius: '28px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 60px rgba(0,0,0,0.06)',
          padding: '42px',
          display: 'flex',
          gap: '32px',
          transform: `scale(${scale})`,
          opacity,
          boxSizing: 'border-box',
        }}>
          {/* Left: Space Config & Model Controls */}
          <div style={{
            flex: 1.2,
            background: '#ffffff',
            borderRadius: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Space Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4285f4, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '18px', fontWeight: 'bold',
                }}>🚀</div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Space: Acme Brand Store</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>acme.support247.chat</div>
                </div>
              </div>
              <div style={{
                background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0',
                padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 700,
              }}>● Live & Active</div>
            </div>

            {/* Brand Persona Rules */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Brand Persona & Safety Rules
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {brandRules.map((r) => (
                  <div key={r.name} style={{
                    flex: 1, padding: '12px 14px', borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                    boxShadow: `0 4px 10px ${r.color}0a`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: r.color }}>✓</span>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{r.name}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{r.tag}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Response Tuning Grid */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Response Quality & Safety Tuning
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {tuningOptions.map((t) => (
                  <div key={t.label} style={{
                    padding: '12px 14px', borderRadius: '12px',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{t.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>{t.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live AI Persona & Quality Benchmark Card */}
          <div style={{
            flex: 0.9,
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>AI Persona Prompt Preview</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>Auto-Optimized</div>
              </div>
              <div style={{
                background: '#f1f5f9', borderRadius: '12px', padding: '14px',
                fontSize: '12px', color: '#334155', lineHeight: 1.6, fontFamily: 'monospace',
                border: '1px solid #e2e8f0',
              }}>
                &ldquo;You are the senior brand assistant for Acme. Always prioritize accuracy with cited knowledge docs. Maintain an empathetic, professional tone and escalate complex refunds to human inbox.&rdquo;
              </div>
            </div>

            {/* Quality Score Metrics */}
            <div style={{
              background: '#ffffff', borderRadius: '16px', padding: '16px',
              border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Response Precision Score</span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>99.6%</span>
              </div>
              {/* Progress bar */}
              <div style={{ width: '100%', height: '8px', borderRadius: '100px', background: '#e2e8f0' }}>
                <div style={{ width: '99.6%', height: '100%', borderRadius: '100px', background: 'linear-gradient(90deg, #3b82f6, #10b981)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                <span>✓ Zero Hallucinations</span>
                <span>✓ Instant Sub-second Latency</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
