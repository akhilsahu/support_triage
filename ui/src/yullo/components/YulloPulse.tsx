import React, { useState } from 'react';
import { motion } from 'framer-motion';

export type PulseSpace = {
  id: string;
  name: string;
  status: 'draft' | 'live';
  auraStatus: 'ready' | 'learning' | 'attention' | 'disconnected';
  demandScore: number;
  signals: {
    demand: string;
    readiness: string;
    outcome: string;
  };
  accentColor?: string;
  childCount?: number;
  spaceType?: string;
};

type YulloPulseProps = {
  spaces: PulseSpace[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userName: string;
  className?: string;
};

// ─── SVG coordinate constants ─────────────────────────────────────────────────
// Large viewBox (600×500) with center at (300,250) gives 120px+ of buffer on all
// sides so labels for top/bottom/left/right nodes never leave the SVG bounds.
const W = 600;
const H = 500;
const CX = 300;   // center x
const CY = 250;   // center y
const ORBIT_R = 130; // orbit radius

// ─── Per-node SVG text alignment based on position angle ─────────────────────
// cos/sin thresholds determine which quadrant a node is in.
// textAnchor  : where the text string starts/ends relative to (lx, ly)
// dominantBaseline: where the text sits vertically relative to (lx, ly)
function textAnchors(angle: number): {
  textAnchor: 'start' | 'middle' | 'end';
  dominantBaseline: 'auto' | 'middle' | 'hanging';
} {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const THRESH = 0.4; // sin/cos must be above this to count as "clearly" left/right/top/bottom

  let textAnchor: 'start' | 'middle' | 'end' = 'middle';
  if (cos > THRESH) textAnchor = 'start';
  else if (cos < -THRESH) textAnchor = 'end';

  let dominantBaseline: 'auto' | 'middle' | 'hanging' = 'middle';
  if (sin > THRESH) dominantBaseline = 'hanging';  // below center → text hangs down from label point
  else if (sin < -THRESH) dominantBaseline = 'auto'; // above center → text sits above label point

  return { textAnchor, dominantBaseline };
}

export const YulloPulse: React.FC<YulloPulseProps> = ({
  spaces,
  selectedId,
  onSelect,
  userName,
  className = '',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Sort: attention → live high demand → live → draft
  const sortedSpaces = [...spaces].sort((a, b) => {
    if (a.auraStatus === 'attention' && b.auraStatus !== 'attention') return -1;
    if (b.auraStatus === 'attention' && a.auraStatus !== 'attention') return 1;
    if (a.status === 'live' && b.status === 'live' && a.demandScore !== b.demandScore)
      return b.demandScore - a.demandScore;
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    return a.id.localeCompare(b.id);
  });

  const MAX_SPACES = 16;
  const visibleSpaces = sortedSpaces.slice(0, MAX_SPACES);
  const N = visibleSpaces.length;

  const nodes = visibleSpaces.map((space, idx) => {
    // Spread evenly; start from -90° (top) so first node is at the top of the circle
    const angle = (idx / N) * Math.PI * 2 - Math.PI / 2;
    const x = CX + Math.cos(angle) * ORBIT_R;
    const y = CY + Math.sin(angle) * ORBIT_R;

    // Node radius: 12–22px based on demandScore (0–10)
    const nodeRadius = 12 + (space.demandScore / 10) * 10;

    // Label anchor point: push outward past the node edge along the same angle
    const LABEL_PUSH = nodeRadius + 20;
    const lx = x + Math.cos(angle) * LABEL_PUSH;
    const ly = y + Math.sin(angle) * LABEL_PUSH;

    // Demand trace: extends beyond the orbit for high-demand nodes
    const bend = (idx % 2 === 0 ? 1 : -1) * (0.08 + (idx * 0.04) % 0.2);
    const traceAngle = angle + bend;
    const traceStartX = CX + Math.cos(traceAngle) * (ORBIT_R + 140);
    const traceStartY = CY + Math.sin(traceAngle) * (ORBIT_R + 140);

    return {
      ...space,
      x, y,
      nodeRadius,
      lx, ly,
      angle,
      traceStartX,
      traceStartY,
      ...textAnchors(angle),
    };
  });

  const handleBgClick = () => { if (selectedId) onSelect(null); };

  return (
    <div
      className={`relative w-full font-[Instrument_Sans] ${className}`}
      // aspectRatio mirrors the viewBox so the SVG fills the container exactly
      style={{ aspectRatio: `${W}/${H}` }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        // SVG itself doesn't clip — the div above does via overflow:hidden default
        onClick={handleBgClick}
        aria-label="Your Spaces network"
      >
        {/* Click trap */}
        <rect width="100%" height="100%" fill="transparent" />

        {/* ── Center Owner Node ────────────────────────────────────────── */}
        <motion.circle
          cx={CX} cy={CY} r={6}
          fill="var(--text-primary)"
          className="pointer-events-none"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, ease: 'backOut' }}
        />
        {/* Center label always sits below the dot */}
        <text
          x={CX}
          y={CY + 18}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontSize={13}
          fontFamily="Satoshi, Instrument Sans, sans-serif"
          fontWeight="600"
          fill="var(--text-primary)"
          className="pointer-events-none"
        >
          {userName.length > 28 ? `${userName.slice(0, 27)}…` : userName}
        </text>

        {/* ── Per-space connections, rings, dots, labels ───────────────── */}
        {nodes.map((node, i) => {
          const isSelected = selectedId === node.id;
          const isHovered = hoveredId === node.id;
          const isFaded =
            (selectedId && !isSelected) || (hoveredId && !isHovered && !selectedId);
          const hasHighDemand = node.demandScore > 5;
          const strokeColor = node.accentColor || 'var(--text-secondary)';

          // Ring style based on aura/status
          let ringDash = 'none';
          let ringStroke = strokeColor;
          let ringOpacity = 0.35;
          if (node.status === 'draft' || node.auraStatus === 'disconnected') {
            ringDash = '4 6'; ringStroke = 'var(--text-muted)'; ringOpacity = 0.5;
          } else if (node.auraStatus === 'attention' || node.auraStatus === 'learning') {
            ringDash = '10 6'; ringStroke = 'var(--attention)'; ringOpacity = 0.8;
          }

          return (
            <g
              key={node.id}
              style={{ opacity: isFaded ? 0.2 : 1, transition: isReducedMotion ? 'none' : 'opacity 250ms ease' }}
            >
              {/* Connector: center → node */}
              <motion.line
                x1={CX} y1={CY} x2={node.x} y2={node.y}
                stroke="var(--pulse-connector)"
                strokeWidth={1}
                initial={{ pathLength: isReducedMotion ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: isReducedMotion ? 0 : 0.22, delay: isReducedMotion ? 0 : i * 0.01, ease: 'easeOut' }}
                className="pointer-events-none"
              />

              {/* Demand trace for high-demand spaces */}
              {hasHighDemand && (
                <>
                  <path
                    d={`M ${node.traceStartX} ${node.traceStartY} Q ${
                      (node.traceStartX + node.x) / 2 + 20
                    } ${(node.traceStartY + node.y) / 2}, ${node.x} ${node.y}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={1}
                    opacity={0.09}
                    className="pointer-events-none"
                  />
                  {!isReducedMotion && (
                    <motion.circle
                      r={2}
                      fill={strokeColor}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.7, 0] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 + (i % 3), ease: 'easeInOut' }}
                      className="pointer-events-none"
                    >
                      <animateMotion
                        path={`M ${node.traceStartX} ${node.traceStartY} Q ${
                          (node.traceStartX + node.x) / 2 + 20
                        } ${(node.traceStartY + node.y) / 2}, ${node.x} ${node.y}`}
                        dur="3s"
                        repeatCount="indefinite"
                      />
                    </motion.circle>
                  )}
                </>
              )}

              {/* Outer readiness ring */}
              <motion.circle
                cx={node.x} cy={node.y} r={node.nodeRadius + 5}
                fill="none"
                stroke={ringStroke}
                strokeWidth={1.5}
                strokeDasharray={ringDash}
                opacity={ringOpacity}
                initial={isReducedMotion ? false : { scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: ringOpacity }}
                transition={{ duration: isReducedMotion ? 0 : 0.22, delay: isReducedMotion ? 0 : i * 0.01 }}
                className="pointer-events-none"
              />

              {/* Main node circle — interactive */}
              <motion.circle
                cx={node.x} cy={node.y} r={node.nodeRadius}
                fill={isSelected
                  ? strokeColor
                  : `color-mix(in srgb, ${strokeColor} 12%, var(--surface))`}
                stroke={strokeColor}
                strokeWidth={isSelected ? 0 : 1.5}
                className="pointer-events-auto cursor-pointer focus:outline-none"
                role="button"
                aria-label={`${node.name}${node.spaceType ? `, ${node.spaceType}` : ''}${node.childCount ? `, ${node.childCount} subspaces` : ''}`}
                aria-pressed={isSelected}
                tabIndex={0}
                onFocus={() => setHoveredId(node.id)}
                onBlur={() => setHoveredId(null)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : node.id); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); e.stopPropagation();
                    onSelect(isSelected ? null : node.id);
                  }
                }}
                initial={isReducedMotion ? false : { scale: 0.92 }}
                animate={hasHighDemand && !isSelected && !isReducedMotion
                  ? { scale: [1, 1.04, 1] }
                  : { scale: 1 }
                }
                whileHover={supportsHover && !isReducedMotion ? { scale: 1.04 } : undefined}
                whileTap={isReducedMotion ? undefined : { scale: 0.98 }}
                transition={hasHighDemand && !isSelected && !isReducedMotion
                  ? { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }
                  : { duration: 0.2, ease: 'easeOut' }
                }
              />

              {isHovered && <circle cx={node.x} cy={node.y} r={node.nodeRadius + 9} fill="none" stroke="var(--accent)" strokeWidth={2} className="pointer-events-none" />}

              {/* Selected indicator */}
              {isSelected && (
                <circle cx={node.x} cy={node.y} r={3}
                  fill="var(--canvas)" className="pointer-events-none" />
              )}

              {/* ── Node label ──────────────────────────────────────────
                  Positioned at (lx, ly) which is pushed outward from the
                  node centre along the node's own angle.
                  textAnchor + dominantBaseline are computed per-quadrant so
                  the text always radiates away from the centre and stays
                  within the 600×500 viewBox.                             */}
              <text
                x={node.lx}
                y={node.ly}
                textAnchor={node.textAnchor}
                dominantBaseline={node.dominantBaseline}
                fontSize={12}
                fontFamily="Satoshi, Instrument Sans, sans-serif"
                fontWeight="600"
                fill="var(--text-primary)"
                className="pointer-events-none"
              >
                <title>{node.name}</title>
                {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
              </text>

              {/* Status sub-label, visible on hover/select */}
              <text
                x={node.lx}
                y={node.ly + (node.dominantBaseline === 'auto' ? -16 : 16)}
                textAnchor={node.textAnchor}
                dominantBaseline={node.dominantBaseline}
                fontSize={10}
                fontFamily="Satoshi, Instrument Sans, sans-serif"
                fill={
                  node.auraStatus === 'attention' || node.status === 'draft'
                    ? 'var(--attention)'
                    : 'var(--text-secondary)'
                }
                opacity={node.spaceType || node.childCount || isHovered || isSelected ? 1 : 0}
                style={{ transition: isReducedMotion ? 'none' : 'opacity 200ms ease' }}
                className="pointer-events-none"
              >
                {node.spaceType || node.childCount
                  ? [node.spaceType ? node.spaceType.charAt(0).toUpperCase() + node.spaceType.slice(1) : '', node.childCount ? `${node.childCount} subspace${node.childCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
                  : node.auraStatus === 'ready'
                  ? 'Aura ready'
                  : node.auraStatus === 'attention'
                  ? 'Needs attention'
                  : node.auraStatus === 'learning'
                  ? 'Learning'
                  : 'Disconnected'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
