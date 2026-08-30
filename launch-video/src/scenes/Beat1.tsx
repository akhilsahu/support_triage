import { AbsoluteFill, Sequence } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';

export const Beat1: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield />
      <Sequence from={0} durationInFrames={60}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
          <KineticText text="Support at Scale." delay={0} />
        </div>
      </Sequence>
      <Sequence from={60}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', flexDirection: 'column', gap: '20px' }}>
          <KineticText text="Support at Scale." delay={0} />
          <KineticText text="Mastered." delay={60} />
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
