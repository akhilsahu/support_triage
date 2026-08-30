import { AbsoluteFill } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';
import { StatCard } from '../components/StatCard';

/**
 * Scene04_Dashboard — Stat cards grid.
 * Light Google theme with soft gray shadows.
 */
export const Scene04_Dashboard: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(251, 188, 5, 0.08)" />

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
          <KineticText text="Command Center" delay={0} />
          <SubText text="Real-time metrics, agent fleet status, and activity feed." delay={20} />
        </div>

        {/* Cards Row — flex center, no overlap */}
        <div style={{ display: 'flex', gap: '28px', justifyContent: 'center' }}>
          <StatCard label="Total Messages" value="12,847" icon="💬" gradientFrom="#4285f4" gradientTo="#2b6cb0" delta="+342 today" delay={15} />
          <StatCard label="RAG Hit Rate" value="94.2%" icon="📈" gradientFrom="#34a853" gradientTo="#2f855a" delta="Last 7 days" delay={25} />
          <StatCard label="Active Agents" value="8" icon="🤖" gradientFrom="#805ad5" gradientTo="#6b46c1" delta="Running now" delay={35} />
          <StatCard label="Knowledge Docs" value="156" icon="📚" gradientFrom="#f6e05e" gradientTo="#d69e2e" delta="156 documents" delay={45} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
