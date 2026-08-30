import { AbsoluteFill } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { SubText } from '../components/SubText';
import { GoogleTitle } from '../components/GoogleTitle';

/**
 * Scene01_Hero — Opening title card.
 * Warm, clean Google-style design featuring Support247.chat with colorful letters.
 */
export const Scene01_Hero: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(66, 133, 244, 0.08)" />
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        gap: '24px',
        padding: '0 60px',
        boxSizing: 'border-box',
      }}>
        {/* Support247.chat styled colorful like Google */}
        <GoogleTitle delay={5} />
        
        <SubText text="Multi-Agent AI Support · Knowledge Base RAG · Human Inbox" delay={35} size={28} />
        
        <SubText text="Deploy intelligent chatbots in minutes. Not months." delay={60} size={20} color="#64748b" />
      </div>
    </AbsoluteFill>
  );
};
