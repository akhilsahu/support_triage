import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { auraProvider } from '../../services/aura'
import { PublicSpace } from '../../services/aura/types'
import { PublicSpaceExperience } from './PublicSpaceExperience'

export type AuraViewState = 'loading' | 'empty' | 'transitioning' | 'conversation' | 'not-found'

export function PublicYulloLink({ initialSpace = null }: { initialSpace?: PublicSpace | null }) {
  const { slug, handle } = useParams<{ slug?: string; handle?: string }>()
  const publicHandle = handle || slug
  const [space, setSpace] = useState<PublicSpace | null>(initialSpace)
  const [viewState, setViewState] = useState<AuraViewState>(initialSpace ? 'empty' : 'loading')

  useEffect(() => {
    if (initialSpace) {
      setSpace(initialSpace)
      setViewState('empty')
      return
    }

    if (!publicHandle) {
      setViewState('not-found')
      return
    }

    let isMounted = true
    const fetchSpace = async () => {
      try {
        const data = await auraProvider.getPublicSpace(publicHandle)
        if (!isMounted) return
        if (data) {
          setSpace(data)
          setViewState('empty')
        } else {
          setViewState('not-found')
        }
      } catch (error) {
        if (!isMounted) return
        setViewState('not-found')
      }
    }
    fetchSpace()

    return () => { isMounted = false }
  }, [initialSpace, publicHandle])

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center font-sans">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#FFFC00] to-[#FFFC00]/50 flex items-center justify-center text-black font-bold text-lg animate-pulse shadow-sm">
          Y
        </div>
      </div>
    )
  }

  if (viewState === 'not-found' || !space) {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex flex-col items-center justify-center font-sans text-gray-900">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-2xl mb-6">
          ?
        </div>
        <h1 className="text-2xl font-bold mb-2">Space not found</h1>
        <p className="text-gray-500">This Yullo link doesn't exist or isn't public.</p>
      </div>
    )
  }

  return <PublicSpaceExperience key={space.id || space.handle} space={space} />
}
