import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { ChatBubble } from '../components/ChatBubble';

/**
 * Scene07_CustomerChat — Light themed chat window.
 * Clean white panel with slate borders and soft Google styling.
 */
export const Scene07_CustomerChat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
          <KineticText text="Customer Chat" delay={0} />
        </div>

        {/* Chat window mockup — pure white box */}
        {(() => {
          const p = spring({ frame: frame - 20, fps, config: { damping: 14 } });
          return (
            <div style={{
              width: '800px', height: '600px',
              background: '#ffffff', border: '1px solid #e2e8f0',
              borderRadius: '24px', overflow: 'hidden',
              transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
              opacity: interpolate(p, [0, 1], [0, 1]),
              boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
              display: 'flex', flexDirection: 'column',
              boxSizing: 'border-box',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 22px', borderBottom: '1px solid #e2e8f0',
                background: '#ffffff', display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '13px',
                  background: 'linear-gradient(135deg, #4285f4, #34a853)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', color: 'white',
                  boxShadow: '0 4px 14px rgba(66, 133, 244, 0.2)',
                }}>🤖</div>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <div style={{ color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>Support247 AI</div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>Online · Powered by RAG</div>
                </div>
              </div>

              {/* Messages — stacked vertically, no overlap */}
              <div style={{ flex: 1, padding: '18px 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <ChatBubble role="user" message="What's your refund policy for premium plans?" delay={20} />
                <ChatBubble role="ai" message="Premium plans offer a full refund within 30 days. After 30 days, we provide prorated credits. (Source: Refund Policy §3.2)" delay={40} agentName="Finance Agent" />
                <ChatBubble role="user" message="Can I downgrade instead?" delay={65} />
                <ChatBubble role="ai" message="You can downgrade anytime. The price difference is credited to your next billing cycle. Want me to help?" delay={85} agentName="Finance Agent" />
              </div>

              {/* Input */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{
                  flex: 1, padding: '12px 16px', borderRadius: '13px',
                  background: '#f8f9fa', border: '1px solid #e2e8f0',
                  color: '#9aa0a6', fontSize: '13px', fontFamily: 'Inter, sans-serif',
                }}>Ask anything...</div>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '13px',
                  background: 'linear-gradient(135deg, #4285f4, #2b6cb0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', color: 'white', boxShadow: '0 4px 14px rgba(66, 133, 244, 0.25)',
                }}>↑</div>
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
