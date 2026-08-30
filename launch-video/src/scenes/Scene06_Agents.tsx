import { AbsoluteFill } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';
import { AgentNode, DataBeam } from '../components/AgentNode';

/**
 * Scene06_Agents — Multi-agent routing topology.
 * Light theme with clean Google-style specialist colors.
 */
export const Scene06_Agents: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(52, 168, 83, 0.08)" />

      {/* Header Block — clean, no overlap */}
      <div style={{
        position: 'absolute', top: '40px', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', zIndex: 10
      }}>
        <KineticText text="Agent Fleet" delay={0} />
        <SubText text="Triage routes every message to the right specialist agent." delay={15} />
      </div>

      {/* Data beams (rendered behind nodes) */}
      <DataBeam fromX={0} fromY={-80} toX={-340} toY={120} delay={30} color="#4285f4" />
      <DataBeam fromX={0} fromY={-80} toX={-115} toY={170} delay={35} color="#a78bfa" />
      <DataBeam fromX={0} fromY={-80} toX={115} toY={170} delay={40} color="#34a853" />
      <DataBeam fromX={0} fromY={-80} toX={340} toY={120} delay={45} color="#ea4335" />

      {/* Central triage hub */}
      <AgentNode label="Triage" icon="🎯" x={0} y={-80} delay={5} color="#a78bfa" size={160} />

      {/* Specialist agents spokes */}
      <AgentNode label="Finance" icon="💰" x={-340} y={120} delay={15} color="#4285f4" size={120} />
      <AgentNode label="Orders" icon="📦" x={-115} y={170} delay={25} color="#a78bfa" size={120} />
      <AgentNode label="Technical" icon="🔧" x={115} y={170} delay={35} color="#34a853" size={120} />
      <AgentNode label="Logistics" icon="🚚" x={340} y={120} delay={45} color="#ea4335" size={120} />
    </AbsoluteFill>
  );
};
