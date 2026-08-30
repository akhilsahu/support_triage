import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { SubText } from '../components/SubText';
import { CTAButton } from '../components/CTAButton';
import { GoogleTitle } from '../components/GoogleTitle';

/**
 * Scene12_CTA — Final closing card.
 * Light Google theme with a centered Support247.chat GoogleTitle and action button.
 */
export const Scene12_CTA: React.FC = () => {
  const frame = useCurrentFrame();

  const glowScale = interpolate(frame, [0, 180], [0.6, 1.8], { extrapolateRight: 'clamp' });
  const glowOpacity = interpolate(frame, [0, 50], [0, 0.35], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(66, 133, 244, 0.08)" />

      {/* Convergence glow */}
      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{
          width: '600px', height: '600px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(66,133,244,0.12) 0%, rgba(52,168,83,0.04) 50%, transparent 70%)',
          transform: `scale(${glowScale})`, opacity: glowOpacity,
        }} />
      </AbsoluteFill>

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
        zIndex: 5,
      }}>
        {/* Support247.chat colorful GoogleTitle at end */}
        <GoogleTitle delay={10} />
        
        <SubText text="AI-Powered. Human-Backed. Enterprise-Ready." delay={20} size={30} color="#1e293b" />
        <SubText text="Setup Instantly · Scale Seamlessly · Deploy Today" delay={40} size={20} color="#64748b" />
        
        <div style={{ marginTop: '20px' }}>
          <CTAButton text="Get Started →" delay={60} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
