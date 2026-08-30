import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';

/**
 * Scene03C_CustomEndpoint — Explains the custom user-controlled endpoint feature.
 * Shows typing "ShopFever" into the Business Name input, generating the custom URL
 * "support247.chat/shopfever", and launching the user-controlled space.
 */
export const Scene03C_CustomEndpoint: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Typewriter effect for "ShopFever"
  const businessName = "ShopFever";
  const typeSpeed = 3; // frames per letter
  const typeStart = 10;
  const charsShown = Math.min(
    businessName.length,
    Math.max(0, Math.floor((frame - typeStart) / typeSpeed))
  );
  const currentName = businessName.slice(0, charsShown);

  // Animate URL generation panel
  const setupPanelAnim = spring({ frame, fps, config: { damping: 15 } });
  const setupScale = interpolate(setupPanelAnim, [0, 1], [0.92, 1]);
  const setupOpacity = interpolate(setupPanelAnim, [0, 1], [0, 1]);

  // Animate browser preview transition (comes in after typing is done)
  const previewStart = 40;
  const previewAnim = spring({ frame: frame - previewStart, fps, config: { damping: 14 } });
  const previewScale = interpolate(previewAnim, [0, 1], [0.85, 1]);
  const previewOpacity = interpolate(previewAnim, [0, 1], [0, 1]);
  const previewTranslateY = interpolate(previewAnim, [0, 1], [60, 0]);

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
        padding: '30px 40px',
        boxSizing: 'border-box',
        gap: '24px',
      }}>
        {/* Header Block — clean, no overlap */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <KineticText text="Your Own Branded Space" delay={0} />
          <SubText text="Get a dedicated, 100% user-controlled chat URL instantly." delay={10} />
        </div>

        {/* Content Layout — flex container containing both setup and preview side-by-side */}
        <div style={{
          display: 'flex',
          gap: '36px',
          width: '1150px',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Left: Interactive Creation Panel */}
          <div style={{
            flex: 1,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            padding: '36px',
            boxShadow: '0 15px 35px rgba(0,0,0,0.04)',
            transform: `scale(${setupScale})`,
            opacity: setupOpacity,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxSizing: 'border-box',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Enter Business Name
              </label>
              <div style={{
                padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1',
                fontSize: '15px', color: '#1e293b', background: '#f8fafc',
                fontFamily: 'Inter, sans-serif', fontWeight: 500,
                display: 'flex', alignItems: 'center', minHeight: '45px', boxSizing: 'border-box'
              }}>
                {currentName}
                {frame > typeStart && frame < typeStart + businessName.length * typeSpeed && (
                  <span style={{ marginLeft: '2px', width: '2px', height: '18px', background: '#3b82f6', display: 'inline-block', animation: 'pulse 1s infinite' }}>|</span>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Generated Custom Link
              </label>
              <div style={{
                padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(66, 133, 244, 0.2)',
                background: 'rgba(66, 133, 244, 0.03)', fontSize: '15px', fontFamily: 'monospace',
                color: '#1e293b', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <span>
                  support247.chat/
                  <span style={{ color: '#1a73e8', fontWeight: 700 }}>{charsShown > 0 ? currentName.toLowerCase() : '...'}</span>
                </span>
                {charsShown === businessName.length && (
                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>● Active URL</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Live Space Browser Preview */}
          {frame >= previewStart && (
            <div style={{
              flex: 1.1,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '24px',
              overflow: 'hidden',
              transform: `scale(${previewScale}) translateY(${previewTranslateY}px)`,
              opacity: previewOpacity,
              boxShadow: '0 20px 50px rgba(0,0,0,0.06)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              height: '280px',
            }}>
              {/* Browser Address Bar */}
              <div style={{
                background: '#f1f5f9', padding: '8px 16px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{
                  flex: 1, background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1',
                  padding: '4px 12px', fontSize: '11px', color: '#475569', textAlign: 'center',
                  fontFamily: 'monospace',
                }}>
                  https://support247.chat/shopfever
                </div>
              </div>

              {/* Custom Branded Workspace UI */}
              <div style={{
                padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px',
                fontFamily: 'Inter, sans-serif', flex: 1, justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', background: '#3b82f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: 'white',
                  }}>🛍️</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>ShopFever Space</div>
                </div>
                <div style={{
                  padding: '12px 14px', borderRadius: '12px', background: '#f8fafc',
                  border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', lineHeight: 1.4
                }}>
                  <strong>AI Assistant:</strong> Welcome to ShopFever bestie, what are we shopping today? 💅
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
