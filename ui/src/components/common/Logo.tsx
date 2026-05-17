import React from 'react'

interface LogoProps {
  variant?: 'light' | 'dark' | 'default'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const Logo: React.FC<LogoProps> = ({ 
  variant = 'default', 
  size = 'md',
  className = '' 
}) => {
  // Example usage - uncomment and modify when you add actual logo files
  /*
  const logoSrc = {
    light: () => import('@/assets/images/logos/logo-light.svg'),
    dark: () => import('@/assets/images/logos/logo-dark.svg'),
    default: () => import('@/assets/images/logos/logo.svg')
  }
  */

  const sizeClasses = {
    sm: 'h-8 w-auto',
    md: 'h-12 w-auto', 
    lg: 'h-16 w-auto'
  }

  return (
    <div className={`flex items-center ${className}`}>
      {/* Placeholder logo - replace with actual logo once added */}
      <div 
        className={`bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold flex items-center justify-center rounded ${sizeClasses[size]}`}
      >
        <span className="text-sm">LOGO</span>
      </div>
      
      {/* Uncomment this when you add actual logo files:
      <img 
        src={logoSrc[variant]} 
        alt="Company Logo"
        className={sizeClasses[size]}
      />
      */}
    </div>
  )
}

export default Logo