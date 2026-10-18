import React, { ReactNode } from 'react';

export interface YulloBadgeProps {
  children: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'brand';
  size?: 'sm' | 'md';
  className?: string;
}

export const YulloBadge = ({ children, variant = 'neutral', size = 'sm', className = '' }: YulloBadgeProps) => {
  const variants = {
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    brand: 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] border-transparent',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
};
