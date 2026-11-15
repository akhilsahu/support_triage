import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react'
import { YulloPublicLayout } from '../components/YulloPublicLayout'
import { yulloLandingPath } from '../config'
import { yulloPublicPages, type YulloPublicPage } from '../config/publicPages'

export function YulloInfo({ page }: { page: YulloPublicPage }) {
  const content = yulloPublicPages[page]
  return (
    <YulloPublicLayout>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-20">
        <Link to={yulloLandingPath()} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to Yullo</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{content.label}</p>
        <h1 className="mt-4 font-satoshi text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{content.title}</h1>
        <p className="mt-6 text-lg leading-relaxed text-slate-600">{content.description}</p>
        <div className="mt-12 space-y-10 border-t border-slate-200 pt-10">
          {content.sections.map(section => <section key={section.title}><h2 className="font-satoshi text-xl font-bold">{section.title}</h2><p className="mt-3 text-base leading-7 text-slate-600">{section.body}</p></section>)}
        </div>
        {page === 'contact' ? <a href="mailto:hello@yullo.co" className="mt-10 inline-flex min-h-12 items-center gap-3 rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold"><Mail className="h-5 w-5" />hello@yullo.co</a>
          : page === 'about' || page === 'manifesto' ? <Link to="/yullo/auth?intent=claim" className="mt-10 inline-flex min-h-12 items-center gap-3 rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold">Create your Space<ArrowRight className="h-4 w-4" /></Link> : null}
      </main>
    </YulloPublicLayout>
  )
}
