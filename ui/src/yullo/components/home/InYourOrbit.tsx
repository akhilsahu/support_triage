import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrbitSectionData, OrbitSignal } from '../../home/types';
import OrbitSignalCard from './OrbitSignal';

interface InYourOrbitProps {
  data: OrbitSectionData;
  onSpaceHighlight?: (spaceId: string | null) => void;
}

export default function InYourOrbit({ data, onSpaceHighlight }: InYourOrbitProps) {
  const [signals, setSignals] = useState<OrbitSignal[]>(data.signals);

  const handleDismiss = (id: string) => {
    setSignals(prev => prev.filter(s => s.id !== id));
  };

  if (signals.length === 0) return null;

  // Ensure dominant is first
  const sortedSignals = [...signals].sort((a, b) => 
    (a.prominence === 'dominant' ? -1 : 1) - (b.prominence === 'dominant' ? -1 : 1)
  );

  const count = sortedSignals.length;

  return (
    <div className="w-full relative z-10">
      <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] py-12 lg:py-16">
        <div className="mb-8 lg:mb-10">
          <h3 className="text-[13px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-[0.15em] mb-2">
            {data.title}
          </h3>
          <p className="text-[16px] text-[var(--text-secondary)] font-[Instrument_Sans]">
            {data.subtitle}
          </p>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8`}>
          <AnimatePresence mode="sync">
            {sortedSignals.map((signal, index) => {
              const isDominant = signal.prominence === 'dominant';
              
              // Compute layout classes based on count
              let layoutClasses = '';
              if (count === 1) {
                layoutClasses = 'col-span-1 lg:col-span-3';
              } else if (count === 2) {
                layoutClasses = isDominant ? 'col-span-1 lg:col-span-2' : 'col-span-1 lg:col-span-1';
              } else if (count === 3) {
                layoutClasses = isDominant ? 'col-span-1 lg:col-span-2 lg:row-span-2' : 'col-span-1 lg:col-span-1 lg:row-span-1';
              } else if (count === 4) {
                if (isDominant) layoutClasses = 'col-span-1 lg:col-span-2 lg:row-span-2';
                else if (index === 1) layoutClasses = 'col-span-1 lg:col-span-1 lg:row-span-2';
                else if (index === 2) layoutClasses = 'col-span-1 lg:col-span-1 lg:row-span-1';
                else layoutClasses = 'col-span-1 lg:col-span-2 lg:row-span-1';
              }

              return (
                <motion.div 
                  key={signal.id}
                  layout
                  className={layoutClasses}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                >
                  <OrbitSignalCard 
                    signal={signal} 
                    delay={index * 0.08}
                    onDismiss={handleDismiss}
                    onHoverStart={() => {
                      if (signal.scope.kind === 'space') {
                        onSpaceHighlight?.(signal.scope.spaceId);
                      }
                    }}
                    onHoverEnd={() => {
                      if (signal.scope.kind === 'space') {
                        onSpaceHighlight?.(null);
                      }
                    }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
