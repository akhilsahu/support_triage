import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, X, MapPin, Users, Activity } from 'lucide-react';
import { OrbitSignal } from '../../home/types';

interface OrbitSignalProps {
  signal: OrbitSignal;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onDismiss?: (id: string) => void;
  delay?: number;
}

const kindColors = {
  pulse: 'var(--accent-solid)',
  nearby: 'var(--network-cyan)',
  connection: 'var(--network-violet)',
  momentum: 'var(--attention)',
};

export default function OrbitSignalCard({ signal, onHoverStart, onHoverEnd, onDismiss, delay = 0 }: OrbitSignalProps) {
  const isReducedMotion = useReducedMotion();
  const isDominant = signal.prominence === 'dominant';
  const color = kindColors[signal.kind] || 'var(--text-secondary)';
  const [isHovered, setIsHovered] = useState(false);

  // Motion: Reveal
  const variants = {
    hidden: { opacity: 0, y: isReducedMotion ? 0 : 8 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay: isReducedMotion ? 0 : delay }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (onHoverStart) onHoverStart();
  };
  const handleMouseLeave = () => {
    setIsHovered(false);
    if (onHoverEnd) onHoverEnd();
  };

  // Base card styling
  const cardClasses = `group relative flex flex-col h-full bg-[var(--surface-soft)] border border-[var(--border)] overflow-hidden transition-colors hover:border-[var(--text-muted)] focus-within:border-[var(--text-muted)] ${
    isDominant ? 'col-span-full md:col-span-2 md:row-span-2' : ''
  }`;

  const renderContent = () => {
    switch (signal.kind) {
      case 'momentum':
        return (
          <div className="p-6 md:p-8 flex flex-col h-full relative">
            {/* Subtle metric increment / pulse effect */}
            <motion.div 
              className="absolute -top-32 -right-32 w-64 h-64 rounded-full blur-3xl pointer-events-none"
              style={{ backgroundColor: color }}
              animate={isHovered ? { opacity: 0.15, scale: 1.1 } : { opacity: 0.05, scale: 1 }}
              transition={{ duration: 0.6 }}
            />
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color }} />
                <span className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  {signal.relevance}
                </span>
              </div>
              <DismissButton onDismiss={onDismiss} signal={signal} />
            </div>
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 flex-1 items-start lg:items-center relative z-10">
              <div className="flex-1">
                <h4 className="font-[Satoshi] font-medium text-[34px] md:text-[42px] lg:text-[48px] text-[var(--text-primary)] leading-[1.1] tracking-tight mb-4">
                  {signal.title}
                </h4>
                <p className="font-[Instrument_Sans] text-[18px] md:text-[20px] text-[var(--text-secondary)] leading-relaxed">
                  {signal.body}
                </p>
              </div>
              {signal.metric && (
                <div className="flex-shrink-0 lg:text-right">
                  <motion.div 
                    className="font-[Satoshi] text-[56px] md:text-[72px] lg:text-[88px] font-medium leading-none tracking-tighter"
                    style={{ color }}
                    animate={isHovered ? { y: -2 } : { y: 0 }}
                  >
                    {signal.metric.value}
                  </motion.div>
                  <div className="text-[15px] text-[var(--text-secondary)] uppercase tracking-wider font-medium mt-3">
                    {signal.metric.label}
                  </div>
                </div>
              )}
            </div>
            <Footer signal={signal} isHovered={isHovered} />
          </div>
        );

      case 'nearby':
        return (
          <div className="p-6 flex flex-col h-full relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,_var(--network-cyan-trace)_0%,_transparent_50%)] opacity-30 pointer-events-none" />
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color }} />
                <span className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  {signal.relevance}
                </span>
              </div>
              <DismissButton onDismiss={onDismiss} signal={signal} />
            </div>
            
            <div className="flex-1 relative z-10">
              <motion.div 
                className="w-10 h-10 rounded-full border border-[var(--network-cyan)] flex items-center justify-center mb-5"
                animate={isHovered ? { scale: [1, 1.1, 1], borderColor: 'var(--text-primary)' } : {}}
                transition={{ duration: 1.5, repeat: isHovered ? Infinity : 0 }}
              >
                <div className="w-2 h-2 rounded-full bg-[var(--network-cyan)]" />
              </motion.div>
              <h4 className="font-[Satoshi] font-medium text-[22px] md:text-[26px] text-[var(--text-primary)] leading-tight tracking-tight mb-2">
                {signal.title}
              </h4>
              <p className="font-[Instrument_Sans] text-[16px] text-[var(--text-secondary)] leading-relaxed">
                {signal.body}
              </p>
            </div>
            <Footer signal={signal} isHovered={isHovered} />
          </div>
        );

      case 'connection':
        return (
          <div className="p-6 flex flex-col h-full relative overflow-hidden">
            <motion.div 
              className="absolute left-6 top-24 bottom-24 w-px bg-gradient-to-b from-transparent via-[var(--network-violet)] to-transparent"
              initial={{ opacity: 0.2 }}
              animate={isHovered ? { opacity: [0.2, 0.8, 0.2], scaleY: [1, 1.2, 1] } : { opacity: 0.2 }}
              transition={{ duration: 2, repeat: isHovered ? Infinity : 0 }}
            />
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2 pl-6">
                <Users className="w-4 h-4" style={{ color }} />
                <span className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  {signal.relevance}
                </span>
              </div>
              <DismissButton onDismiss={onDismiss} signal={signal} />
            </div>
            
            <div className="flex-1 pl-6 relative z-10">
              <h4 className="font-[Satoshi] font-medium text-[22px] md:text-[26px] text-[var(--text-primary)] leading-tight tracking-tight mb-2">
                {signal.title}
              </h4>
              <p className="font-[Instrument_Sans] text-[16px] text-[var(--text-secondary)] leading-relaxed">
                {signal.body}
              </p>
            </div>
            <div className="pl-6 pt-6">
              <Footer signal={signal} isHovered={isHovered} noBorder />
            </div>
          </div>
        );

      case 'pulse':
      default:
        return (
          <div className="p-6 flex flex-col h-full relative">
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color }} />
                <span className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  {signal.relevance}
                </span>
              </div>
              <DismissButton onDismiss={onDismiss} signal={signal} />
            </div>
            
            <div className="flex-1 relative z-10">
              <h4 className="font-[Satoshi] font-medium text-[22px] md:text-[26px] text-[var(--text-primary)] leading-tight tracking-tight mb-3">
                {signal.title}
              </h4>
              <motion.div 
                className="font-[Instrument_Sans] text-[16px] text-[var(--text-secondary)] leading-relaxed p-4 bg-[var(--canvas)] rounded-lg border border-[var(--border)]"
                animate={isHovered ? { y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } : { y: 0, boxShadow: '0 0px 0px rgba(0,0,0,0)' }}
              >
                {signal.body}
              </motion.div>
            </div>
            <Footer signal={signal} isHovered={isHovered} />
          </div>
        );
    }
  };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className={cardClasses}
    >
      {renderContent()}
    </motion.div>
  );
}

const DismissButton = ({ onDismiss, signal }: { onDismiss?: (id: string) => void, signal: OrbitSignal }) => {
  if (signal.dismissible === false || !onDismiss) return null;
  return (
    <button 
      onClick={(e) => { e.preventDefault(); onDismiss(signal.id); }}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all p-1"
      aria-label="Dismiss"
    >
      <X className="w-4 h-4" />
    </button>
  );
};

const Footer = ({ signal, isHovered, noBorder }: { signal: OrbitSignal, isHovered: boolean, noBorder?: boolean }) => (
  <div className={`mt-8 flex items-center justify-between pt-6 ${noBorder ? '' : 'border-t border-[var(--border)]'} relative z-10`}>
    <span className="text-[13px] text-[var(--text-muted)] font-medium">
      {signal.evidence.sourceLabel} · {new Date(signal.evidence.observedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
    </span>
    <Link 
      to={signal.action.href}
      className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity"
    >
      {signal.action.label} 
      <motion.div animate={isHovered ? { x: 3 } : { x: 0 }}>
        <ArrowRight className="w-3.5 h-3.5" />
      </motion.div>
    </Link>
  </div>
);
