import { HomeData, HomeSpace, AttentionItem, HappeningItem, HomeSuggestion, HomePattern, OrbitSectionData, OrbitSignal, OrbitSignalScope } from './types';
import { resolveHomeAction, ActionKind } from './actionResolver';

// A generic function to map the backend response to the frontend HomeData representation.
export function mapYulloHomeResponse(dto: any): HomeData {
  
  const spaces: HomeSpace[] = (dto.spaces || []).map((s: any) => {
    // ── Map backend auraStatus → PulseSpace auraStatus ──────────────────────
    // Backend values: "draft" | "learning" | "updating" | "live" | "needs_review" | "unavailable"
    // PulseSpace expects: "ready" | "learning" | "attention" | "disconnected"
    let auraStatus: 'ready' | 'learning' | 'attention' | 'disconnected' = 'ready';
    switch (s.auraStatus) {
      case 'live':     auraStatus = 'ready';       break;
      case 'updating': auraStatus = 'learning';    break;
      case 'learning': auraStatus = 'learning';    break;
      case 'needs_review': auraStatus = 'attention'; break;
      case 'unavailable':  auraStatus = 'disconnected'; break;
      case 'draft':    auraStatus = 'disconnected'; break;
      default:         auraStatus = 'ready';
    }

    // ── Map lifecycle → PulseSpace status ───────────────────────────────────
    // Backend: lifecycle can be "draft" | "live" | "published" | etc.
    const status: 'draft' | 'live' =
      s.lifecycle === 'draft' ? 'draft' : 'live';

    // ── Derive a demand score (0–10) from backend metrics ───────────────────
    // We don't have a raw score; approximate from conversation volume and attention.
    // Cap conversationCountToday at 20 for scoring → maps to 0–7 range.
    // Attention items add urgency but shouldn't max the score.
    const conversationScore = Math.min((s.conversationCountToday || 0) / 20, 1) * 7;
    const attentionScore = Math.min((s.attentionCount || 0) / 3, 1) * 3;
    const demandScore = Math.round(conversationScore + attentionScore);

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      handle: `@${s.slug}`,
      lifecycle: s.lifecycle,
      auraStatus,
      status,
      demandScore,
      signals: {
        demand: s.conversationCountToday
          ? `${s.conversationCountToday} conversation${s.conversationCountToday !== 1 ? 's' : ''} today`
          : 'No activity yet',
        readiness: auraStatus === 'ready' ? 'Aura is ready' : auraStatus === 'learning' ? 'Aura is learning' : 'Needs review',
        outcome: s.newConversationCount
          ? `${s.newConversationCount} new conversation${s.newConversationCount !== 1 ? 's' : ''}`
          : 'No new conversations',
      },
      conversationCountToday: s.conversationCountToday,
      newConversationCount: s.newConversationCount,
      attentionCount: s.attentionCount,
      lastActivityAt: s.lastActivityAt,
      avatarUrl: s.logoUrl,
      monogram: s.name ? s.name.substring(0, 2).toUpperCase() : '?'
    };
  });


  const attention: AttentionItem[] = (dto.attention || []).map((a: any) => {
    const href = resolveHomeAction(a.action.kind as ActionKind, a.spaceId, a.action.targetId);
    
    // Map backend severity kinds to UI severities
    let severity: 'info' | 'attention' | 'critical' = 'attention';
    if (a.kind === 'aura_unavailable' || a.kind === 'publication_blocked') {
      severity = 'critical';
    } else if (a.kind === 'missing_action' || a.kind === 'source_stale') {
      severity = 'info';
    }

    return {
      id: a.id,
      spaceId: a.spaceId,
      spaceName: a.spaceName,
      title: a.title,
      description: a.detail,
      severity,
      actionLabel: a.action.label,
      actionHref: href || '#'
    };
  });

  const happening: HappeningItem[] = (dto.recent || []).map((r: any) => ({
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    title: r.label,
    description: '',
    timestamp: r.occurredAt
  }));

  let suggestion: HomeSuggestion | undefined = undefined;
  if (dto.suggestion) {
    const s = dto.suggestion;
    const href = resolveHomeAction(s.kind as ActionKind, s.spaceId);
    suggestion = {
      id: s.id,
      spaceId: s.spaceId,
      title: 'Suggestion',
      text: s.reason,
      context: s.spaceName,
      actionLabel: s.actionLabel || 'Review',
      actionHref: href || '#'
    };
  }

  let pattern: HomePattern | undefined = undefined;
  if (dto.pattern) {
    const p = dto.pattern;
    // targetId can be left empty for general pattern, backend uses targetId for intent type but we don't have it explicitly here.
    // The action should be resolved to view conversation pattern
    const href = resolveHomeAction('view_conversation_pattern', p.spaceId);
    pattern = {
      id: p.id,
      spaceId: p.spaceId,
      spaceName: p.spaceName,
      title: p.title,
      actionLabel: p.actionLabel || 'View pattern',
      actionHref: href || '#'
    };
  }

  let orbit: OrbitSectionData | undefined = undefined;
  if (dto.orbit) {
    const signals: OrbitSignal[] = [];
    
    const mapOrbitCandidate = (c: any, prominence: 'dominant' | 'supporting'): OrbitSignal => {
      const scope: OrbitSignalScope = { kind: 'space', spaceId: c.spaceId, spaceName: c.spaceName };
      
      let actionLabel: 'Explore' | 'Connect' | 'View conversation pattern' | 'See why' | 'Add to Space' | 'View' = 'View';
      let actionHref = '#';
      
      if (c.kind === 'pulse') {
        actionLabel = 'View';
        actionHref = resolveHomeAction('open_space', c.spaceId) || '#';
      } else if (c.kind === 'momentum') {
        actionLabel = 'View conversation pattern';
        actionHref = resolveHomeAction('view_conversation_pattern', c.spaceId) || '#';
      }

      return {
        id: c.id,
        kind: c.kind,
        scope,
        prominence,
        title: c.title,
        body: '',
        metric: { value: c.metric, label: '' },
        relevance: '',
        evidence: {
          sourceLabel: c.sourceLabel || c.spaceName || 'Space activity',
          observedAt: c.observedAt || new Date().toISOString()
        },
        action: { label: actionLabel, href: actionHref }
      };
    };

    if (dto.orbit.dominant) {
      signals.push(mapOrbitCandidate(dto.orbit.dominant, 'dominant'));
    }
    
    (dto.orbit.supporting || []).forEach((c: any) => {
      signals.push(mapOrbitCandidate(c, 'supporting'));
    });

    if (signals.length > 0) {
      orbit = {
        title: 'In your orbit',
        subtitle: 'Activity from your network',
        signals
      };
    }
  }

  return {
    spaces,
    attention,
    happening,
    suggestion,
    pattern,
    rightNow: {
      conversations: dto.rightNow?.conversations || 0,
      enquiries: dto.rightNow?.enquiries || 0,
      actionableIssues: attention.length,
      observedAt: dto.generatedAt
    },
    forYou: dto.forYou || [],
    quickInsight: dto.quickInsight || undefined,
    orbit
  };
}
