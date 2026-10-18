import { PulseSpace } from '../components/YulloPulse';

export type SignalEvidence = {
  sourceLabel: string;
  observedAt: string;
};

export type RightNowSummary = {
  conversations?: number;
  enquiries?: number;
  actionableIssues?: number;
  observedAt: string;
};

export type ForYouItem = {
  id: string;
  spaceId: string;
  spaceName: string;
  kind: 'opportunity' | 'local_event' | 'recurring_need' | 'network_discovery';
  title: string;
  relevance: string;
  evidence: SignalEvidence;
  action: { label: string; href: string };
};

export type QuickInsight = {
  spaceId: string;
  spaceName: string;
  statement: string;
  evidence: SignalEvidence;
  action?: { label: string; href: string };
  metric?: { value: string; label: string; trend?: 'up' | 'down' | 'neutral' };
};

export type HomeSpace = PulseSpace & {
  handle: string;
  description?: string;
  avatarUrl?: string;
  monogram?: string;
};

export type AttentionItem = {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  description?: string;
  severity: "info" | "attention" | "critical";
  actionLabel: string;
  actionHref?: string;
};

export type HappeningItem = {
  id: string;
  spaceId?: string;
  spaceName?: string;
  title: string;
  description?: string;
  timestamp: string;
};

export type HomeSuggestion = {
  id: string;
  spaceId: string;
  title: string;
  text: string;
  context: string;
  actionLabel: string;
  actionHref: string;
};

export type HomePattern = {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  actionLabel: string;
  actionHref: string;
};

export type HomeData = {
  spaces: HomeSpace[];
  attention: AttentionItem[];
  happening: HappeningItem[];
  suggestion?: HomeSuggestion;
  pattern?: HomePattern;
  rightNow: RightNowSummary;
  forYou: ForYouItem[];
  quickInsight?: QuickInsight;
  orbit?: OrbitSectionData;
};

export type OrbitSignalKind = 'pulse' | 'nearby' | 'connection' | 'momentum';

export type OrbitSignalScope =
  | { kind: 'space'; spaceId: string; spaceName: string }
  | { kind: 'user'; basis: 'explicit_interest' | 'network_membership' | 'explicit_location' };

export type OrbitSignal = {
  id: string;
  kind: OrbitSignalKind;
  scope: OrbitSignalScope;
  prominence: 'dominant' | 'supporting';
  title: string;
  body: string;
  metric?: { value: string; label: string };
  relevance: string;
  evidence: SignalEvidence;
  action: { label: 'Explore' | 'Connect' | 'View conversation pattern' | 'See why' | 'Add to Space' | 'View'; href: string };
  dismissible?: boolean;
};

export type OrbitSectionData = {
  title: 'In your orbit';
  subtitle: string;
  signals: OrbitSignal[];
};

export type HomeSectionId =
  | 'pulse'
  | 'rightNow'
  | 'attention'
  | 'forYou'
  | 'spaces'
  | 'quickInsight'
  | 'orbit'
  | 'recent'
  | 'suggestion'
  | 'pattern';

export type HomeSectionConfig = {
  id: HomeSectionId;
  enabled: boolean;
  order: number;
};

// Add orbit data to HomePresentationData
