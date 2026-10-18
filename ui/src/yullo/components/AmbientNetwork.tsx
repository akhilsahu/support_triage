import React from 'react';

export const AmbientNetwork: React.FC = () => {
  return (
    <div 
      className="absolute top-0 left-0 w-full h-[800px] pointer-events-none overflow-hidden z-0"
      style={{
        maskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)'
      }}
    >
      <svg className="w-full h-full opacity-[0.03]">
        {/* Massive, sweeping curved network paths across the top 35% */}
        <path 
          d="M -100 200 C 300 200, 400 400, 800 400" 
          fill="none" 
          stroke="var(--text-primary)" 
          strokeWidth="1.5" 
        />
        <path 
          d="M 200 -50 C 200 300, 600 200, 1200 300" 
          fill="none" 
          stroke="var(--text-primary)" 
          strokeWidth="1.5" 
        />
        <path 
          d="M 500 500 C 600 300, 900 100, 1400 150" 
          fill="none" 
          stroke="var(--text-primary)" 
          strokeWidth="1.5" 
        />

        {/* 5-7 tiny nodes at intersections or path points */}
        <circle cx="340" cy="300" r="2.5" fill="var(--text-primary)" />
        <circle cx="500" cy="225" r="2.5" fill="var(--text-primary)" />
        <circle cx="680" cy="400" r="2.5" fill="var(--text-primary)" />
        <circle cx="720" cy="200" r="2.5" fill="var(--text-primary)" />
        <circle cx="950" cy="115" r="2.5" fill="var(--text-primary)" />
        <circle cx="1100" cy="280" r="2.5" fill="var(--text-primary)" />

      </svg>

      {/* Subtly illuminate one node with yellow halo near active space (e.g. node at 340,300) */}
      <div 
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          left: '340px',
          top: '300px',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, var(--accent-solid) 0%, transparent 70%)',
          opacity: 0.05,
          filter: 'blur(50px)'
        }}
      />
    </div>
  );
};
