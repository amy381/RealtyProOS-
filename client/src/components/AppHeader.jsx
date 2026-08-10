import { useState, useEffect, useRef } from 'react'
import { Bell, CheckSquare, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { deriveInitials } from '../lib/people'
import './AppHeader.css'

// Single-tenant owner scope — mirrors LEGACY_OS_OWNER_USER_ID in
// api/digest/send.js (not shared: api/ and client/ are separate bundles).
// This header shows one agent's brand/identity regardless of which TC is
// logged in, so agent_settings is scoped to the owner, not auth.uid().
const LEGACY_OS_OWNER_USER_ID = 'a02b464f-dd3e-49de-b893-2825fe8efb3f'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function AppHeader({ transactions = [], onNavigateTransaction, onNavigateTab }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState(null) // null = closed
  const [focused, setFocused] = useState(false)
  const [agent,   setAgent]   = useState({ name: '', email: '' })
  const inputRef    = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email || ''
      const { data } = await supabase
        .from('agent_settings')
        .select('realtor_name')
        .eq('user_id', LEGACY_OS_OWNER_USER_ID)
        .maybeSingle()
      if (!cancelled) setAgent({ name: data?.realtor_name || '', email })
    })()
    return () => { cancelled = true }
  }, [])

  const displayName = agent.name || agent.email || ''
  const initials    = deriveInitials(agent.name, agent.email)

  const debouncedQuery = useDebounce(query, 280)

  // ⌘K / Ctrl+K — focus search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') {
        setQuery('')
        setResults(null)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Click outside — close dropdown
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setResults(null)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Search on debounced query
  useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < 2) { setResults(null); return }

    const ql = q.toLowerCase()

    // Transactions — client-side (already loaded)
    const txHits = transactions
      .filter(tx =>
        tx.property_address?.toLowerCase().includes(ql) ||
        tx.client_name?.toLowerCase().includes(ql)
      )
      .slice(0, 4)

    // Tasks + collaborators — from Supabase
    Promise.all([
      supabase
        .from('tasks')
        .select('id, title, transaction_id')
        .ilike('title', `%${q}%`)
        .neq('status', 'complete')
        .limit(4),
      supabase
        .from('collaborators')
        .select('id, name, company')
        .or(`name.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(4),
    ]).then(([taskRes, collabRes]) => {
      setResults({
        transactions:  txHits,
        tasks:         taskRes.data  || [],
        collaborators: collabRes.data || [],
      })
    })
  }, [debouncedQuery, transactions])

  const hasResults = results &&
    (results.transactions.length + results.tasks.length + results.collaborators.length) > 0
  const showEmpty = results && !hasResults && debouncedQuery.trim().length >= 2

  const dismiss = () => { setQuery(''); setResults(null) }

  return (
    <header className="app-header">

      {/* Logo */}
      <div className="app-header-logo">
        <img
          src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-nav-v3.png"
          alt="LegacyOS"
          style={{ height: '40px', width: 'auto' }}
        />
      </div>

      {/* Search */}
      <div className="app-header-search" ref={containerRef}>
        <div className={`search-bar${focused ? ' search-bar--focused' : ''}`}>
          <Search size={14} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search for property, client, task, etc."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
          />
          <kbd className="search-kbd">⌘K</kbd>
        </div>

        {/* Results dropdown */}
        {(hasResults || showEmpty) && (
          <div className="search-dropdown">
            {hasResults && <>
              {results.transactions.length > 0 && (
                <div className="search-group">
                  <div className="search-group-label">Transactions</div>
                  {results.transactions.map(tx => (
                    <button
                      key={tx.id}
                      className="search-result"
                      onMouseDown={() => { onNavigateTransaction?.(tx); dismiss() }}
                    >
                      <span className="search-result-title">{tx.property_address || '(No address)'}</span>
                      {tx.client_name && <span className="search-result-sub">{tx.client_name}</span>}
                    </button>
                  ))}
                </div>
              )}
              {results.tasks.length > 0 && (
                <div className="search-group">
                  <div className="search-group-label">Tasks</div>
                  {results.tasks.map(t => (
                    <button
                      key={t.id}
                      className="search-result"
                      onMouseDown={() => { onNavigateTab?.('tasks'); dismiss() }}
                    >
                      <span className="search-result-title">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.collaborators.length > 0 && (
                <div className="search-group">
                  <div className="search-group-label">Collaborators</div>
                  {results.collaborators.map(c => (
                    <button
                      key={c.id}
                      className="search-result"
                      onMouseDown={() => { onNavigateTab?.('collaborators'); dismiss() }}
                    >
                      <span className="search-result-title">{c.name}</span>
                      {c.company && <span className="search-result-sub">{c.company}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>}
            {showEmpty && (
              <div className="search-empty">No results for &ldquo;{query}&rdquo;</div>
            )}
          </div>
        )}
      </div>

      {/* Right icons */}
      <div className="app-header-right">
        <button className="app-header-icon-btn" title="Notifications">
          <Bell size={18} />
        </button>
        <button className="app-header-icon-btn" title="Quick tasks">
          <CheckSquare size={18} />
        </button>
        <div className="app-header-avatar" title={displayName}>{initials}</div>
      </div>

    </header>
  )
}
