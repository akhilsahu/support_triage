import { AbsoluteFill } from 'remotion';
import React from 'react';

/**
 * Starfield — Light, clean blueprint grid with ambient blurred colorful orbs.
 * High-end SaaS canvas style with soft Google color palette gradients in the corners.
 */
export const Starfield: React.FC<{ glowColor?: string; glowOpacity?: number }> = ({
  glowColor = 'rgba(66, 133, 244, 0.06)',
  glowOpacity = 1,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#fcfcfe', overflow: 'hidden' }}>
      {/* Premium Blueprint Grid Pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(to right, rgba(226, 232, 240, 0.6) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(226, 232, 240, 0.6) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        opacity: 0.8,
      }} />

      {/* Floating Ambient Colorful Orbs (Google Palette) */}
      {/* Top Left: Blue */}
      <div style={{
        position: 'absolute', top: '-15%', left: '-10%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(66, 133, 244, 0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />

      {/* Top Right: Red */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-10%',
        width: '450px', height: '450px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(234, 67, 53, 0.06) 0%, transparent 70%)',
        filter: 'blur(50px)',
      }} />

      {/* Bottom Left: Yellow */}
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-5%',
        width: '550px', height: '550px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(251, 188, 5, 0.06) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />

      {/* Bottom Right: Green */}
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-10%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52, 168, 83, 0.07) 0%, transparent 70%)',
        filter: 'blur(55px)',
      }} />

      {/* Dynamic bottom glow overlay (per-scene customization) */}
      <AbsoluteFill style={{
        backgroundImage: `radial-gradient(ellipse 100% 50% at 50% 115%, ${glowColor} 0%, transparent 60%)`,
        opacity: glowOpacity,
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};
