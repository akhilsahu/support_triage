import React, { ReactNode } from 'react';

export interface YulloCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const YulloCard = ({ children, className = '', onClick }: YulloCardProps) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      onClick={onClick}
      className={`
        bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-2xl shadow-sm
        ${onClick ? 'text-left w-full hover:border-[var(--accent-border)] hover:shadow-md transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] focus:ring-offset-2' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
};
