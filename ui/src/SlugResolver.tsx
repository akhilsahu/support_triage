import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CustomerChat } from './screens/CustomerChat'
import { PublicYulloLink } from './yullo/screens/public/PublicYulloLink'
import { auraProvider } from './yullo/services/aura'

export function SlugResolver() {
  const { slug } = useParams<{ slug: string }>()
  const [resolvedTo, setResolvedTo] = useState<'loading' | 'yullo' | 'support247'>('loading')
  const [yulloSpace, setYulloSpace] = useState<Awaited<ReturnType<typeof auraProvider.getPublicSpace>>>(null)

  useEffect(() => {
    setResolvedTo('loading')
    setYulloSpace(null)

    if (!slug) {
      setResolvedTo('support247')
      return
    }

    let isMounted = true
    
    // Prioritize checking if this slug is a Yullo space (useful for localhost testing)
    auraProvider.getPublicSpace(slug)
      .then(space => {
        if (!isMounted) return
        if (space) {
          setYulloSpace(space)
          setResolvedTo('yullo')
        } else {
          setResolvedTo('support247')
        }
      })
      .catch((err) => {
        console.warn(`[SlugResolver] Did not resolve Yullo space for slug "${slug}", falling back:`, err)
        if (!isMounted) return
        setResolvedTo('support247')
      })

    return () => { isMounted = false }
  }, [slug])

  if (resolvedTo === 'loading') {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center font-sans">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#FFFC00] to-[#FFFC00]/50 flex items-center justify-center text-black font-bold text-lg animate-pulse shadow-sm">
          Y
        </div>
      </div>
    )
  }

  if (resolvedTo === 'yullo') {
    return <PublicYulloLink initialSpace={yulloSpace} />
  }

  return <CustomerChat />
}
