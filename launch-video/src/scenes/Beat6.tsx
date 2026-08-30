import { AbsoluteFill } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';

export const Beat6: React.FC = () => {
  return (
    <AbsoluteFill>
      <Starfield />
      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '30px' }}>
        <KineticText text="Enterprise Support." delay={0} />
        <KineticText text="Scaled." delay={30} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
