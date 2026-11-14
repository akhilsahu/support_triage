import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AmbientWorldField } from '../components/AmbientWorldField';
import { RightNow } from '../components/home/RightNow';
import { ForYou } from '../components/home/ForYou';
import { QuickInsight } from '../components/home/QuickInsight';
import { Nearby } from '../components/home/Nearby';
import { YulloAppHeader } from '../components/YulloAppHeader';

import { yulloConfig } from '../config';
import { validateHomeSections, getVisibleSections } from '../home/sectionConfig';
import { SectionComponents } from '../home/sectionRegistry';

import { mapYulloHomeResponse } from '../home/apiAdapter';
import { useYulloHome } from '../api/queries';
import { formsApi } from '../api/forms';
import { BookingForm } from '../forms/BookingForm';
import type { HomeData, HomeSpace } from '../home/types';

// ─── Theme Management (Moved to YulloAppProviders) ───


// ─── Editorial Space Row ───
const SpaceRow = ({ space, index }: { space: HomeSpace, index: number }) => {
  const navigate = useNavigate();
  const isDraft = space.status === 'draft';
  const needsAttention = space.auraStatus === 'attention';
  
  // Format index to a 2-digit number string (01, 02, 03...) for editorial numbering beside space icon
  const spaceNumber = String(index + 1).padStart(2, '0');

  // Choose one single status phrase to match requested design
  let statusPhrase = "";
  if (isDraft) statusPhrase = "Draft";
  else if (needsAttention) statusPhrase = "Source needs reconnection";
  else if (space.demandScore > 5) statusPhrase = "Interest is rising";
  else statusPhrase = "Live";

  const actionPhrase = isDraft ? "Continue setup" : needsAttention ? "Fix connection" : "Open Space";
  
  return (
    <div 
      className="group relative py-12 cursor-pointer border-b border-[var(--border)] last:border-0"
      onClick={() => navigate(`/yullo/spaces/${space.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/yullo/spaces/${space.id}`); }}
    >
      <div className="flex items-start md:items-center gap-6">
        {/* Icon wrapper with big bold background watermark number behind transparent icon */}
        <div className="relative flex-shrink-0 flex items-center justify-center w-12 h-12">
          {/* Background watermark number (01, 02...) big, bold, clearly readable behind transparent icon */}
          <span 
            className="absolute flex items-center justify-center font-[Satoshi] text-[52px] font-black leading-none text-[var(--text-primary)] opacity-40 group-hover:opacity-75 transition-opacity select-none pointer-events-none z-0 tracking-tighter"
            aria-hidden="true"
          >
            {spaceNumber}
          </span>

          {/* Space Monogram Icon - Transparent container allowing background number to be visible */}
          <div 
            className="relative z-10 w-12 h-12 rounded-lg flex items-center justify-center text-[18px] font-bold font-[Satoshi] border border-[var(--border)] bg-transparent backdrop-blur-[2px]"
            style={{ 
              color: isDraft ? 'var(--text-muted)' : (space.accentColor || 'var(--text-primary)')
            }}
          >
            {space.monogram || space.name.charAt(0)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <motion.h3 
              className="font-[Satoshi] text-[32px] font-semibold text-[var(--text-primary)] tracking-tight leading-none"
              initial={{ x: 0 }}
              whileHover={{ x: 2 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {space.name}
            </motion.h3>
            
            <span className={`text-[17px] font-[Instrument_Sans] ${needsAttention ? 'text-[var(--attention)]' : 'text-[var(--text-primary)]'}`}>
              — “{statusPhrase}”
            </span>
          </div>
          
          {/* Action */}
          <div className="flex items-center gap-1.5 text-[15px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
            {actionPhrase}
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const YulloHome = () => {
  const [bookingSpace, setBookingSpace] = useState<HomeSpace | null>(null);
  const [bookingSaved, setBookingSaved] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [deleteTargetSpace, setDeleteTargetSpace] = useState<HomeSpace | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: rawData, error, isLoading } = useYulloHome();
  const data = rawData ? mapYulloHomeResponse(rawData) : null;

  useEffect(() => {
    document.title = `${yulloConfig.nomenclature.title} — Home`;
  }, []);

  useEffect(() => { setDeleteFailure(''); }, [deleteTargetSpace?.id]);

  if (error) {
    return (
      <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] transition-colors duration-200">
        <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)]">
           <YulloAppHeader />
           <div className="mt-16 max-w-2xl">
             <h1 className="font-[Satoshi] text-[24px] font-medium text-[var(--critical)] mb-4">
               Unable to load your Home
             </h1>
             <p className="text-[var(--text-secondary)] mb-6">
               There was a problem connecting to Yullo. Please try again.
             </p>
             <button 
               className="px-6 py-2 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] font-medium rounded-lg hover:opacity-90 transition-opacity"
               onClick={() => window.location.reload()}
             >
               Retry
             </button>
           </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] transition-colors duration-200">
        <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)]">
           <YulloAppHeader />
           <div className="mt-12 space-y-6 max-w-2xl opacity-40">
             <div className="h-8 w-48 bg-[var(--border)] rounded animate-pulse" />
             <div className="h-6 w-96 bg-[var(--border)] rounded animate-pulse mt-16" />
           </div>
        </div>
      </div>
    );
  }

  const hasSpaces = data.spaces.length > 0;
  const globalEase = [0.22, 1, 0.36, 1] as const;

  // Section Config
  const visibleSections = getVisibleSections(validateHomeSections(yulloConfig?.home?.sections));
  
  const showPulse = visibleSections.has('pulse');
  const showRightNow = visibleSections.has('rightNow');
  
  const showAttention = visibleSections.has('attention') && data.attention.length > 0;
  const showForYou = visibleSections.has('forYou') && data.forYou.length > 0;
  const showBand1 = showAttention || showForYou;

  const showSpaces = visibleSections.has('spaces') && data.spaces.length > 0;
  const showQuickInsight = visibleSections.has('quickInsight') && data.quickInsight;
  const showBand2 = showSpaces || showQuickInsight;
  
  const showOrbit = visibleSections.has('orbit') && data.orbit;
  const showRecent = visibleSections.has('recent') && data.happening.length > 0;
  const showPattern = visibleSections.has('pattern') && data.pattern;
  const showSuggestion = visibleSections.has('suggestion') && data.suggestion;
  
  
  const OrbitComponent = SectionComponents.orbit!;
  const PulseComponent = SectionComponents.pulse!;
  const RightNowComponent = SectionComponents.rightNow!;
  const ForYouComponent = SectionComponents.forYou!;
  const QuickInsightComponent = SectionComponents.quickInsight!;


  return (
    <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] transition-colors duration-200 font-[Instrument_Sans] selection:bg-[var(--accent-soft)] selection:text-[var(--text-primary)]">
      
      {/* Hero arcs — the primary background system */}
      <AmbientWorldField intensity="quiet" />

      <div className="relative z-10 w-full">
        <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)]">
          <YulloAppHeader />
        </div>

        <main>
          {!hasSpaces ? (
            <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] pb-[120px]">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: globalEase }}
                className="max-w-2xl mt-16"
              >
                <h1 className="font-[Satoshi] text-[34px] font-medium leading-tight mb-4">
                  Your place on Yullo starts here.
                </h1>
                <p className="text-[var(--text-secondary)] text-[16px] mb-8 leading-relaxed max-w-lg">
                  Create a Space for yourself, your work, your business, or your community.
                </p>
                <button className="flex items-center gap-2 font-medium hover:opacity-80 transition-opacity text-[15px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
                  Create Space <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          ) : (
            <div className="flex flex-col pb-[120px]">
              
              {/* ════════════ HERO / YULLO WORLD ════════════ */}
              <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] w-full pt-4 md:pt-8 mb-14 lg:mb-16">
                <div className="flex flex-col lg:grid gap-x-8 lg:gap-x-16 gap-y-12" style={{ gridTemplateColumns: (showPulse && showRightNow) ? 'minmax(0, 1.85fr) minmax(260px, 1fr)' : '1fr' }}>
                  {showPulse && (
                    <div className="flex flex-col justify-end">
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: globalEase, delay: 0.05 }}
                        className="mb-8 md:mb-12"
                      >
                        <h1 className="font-[Satoshi] text-[28px] md:text-[32px] font-medium leading-tight text-[var(--text-primary)] tracking-tight">
                          Good evening.
                        </h1>
                      </motion.div>

                      <div className="relative z-10 w-full max-w-[600px] mx-auto lg:mx-0 lg:max-w-none lg:w-[110%] lg:-ml-[5%]">
                        <PulseComponent
                          spaces={data.spaces} 
                          selectedId={selectedSpaceId}
                          onSelect={setSelectedSpaceId}
                          userName="Akhil"
                        />
                      </div>
                    </div>
                  )}
                  
                  {showRightNow && (
                    <div className="flex flex-col justify-end lg:pb-12">
                      <RightNowComponent data={data.rightNow} />
                    </div>
                  )}
                </div>

                {/* Expanding Detail Panel for Selected Space */}
                <AnimatePresence>
                  {selectedSpaceId && (() => {
                    const selected = data.spaces.find(s => s.id === selectedSpaceId);
                    if (!selected) return null;
                    return (
                      <motion.div
                        key="detail-panel"
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: globalEase }}
                        className="relative z-10 overflow-hidden mt-12"
                      >
                        <div className="py-6 lg:py-8 border-t border-[var(--border)]">
                          <h3 className="font-[Satoshi] text-[24px] font-medium text-[var(--text-primary)] tracking-tight">
                            {selected.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-[15px] font-[Instrument_Sans]">
                            <span className="text-[var(--text-secondary)]">
                              <span className="font-semibold" style={{ color: selected.accentColor || 'var(--text-primary)' }}>{selected.signals.demand.split(' ')[0]}</span> {selected.signals.demand.substring(selected.signals.demand.indexOf(' ')+1)}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              <span className="font-semibold" style={{ color: selected.auraStatus === 'attention' ? 'var(--attention)' : selected.auraStatus === 'disconnected' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                {selected.auraStatus === 'ready' ? 'Aura is ready' : selected.auraStatus === 'attention' ? 'Needs attention' : selected.auraStatus === 'learning' ? 'Aura is learning' : 'Aura disconnected'}
                              </span> · {selected.signals.readiness}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              {selected.signals.outcome}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-6">
                            <button 
                              onClick={() => navigate(`/yullo/spaces/${selected.id}`)}
                              className="px-4 py-2 bg-[var(--text-primary)] text-[var(--surface)] text-[14px] font-medium rounded-lg hover:opacity-90 transition-opacity"
                            >
                              Open Space
                            </button>
                            <button onClick={() => { setBookingSaved(false); setBookingSpace(selected); }} className="px-4 py-2 text-[14px] font-medium rounded-lg transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
                              Add booking option
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>

              {/* ════════════ BAND 1: Needs Attention & For You ════════════ */}
              {showBand1 && (
                <div className="w-full bg-[var(--mosaic-band-soft)] border-t border-b border-[var(--mosaic-hairline)] relative z-10">
                  <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] py-12 lg:py-16">
                    <div className="flex flex-col lg:grid gap-x-8 lg:gap-x-16 gap-y-12 relative" style={{ gridTemplateColumns: (showAttention && showForYou) ? 'minmax(0, 1.2fr) minmax(260px, 1fr)' : '1fr' }}>
                      
                      {/* Vertical Divider */}
                      {(showAttention && showForYou) && (
                        <div className="hidden lg:block absolute top-0 bottom-0 left-[calc(55%-2rem)] w-px bg-[var(--mosaic-divider)]" />
                      )}

                      {showAttention && (
                        <motion.section
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: globalEase, delay: 0.11 }}
                        >
                          <div className="flex items-center gap-3 mb-6 lg:mb-8">
                            <div className="w-6 h-[2px] bg-[var(--anchor-attention)]" />
                            <h3 className="text-[15px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                              Needs attention
                            </h3>
                          </div>
                          <ul className="space-y-4">
                            {data.attention.map(item => (
                              <li key={item.id} className="flex items-center gap-4">
                                <div className="w-1 h-8 rounded-full bg-[var(--attention)] flex-shrink-0" />
                                <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-2 min-w-0">
                                  <p className="text-[16px] text-[var(--text-primary)] font-medium leading-snug">
                                    {item.title}
                                  </p>
                                  <Link 
                                    to={item.actionHref || '#'}
                                    className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--attention)] hover:opacity-70 transition-opacity flex-shrink-0 group"
                                  >
                                    {item.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
                                  </Link>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </motion.section>
                      )}
                      
                      {showForYou && (
                        <div>
                          <ForYouComponent items={data.forYou} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ════════════ BAND 2: Spaces & Quick Insight ════════════ */}
              {showBand2 && (
                <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] w-full py-12 lg:py-16">
                  <div className="flex flex-col lg:grid gap-x-8 lg:gap-x-16 gap-y-12 relative" style={{ gridTemplateColumns: (showSpaces && showQuickInsight) ? 'minmax(0, 2.3fr) minmax(260px, 1fr)' : '1fr' }}>
                    
                    {/* Vertical Divider */}
                    {(showSpaces && showQuickInsight) && (
                      <div className="hidden lg:block absolute top-0 bottom-0 left-[calc(70%-2rem)] w-px bg-[var(--mosaic-divider)]" />
                    )}

                    {showSpaces && (
                      <motion.section
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: globalEase, delay: 0.14 }}
                      >
                        <h3 className="text-[15px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-8">
                          Your Spaces
                        </h3>
                        <div className="relative z-10 flex flex-col gap-6">
                          {data.spaces.map((space, idx) => (
                            <SpaceRow key={space.id} space={space} index={idx} />
                          ))}
                        </div>

                        <button 
                          className="relative z-10 flex items-center gap-2 mt-10 text-[15px] font-medium hover: transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
                          onClick={() => navigate('/yullo/spaces/new')}
                        >
                          <Plus className="w-4 h-4" />
                          Create another Space
                        </button>
                      </motion.section>
                    )}

                    {showQuickInsight && (
                      <div>
                        <QuickInsightComponent data={data.quickInsight} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════ ORBIT FEATURE BAND ════════════ */}
              {showOrbit && OrbitComponent && (
                <OrbitComponent data={data.orbit} onSpaceHighlight={setSelectedSpaceId} />
              )}

                            {/* ════════════ BAND 3: Recent ════════════ */}
              {showRecent && (
                <div className="w-full border-t border-[var(--mosaic-hairline)] relative z-10">
                  <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] py-6 lg:py-8">
                    <motion.section
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: globalEase, delay: 0.16 }}
                      className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8"
                    >
                      <h3 className="text-[13px] font-[Satoshi] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex-shrink-0">
                        Recent
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] leading-snug">
                        {data.happening.map((item, idx) => (
                          <React.Fragment key={item.id}>
                            <span className="flex items-center gap-2">
                              <span className="text-[var(--text-muted)] tabular-nums">{item.timestamp}</span>
                              <span className="text-[var(--text-primary)]">
                                {item.spaceName && <span className="text-[var(--text-secondary)]">{item.spaceName} </span>}
                                {item.title}
                              </span>
                            </span>
                            {idx < data.happening.length - 1 && (
                              <span className="text-[var(--text-muted)] mx-1">·</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </motion.section>
                  </div>
                </div>
              )}

              {/* ════════════ SUGGESTION ════════════ */}
              {showSuggestion && (
                <div className="w-full border-t border-[var(--mosaic-hairline)] relative z-10">
                  <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] py-12 lg:py-16">
                    <motion.section
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: globalEase, delay: 0.18 }}
                      className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-8 lg:gap-16 items-center"
                    >
                      <div className="w-full">
                        <h2 className="text-[32px] md:text-[40px] text-[var(--text-primary)] font-medium font-[Satoshi] tracking-tight leading-tight">
                          {data.suggestion?.title}
                        </h2>
                        <p className="text-[18px] text-[var(--text-secondary)] mt-4 leading-relaxed font-[Instrument_Sans]">
                          {data.suggestion?.text}
                        </p>
                        {data.suggestion?.context && (
                          <p className="text-[15px] text-[var(--text-muted)] mt-2 font-[Instrument_Sans]">
                            {data.suggestion?.context}
                          </p>
                        )}
                        <Link 
                          to={data.suggestion?.actionHref || ''}
                          className="inline-flex items-center gap-1.5 text-[16px] font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity mt-8 group bg-[var(--surface-soft)] px-6 py-3 rounded-lg border border-[var(--border)]"
                        >
                          {data.suggestion?.actionLabel} <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity group-hover:translate-x-1" />
                        </Link>
                      </div>
                      
                      <div className="w-full flex justify-start lg:justify-end">
                        <svg width="240" height="240" viewBox="0 0 100 100" className="overflow-visible opacity-80">
                          <motion.circle cx="15" cy="15" r="4" fill="var(--text-muted)" initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 4, repeat: Infinity, delay: 0 }} />
                          <motion.circle cx="85" cy="15" r="4" fill="var(--text-muted)" initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 4, repeat: Infinity, delay: 0.8 }} />
                          <motion.circle cx="50" cy="10" r="4" fill="var(--text-muted)" initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 4, repeat: Infinity, delay: 1.6 }} />
                          <path d="M 20 25 L 50 80" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
                          <path d="M 80 25 L 50 80" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
                          <path d="M 50 20 L 50 80" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
                          <motion.circle cx="50" cy="85" r="8" fill="var(--accent-solid)" initial={{ scale: 0.9, opacity: 0.6 }} animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity }} />
                        </svg>
                      </div>
                    </motion.section>
                  </div>
                </div>
              )}

              {/* ════════════ FINALE: A pattern is emerging ════════════ */}
              {showPattern && (
                <div className="w-full border-t border-[var(--mosaic-hairline)] relative z-10">
                  <div className="max-w-[1080px] mx-auto px-[clamp(24px,5vw,72px)] py-12 lg:py-16">
                    <motion.section
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: globalEase, delay: 0.20 }}
                      className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-8 lg:gap-16 items-center"
                    >
                      <div className="w-full">
                        <h2 className="text-[32px] md:text-[40px] text-[var(--text-primary)] font-medium font-[Satoshi] tracking-tight leading-tight">
                          A pattern is emerging
                        </h2>
                        <p className="text-[18px] text-[var(--text-secondary)] mt-4 leading-relaxed font-[Instrument_Sans]">
                          {data.pattern?.title}
                        </p>
                        {data.pattern?.spaceName && (
                          <p className="text-[15px] text-[var(--text-muted)] mt-2 font-[Instrument_Sans]">
                            {data.pattern?.spaceName}
                          </p>
                        )}
                        <Link 
                          to={data.pattern?.actionHref || ''}
                          className="inline-flex items-center gap-1.5 text-[16px] font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity mt-8 group bg-[var(--surface-soft)] px-6 py-3 rounded-lg border border-[var(--border)]"
                        >
                          {data.pattern?.actionLabel} <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity group-hover:translate-x-1" />
                        </Link>
                      </div>
                      
                      <div className="w-full flex justify-start lg:justify-end">
                        <svg width="240" height="240" viewBox="0 0 100 100" className="overflow-visible opacity-80">
                          <motion.circle cx="50" cy="50" r="30" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
                          <motion.circle cx="50" cy="50" r="15" fill="var(--accent-solid)" initial={{ scale: 0.9, opacity: 0.6 }} animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity }} />
                        </svg>
                      </div>
                    </motion.section>
                  </div>
                </div>
              )}

            </div>
          )}
          <Nearby key={rawData?.account.id} />
        </main>
      </div>

      {/* Interactive Modal for Space Archiving or Complete Deletion */}
      <AnimatePresence>
        {deleteTargetSpace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteTargetSpace(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] p-6 rounded-2xl shadow-2xl text-[var(--text-primary)] font-[Instrument_Sans]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-[var(--surface-soft)] rounded-xl text-[var(--critical)]">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)]">
                  Remove "{deleteTargetSpace.name}"?
                </h3>
              </div>

              <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-6">
                Choose whether to archive this Space (hides it from your Home dashboard while preserving data) or delete it completely.
              </p>

              <div className="flex flex-col gap-3">
                {deleteFailure && <p role="alert" className="text-sm text-[var(--attention)]">{deleteFailure} <Link to={`/yullo/spaces/${deleteTargetSpace.id}#subspaces`} className="underline">Manage subspaces</Link></p>}
                <button
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    setDeleteFailure('');
                    try {
                      await formsApi.archiveOrDelete(deleteTargetSpace.id, 'archive');
                      setSelectedSpaceId(null);
                      setDeleteTargetSpace(null);
                      queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
                      queryClient.invalidateQueries({ queryKey: ['yullo-space-hierarchy'] });
                    } catch (err: any) {
                      setDeleteFailure(err.response?.status === 409 ? 'Detach subspaces before removing this Space.' : 'Could not archive this Space. Please try again.');
                      console.error('Failed to archive space:', err);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="w-full py-3 px-4 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 font-medium text-[15px] rounded-xl transition-colors text-left flex items-center justify-between group border border-transparent"
                >
                  <div>
                    <div className="font-semibold text-[15px] text-[var(--accent-on-solid)]">Archive Space</div>
                    <div className="text-[13px] text-[var(--accent-on-solid)] opacity-80 font-normal">Disappears from your Home dashboard</div>
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                </button>

                <button
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    setDeleteFailure('');
                    try {
                      await formsApi.archiveOrDelete(deleteTargetSpace.id, 'delete');
                      setSelectedSpaceId(null);
                      setDeleteTargetSpace(null);
                      queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
                      queryClient.invalidateQueries({ queryKey: ['yullo-space-hierarchy'] });
                    } catch (err: any) {
                      setDeleteFailure(err.response?.status === 409 ? 'Detach subspaces before removing this Space.' : 'Could not delete this Space. Please try again.');
                      console.error('Failed to delete space:', err);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="w-full py-3 px-4 bg-[var(--critical)]/10 hover:bg-[var(--critical)]/20 text-[var(--critical)] font-medium text-[15px] rounded-xl transition-colors text-left flex items-center justify-between border border-[var(--critical)]/20"
                >
                  <div>
                    <div className="font-semibold text-[15px]">Delete Completely</div>
                    <div className="text-[13px] opacity-80 font-normal">Permanently removes all space data</div>
                  </div>
                  <Trash2 className="w-4 h-4 opacity-80" />
                </button>

                <button
                  disabled={isDeleting}
                  onClick={() => setDeleteTargetSpace(null)}
                  className="w-full py-2.5 px-4 text-[14px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1 text-center"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {bookingSaved && <p role="status" className="fixed bottom-5 left-5 z-50 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-[var(--text-primary)]">Booking link saved.</p>}
      {bookingSpace && <BookingForm key={bookingSpace.id} spaceId={bookingSpace.id} spaceName={bookingSpace.name} onClose={() => setBookingSpace(null)} onSaved={() => { setBookingSpace(null); setBookingSaved(true); }} />}
    </div>
  );
};
