import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { ForYouItem } from '../../home/types';

type ForYouProps = {
  items: ForYouItem[];
};

export const ForYou: React.FC<ForYouProps> = ({ items }) => {
  const globalEase = [0.22, 1, 0.36, 1] as const;
  const displayItems = items.slice(0, 2); // Max 1 primary, 1 secondary
  
  return (
    <motion.section
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: globalEase, delay: 0.12 }}
    >
      <div className="flex items-center gap-3 mb-6 lg:mb-8">
        <div className="w-6 h-[2px] bg-[var(--anchor-discovery)]" />
        <h3 className="text-[15px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          For you
        </h3>
      </div>
      <ul className="space-y-8">
        {displayItems.map((item) => (
          <ForYouCard key={item.id} item={item} />
        ))}
      </ul>
    </motion.section>
  );
};

const ForYouCard: React.FC<{ item: ForYouItem }> = ({ item }) => {
  const [showRelevance, setShowRelevance] = useState(false);

  return (
    <li className="group">
      <div className="flex flex-col">
        <p className="text-[15px] text-[var(--text-secondary)] mb-1">
          <span className="font-medium mr-1 text-[var(--text-primary)]">{item.spaceName}</span>
          <span>· {item.evidence.sourceLabel}</span>
        </p>
        <p className="text-[17px] text-[var(--text-primary)] font-medium leading-snug">
          {item.title}
        </p>
        
        <div className="mt-2.5 flex items-start gap-2">
          <button 
            onClick={() => setShowRelevance(!showRelevance)}
            className="flex items-center gap-1.5 text-[14px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-0.5"
            aria-expanded={showRelevance}
          >
            <Info className="w-3.5 h-3.5" />
            Why this?
          </button>
        </div>
        
        <AnimatePresence>
          {showRelevance && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 pb-1">
                <p className="text-[14px] text-[var(--text-secondary)] italic border-l-2 border-[var(--border)] pl-3">
                  {item.relevance}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Link 
          to={item.action.href}
          className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity mt-4 group-hover:text-[var(--text-primary)]"
        >
          {item.action.label} <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    </li>
  );
};
