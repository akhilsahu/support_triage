import { motion } from 'framer-motion'
import { PublicSpace } from '../../../services/aura/types'

export function IdentityBlock({ space }: { space: PublicSpace }) {
  return (
    <motion.div 
      className="flex flex-col items-center text-center space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative">
        {/* Subtle yellow halo */}
        <div className="absolute inset-0 bg-[#FFFC00] rounded-full blur-md opacity-20 transform scale-110" />
        
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#FFFC00] to-[#FFFC00]/50 flex items-center justify-center text-black font-bold text-2xl shadow-sm ring-4 ring-white">
          {space.displayName.charAt(0).toUpperCase()}
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{space.displayName}</h1>
        <p className="text-gray-600 font-medium max-w-sm mx-auto leading-relaxed">
          {space.description}
        </p>
        {space.locationLabel && (
          <p className="text-sm text-gray-400 mt-2">
            {space.locationLabel}
          </p>
        )}
      </div>
    </motion.div>
  )
}
