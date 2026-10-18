import React from 'react';
import { motion } from 'framer-motion';

export type AmbientWorldFieldProps = {
  intensity: "quiet" | "active";
};

// Entirely theme-driven via CSS custom properties from tokens.css.
// No hardcoded colors or opacity values — everything reads from:
//   --ambient-cyan, --ambient-violet, --ambient-path-opacity, --ambient-glow, --ambient-particle
export const AmbientWorldField: React.FC<AmbientWorldFieldProps> = ({ intensity }) => {
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Hero zone: large sweeping arcs (top 500px) ───
  const heroPaths = [
    "M -50 150 C 100 150, 200 350, 800 350",
    "M 150 -50 C 200 150, 400 100, 1000 200",
    "M 400 400 C 600 200, 900 100, 1400 150",
    "M -100 250 C 200 300, 450 50, 900 200",
    "M 600 -100 C 700 150, 950 300, 1500 250"
  ];

  const heroNodes = [
    { cx: 280, cy: 150 },
    { cx: 500, cy: 225 },
    { cx: 680, cy: 330 },
    { cx: 720, cy: 180 },
    { cx: 950, cy: 115 },
    { cx: 1100, cy: 250 },
    { cx: 150, cy: 280 },
    { cx: 850, cy: 250 }
  ];

  // ─── Mid zone: longer, gentler arcs extending through Spaces + Activity ───
  const midPaths = [
    "M -100 600 C 200 550, 500 700, 1100 620",
    "M 300 500 C 500 580, 800 520, 1400 560",
    "M -60 850 C 250 820, 600 900, 1000 840",
    "M 500 750 C 700 680, 1000 780, 1500 720",
    "M -50 700 C 300 750, 700 600, 1200 750",
    "M 800 900 C 1000 850, 1200 950, 1600 880"
  ];

  const midNodes = [
    { cx: 200, cy: 570 },
    { cx: 600, cy: 640 },
    { cx: 850, cy: 550 },
    { cx: 400, cy: 850 },
    { cx: 900, cy: 810 },
    { cx: 650, cy: 720 },
    { cx: 1100, cy: 680 }
  ];

  // ─── Bottom zone: sparse, fading towards the insight section ───
  const bottomPaths = [
    "M -80 1050 C 300 1020, 700 1100, 1300 1040",
    "M 200 1150 C 500 1120, 900 1200, 1400 1130",
    "M -20 1250 C 400 1200, 800 1300, 1500 1220"
  ];

  const bottomNodes = [
    { cx: 350, cy: 1060 },
    { cx: 750, cy: 1140 },
    { cx: 1100, cy: 1080 },
    { cx: 550, cy: 1220 }
  ];

  return (
    <div 
      className="absolute top-0 left-0 w-full pointer-events-none overflow-hidden z-0"
      style={{ height: '1400px' }}
    >
      {/* ─── HERO ZONE ─── Full opacity, large arcs */}
      <svg 
        className="absolute top-0 left-0 w-full" 
        style={{ height: '500px', opacity: 'var(--ambient-path-opacity)' as any }}
      >
        {heroPaths.map((d, i) => (
          <motion.path 
            key={`hero-${i}`}
            d={d} 
            fill="none" 
            stroke={i % 2 === 0 ? 'var(--ambient-cyan)' : 'var(--ambient-violet)'}
            strokeWidth="1.5"
            initial={{ pathLength: isReducedMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 3, delay: i * 0.4, ease: "easeInOut" }}
          />
        ))}
        {heroNodes.map((n, i) => (
          <circle key={`hn-${i}`} cx={n.cx} cy={n.cy} r="2.5" fill="var(--ambient-particle)" opacity="0.5" />
        ))}
      </svg>

      {/* Glow near primary space */}
      <div 
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          left: '280px',
          top: '150px',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, var(--ambient-glow) 0%, transparent 70%)'
        }}
      />

      {/* ─── MID ZONE ─── Reduced opacity, gentler arcs behind Spaces + Activity */}
      <svg 
        className="absolute top-0 left-0 w-full" 
        style={{ 
          height: '1000px',
          opacity: `calc(var(--ambient-path-opacity) * 0.45)` as any,
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 70%, transparent 100%)'
        }}
      >
        {midPaths.map((d, i) => (
          <motion.path 
            key={`mid-${i}`}
            d={d} 
            fill="none" 
            stroke={i % 2 === 0 ? 'var(--ambient-violet)' : 'var(--ambient-cyan)'}
            strokeWidth="1"
            initial={{ pathLength: isReducedMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 4, delay: 1.5 + i * 0.3, ease: "easeInOut" }}
          />
        ))}
        {midNodes.map((n, i) => (
          <circle key={`mn-${i}`} cx={n.cx} cy={n.cy} r="2" fill="var(--ambient-particle)" opacity="0.3" />
        ))}
      </svg>

      {/* ─── BOTTOM ZONE ─── Very faint, sparse traces near insight */}
      <svg 
        className="absolute top-0 left-0 w-full" 
        style={{ 
          height: '1400px',
          opacity: `calc(var(--ambient-path-opacity) * 0.3)` as any,
          maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 70%, black 85%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 70%, black 85%, transparent 100%)'
        }}
      >
        {bottomPaths.map((d, i) => (
          <motion.path 
            key={`bot-${i}`}
            d={d} 
            fill="none" 
            stroke={i % 2 === 0 ? 'var(--ambient-cyan)' : 'var(--ambient-violet)'}
            strokeWidth="0.75"
            initial={{ pathLength: isReducedMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 5, delay: 2.5 + i * 0.5, ease: "easeInOut" }}
          />
        ))}
        {bottomNodes.map((n, i) => (
          <circle key={`bn-${i}`} cx={n.cx} cy={n.cy} r="1.5" fill="var(--ambient-particle)" opacity="0.2" />
        ))}
      </svg>
    </div>
  );
};
