import React from 'react';
import { motion } from 'framer-motion';
import { RightNowSummary } from '../../home/types';

type RightNowProps = {
  data: RightNowSummary;
};

export const RightNow: React.FC<RightNowProps> = ({ data }) => {
  const globalEase = [0.22, 1, 0.36, 1] as const;
  
  return (
    <motion.section
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: globalEase, delay: 0.08 }}
      className="flex flex-col justify-center h-full"
    >
      <h3 className="text-[15px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-8">
        Right now
      </h3>
      <div className="space-y-6">
        {data.conversations !== undefined && data.conversations > 0 && (
          <div className="flex justify-between items-center border-b border-[var(--mosaic-hairline)] pb-4">
            <span className="text-[16px] text-[var(--text-secondary)] font-medium">Conversations active</span>
            <span className="text-[20px] font-semibold text-[var(--text-primary)] font-[Satoshi]">{data.conversations}</span>
          </div>
        )}
        {data.enquiries !== undefined && data.enquiries > 0 && (
          <div className="flex justify-between items-center border-b border-[var(--mosaic-hairline)] pb-4">
            <span className="text-[16px] text-[var(--text-secondary)] font-medium">New enquiries</span>
            <span className="text-[20px] font-semibold text-[var(--text-primary)] font-[Satoshi]">{data.enquiries}</span>
          </div>
        )}
        {data.actionableIssues !== undefined && data.actionableIssues > 0 && (
          <div className="flex justify-between items-center border-b border-[var(--mosaic-hairline)] pb-4">
            <span className="text-[16px] text-[var(--text-secondary)] font-medium">Actionable issues</span>
            <span className="text-[20px] font-semibold text-[var(--attention)] font-[Satoshi]">{data.actionableIssues}</span>
          </div>
        )}
      </div>
    </motion.section>
  );
};
