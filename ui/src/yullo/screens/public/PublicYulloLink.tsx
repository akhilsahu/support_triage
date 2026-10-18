import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { auraProvider } from '../../services/aura'
import { PublicSpace } from '../../services/aura/types'
import { AuraExperience } from './components/AuraExperience'
import { PublicHeader } from './components/PublicHeader'
import { PublicNetworkBackground } from './components/PublicNetworkBackground'
import { useAuraChat } from '../../hooks/useAuraChat'

export type AuraViewState = 'loading' | 'empty' | 'transitioning' | 'conversation' | 'not-found'

export function PublicYulloLink() {
  const { slug } = useParams<{ slug: string }>()
  const [space, setSpace] = useState<PublicSpace | null>(null)
  const [viewState, setViewState] = useState<AuraViewState>('loading')
  const [networkPulse, setNetworkPulse] = useState<number>(0)
  const [identityVisible, setIdentityVisible] = useState<boolean>(true)

  useEffect(() => {
    if (!slug) {
      setViewState('not-found')
      return
    }

    let isMounted = true
    const fetchSpace = async () => {
      try {
        const data = await auraProvider.getPublicSpace(slug)
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
  }, [slug])

  // Initialize chat hook
  // We call this here even if space is null, React hooks must be called unconditionally.
  // When space is null, we won't render AuraExperience anyway.
  const dummySpace: PublicSpace = { handle: '', displayName: '', description: '', auraEnabled: false }
  const chat = useAuraChat(space || dummySpace)

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

  const handleMessageSent = () => {
    if (viewState === 'empty') {
      setViewState('transitioning')
      setTimeout(() => {
        setViewState('conversation')
      }, 420) // match transition duration
    }
    setNetworkPulse(prev => prev + 1)
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#F6F7F8] text-gray-900 font-sans overflow-hidden">
      {/* Network Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <PublicNetworkBackground 
          state={viewState === 'conversation' ? 'conversation' : 'empty'} 
          pulseKey={networkPulse} 
        />
      </div>

      <div className="relative z-10 flex flex-col h-[100dvh] pb-[env(safe-area-inset-bottom)]">
        {/* Header is always visible, but switches layout based on identityVisibility */}
        <div className="w-full relative z-50">
          <PublicHeader space={space} identityVisible={identityVisible} />
        </div>

        {/* Main Content Area */}
        <AuraExperience 
          space={space} 
          viewState={viewState}
          chat={chat}
          onMessageSent={handleMessageSent}
          onIdentityVisibilityChange={setIdentityVisible}
        />
      </div>
    </div>
  )
}
