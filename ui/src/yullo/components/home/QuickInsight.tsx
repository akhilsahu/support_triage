import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { QuickInsight as QuickInsightType } from '../../home/types';

type QuickInsightProps = {
  data?: QuickInsightType;
};

export const QuickInsight: React.FC<QuickInsightProps> = ({ data }) => {
  if (!data) return null;
  const globalEase = [0.22, 1, 0.36, 1] as const;


  return (
    <motion.section
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: globalEase, delay: 0.15 }}
      className="flex flex-col h-full"
    >
      <div className="flex items-center gap-3 mb-6 lg:mb-8">
        <div className="w-6 h-[2px] bg-[var(--anchor-insight)]" />
        <h3 className="text-[15px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Quick insight
        </h3>
      </div>
      <div className="border border-[var(--border)] bg-[var(--surface-soft)] p-6 md:p-8 flex-1 flex flex-col justify-between group hover:border-[var(--text-muted)] transition-colors relative overflow-hidden">
        
        {/* Subtle background glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-[var(--network-violet)] opacity-5 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10">
          <p className="text-[14px] text-[var(--text-secondary)] mb-4 font-medium uppercase tracking-widest">
            {data.spaceName}
          </p>
          
          {data.metric && (
            <div className="mb-6 flex flex-col gap-1">
              <div className="text-[42px] md:text-[56px] font-medium font-[Satoshi] leading-none tracking-tight text-[var(--text-primary)]">
                {data.metric.value}
              </div>
              <div className="text-[14px] text-[var(--text-secondary)]">
                {data.metric.label}
              </div>
            </div>
          )}

          <p className="text-[16px] md:text-[18px] text-[var(--text-primary)] font-medium leading-relaxed font-[Instrument_Sans]">
            {data.statement}
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between pt-6 border-t border-[var(--border)] relative z-10">
          <span className="text-[13px] text-[var(--text-muted)] font-medium">
            {data.evidence.sourceLabel}
          </span>
          {data.action && (
            <Link 
              to={data.action.href}
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity group-hover:text-[var(--anchor-insight)]"
            >
              {data.action.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );

};
