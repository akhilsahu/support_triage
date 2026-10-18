import { HomeData } from './types';

export const yulloHomeFixture: HomeData = {
  spaces: [
    {
      id: "sp_1",
      name: "Northstar Studio",
      handle: "northstar",
      description: "Brand and product design",
      status: "live",
      auraStatus: "ready",
      demandScore: 8,
      signals: {
        demand: "7 visitors asked how to work together",
        readiness: "5 current sources",
        outcome: "14 conversations helped today"
      },
      monogram: "N",
      accentColor: "var(--accent-solid)"
    },
    {
      id: "sp_2",
      name: "Offers.Run",
      handle: "offersrun",
      description: "Offer discovery platform",
      status: "live",
      auraStatus: "attention",
      demandScore: 2,
      signals: {
        demand: "Low traffic this week",
        readiness: "Source needs reconnection",
        outcome: "0 conversations"
      },
      monogram: "O",
      accentColor: "var(--network-cyan)"
    },
    {
      id: "sp_3",
      name: "Acme Corp",
      handle: "acme",
      description: "Client workspace",
      status: "draft",
      auraStatus: "learning",
      demandScore: 0,
      signals: {
        demand: "No visitors yet",
        readiness: "Currently indexing",
        outcome: "Draft mode"
      },
      monogram: "A",
      accentColor: "var(--text-secondary)"
    }
  ],
  rightNow: {
    conversations: 3,
    enquiries: 2,
    actionableIssues: 1,
    observedAt: '2026-09-18T12:00:00Z'
  },
  forYou: [
    {
      id: "fy_1",
      spaceId: "sp_1",
      spaceName: "Northstar Studio",
      kind: 'opportunity',
      title: "Founder meetup · 1.4 km",
      relevance: "Relevant because Northstar visitors are asking about startup branding",
      evidence: {
        sourceLabel: 'Local Events',
        observedAt: '2026-09-18T10:00:00Z'
      },
      action: {
        label: "View opportunity",
        href: "/yullo/spaces/sp_1/opportunities/fy_1"
      }
    }
  ],
  quickInsight: {
    spaceId: 'sp_1',
    spaceName: 'Northstar Studio',
    statement: 'Your pricing page is converting 15% better since you added the new case studies.',
    evidence: { sourceLabel: 'Yullo Network Intelligence', observedAt: '2026-09-18T00:00:00Z' },
    action: { label: 'See why', href: '/yullo/spaces/sp_1/insights' },
    metric: { value: '+15%', label: 'Conversion rate', trend: 'up' }
  },
  attention: [
    {
      id: "att_1",
      spaceId: "sp_2",
      spaceName: "Offers.Run",
      title: "Notion stopped syncing. Aura may miss recent changes.",
      severity: "attention",
      actionLabel: "Reconnect Notion",
      actionHref: "/yullo/spaces/sp_2/knowledge"
    }
  ],
  orbit: {
    title: 'In your orbit',
    subtitle: 'What’s moving around your Yullo world',
    signals: [
      {
        id: 'orb_1',
        kind: 'momentum',
        scope: { kind: 'space', spaceId: 'sp_1', spaceName: 'Northstar Studio' },
        prominence: 'dominant',
        title: 'Visitor momentum building',
        body: 'Northstar Studio has seen a steady increase in design-related questions over the last 3 days.',
        metric: { value: '+24%', label: 'visitor engagement' },
        relevance: 'Based on your ownership of Northstar Studio',
        evidence: { sourceLabel: 'Activity metrics', observedAt: '2026-09-19T10:00:00Z' },
        action: { label: 'Explore', href: '/yullo/spaces/sp_1/activity' }
      },
      {
        id: 'orb_2',
        kind: 'nearby',
        scope: { kind: 'user', basis: 'explicit_location' },
        prominence: 'supporting',
        title: 'Local creative meetup',
        body: 'A gathering of studio owners is happening nearby tomorrow.',
        relevance: 'Because you are based in London',
        evidence: { sourceLabel: 'Network events', observedAt: '2026-09-18T14:30:00Z' },
        action: { label: 'View', href: '/yullo/events/ev_1' }
      },
      {
        id: 'orb_3',
        kind: 'connection',
        scope: { kind: 'space', spaceId: 'sp_2', spaceName: 'Offers.Run' },
        prominence: 'supporting',
        title: 'New partnership inquiry',
        body: 'Someone asked about integrating Offers.Run with their agency.',
        relevance: 'Related to Offers.Run',
        evidence: { sourceLabel: 'Recent conversations', observedAt: '2026-09-19T09:15:00Z' },
        action: { label: 'View conversation pattern', href: '/yullo/spaces/sp_2/conversations' }
      },
      {
        id: 'orb_4',
        kind: 'pulse',
        scope: { kind: 'user', basis: 'network_membership' },
        prominence: 'supporting',
        title: 'Network spotlight',
        body: '3 members of your cohort recently updated their Aura readiness.',
        relevance: 'From your Autumn 2026 Cohort',
        evidence: { sourceLabel: 'Cohort activity', observedAt: '2026-09-18T18:00:00Z' },
        action: { label: 'Explore', href: '/yullo/network/cohort' }
      }
    ]
  },
  happening: [
    { id: 'act_1', timestamp: '12m', title: 'New enquiry', spaceName: 'Northstar Studio' },
    { id: 'act_2', timestamp: '2h', title: 'Aura helped 14 visitors' },
    { id: 'act_3', timestamp: '5h', title: 'Knowledge refreshed', spaceName: 'Acme Corp' }
  ],
  suggestion: {
    id: 'sug_1',
    spaceId: 'sp_1',
    title: 'A pattern is emerging.',
    text: 'People keep asking how to work with Northstar.',
    context: '7 visitors showed this intent.',
    actionLabel: 'Add a booking option',
    actionHref: '/yullo/spaces/sp_1/settings/booking'
  }
};

export function loadYulloHomePresentation(): Promise<HomeData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(yulloHomeFixture as HomeData);
    }, 400);
  });
}
