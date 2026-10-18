import React from 'react';
import { HomeSectionId } from './types';
import { RightNow } from '../components/home/RightNow';
import { ForYou } from '../components/home/ForYou';
import { QuickInsight } from '../components/home/QuickInsight';
import InYourOrbit from '../components/home/InYourOrbit';
import { YulloPulse } from '../components/YulloPulse';
// Note: Some sections like Attention, Spaces, Recent, and Pattern are currently 
// rendered inline or use smaller components in YulloHome.tsx. 
// This registry provides a structured map for the additive Yullo components.

export const SectionComponents: Partial<Record<HomeSectionId, React.ElementType>> = {
  rightNow: RightNow,
  forYou: ForYou,
  quickInsight: QuickInsight,
  orbit: InYourOrbit,
  pulse: YulloPulse,
};
