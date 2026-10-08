import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MobileDeals from './MobileDeals.jsx'
import './mobile.css'

// Same logo URL AppHeader.jsx uses.
const LOGO_URL = 'https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-nav-v3.png'

// Same parse as App.jsx (copied, not imported — App.jsx must stay untouched).
const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

function isAllowed(session) {
  const email = session?.user?.email?.toLowerCase() || ''
  return ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(email)
}

export default function MobileApp() {
  const [session, setSession]           = useState(undefined) // undefined = loading
  const [accessDenied, setAccessDenied] = useState(false)
  const [signingIn, setSigningIn]       = useState(false)

  useEffect(() => {
    const apply = (s) => {
      if (s && !isAllowed(s)) {
        setAccessDenied(true)
        setSession(null)
        // Defer: supabase calls inside onAuthStateChange callbacks can deadlock.
        setTimeout(() => supabase.auth.signOut(), 0)
      } else {
        setSession(s)
        // Keep the denied message visible after the forced sign-out (s === null).
        if (s) setAccessDenied(false)
      }
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => apply(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => apply(s))
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/m' },
    })
    // Page redirects to Google — no need to reset signingIn.
  }

  if (session === undefined) {
    return <div className="m-app"><div className="m-status">Loading…</div></div>
  }

  if (!session) {
    return (
      <div className="m-app m-login">
        <div className="m-login-card">
          <div className="m-login-title">LegacyOS</div>
          {accessDenied && (
            <div className="m-error" role="alert">
              Access denied. You are not authorized to use LegacyOS.
            </div>
          )}
          <button className="m-btn m-btn--primary" onClick={signIn} disabled={signingIn}>
            {signingIn ? 'Redirecting…' : 'Sign in with Google'}
          </button>
        </div>
        <a className="m-link" href="/">Open desktop version</a>
      </div>
    )
  }

  return (
    <div className="m-app">
      <header className="m-header">
        <img className="m-header-logo" src={LOGO_URL} alt="LegacyOS" />
        <button className="m-btn m-btn--ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="m-main">
        <MobileDeals />
      </main>
      <footer className="m-footer">
        <a className="m-link" href="/">Open desktop version</a>
      </footer>
    </div>
  )
}
