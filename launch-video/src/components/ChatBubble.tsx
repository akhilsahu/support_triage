import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

/**
 * ChatBubble - clean light theme chat bubble.
 */
export const ChatBubble: React.FC<{
  role: 'user' | 'ai';
  message: string;
  delay?: number;
  agentName?: string;
}> = ({role, message, delay = 0, agentName}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16, stiffness: 120 }
  });
  
  const xOffset = interpolate(progress, [0, 1], [role === 'user' ? 60 : -60, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  
  const isUser = role === 'user';
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      transform: `translateX(${xOffset}px)`,
      opacity,
      padding: '0 30px',
      marginBottom: '14px',
      alignItems: 'flex-end',
      gap: '10px',
    }}>
      {/* AI avatar */}
      {!isUser && (
        <div style={{
          width: '34px', height: '34px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #4285F4, #34A853)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '15px', color: 'white', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(66, 133, 244, 0.25)',
        }}>🤖</div>
      )}
      <div style={{
        maxWidth: '460px',
        padding: '14px 18px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #4285F4, #2b6cb0)'
          : '#f1f5f9',
        border: isUser ? 'none' : '1px solid #e2e8f0',
        color: isUser ? 'white' : '#1e293b',
        fontSize: '15px',
        lineHeight: 1.5,
        fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: isUser ? '0 4px 12px rgba(66, 133, 244, 0.15)' : 'none',
      }}>
        {/* Agent badge for AI */}
        {!isUser && agentName && (
          <div style={{
            fontSize: '10px', fontWeight: 700, color: '#3b82f6',
            marginBottom: '6px',
            background: 'rgba(66, 133, 244, 0.08)',
            padding: '2px 8px', borderRadius: '100px',
            display: 'inline-block',
            border: '1px solid rgba(66, 133, 244, 0.15)',
          }}>{agentName}</div>
        )}
        {message}
      </div>
    </div>
  );
};
