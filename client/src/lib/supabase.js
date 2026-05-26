import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// getUserId() returns the *effective* user_id for all data writes — the
// agent's id if the authenticated user is a TC on the agent's team
// (resolved via public.team_members), otherwise the user's own auth id.
//
// All insert/upsert sites use this so TC-created rows are tagged with the
// agent's id and surface in the agent's RLS scope (Phase C).
//
// The lookup is cached for the lifetime of the auth session and invalidated
// on auth state change. If the team_members table is unreachable (e.g. the
// Phase C migration hasn't been applied yet), we fall back to user.id so the
// app keeps working with Phase A semantics.

let cachedUserId = null
let inFlight     = null

export async function getUserId() {
  if (cachedUserId) return cachedUserId
  if (inFlight)     return inFlight
  inFlight = (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      cachedUserId = null
      inFlight     = null
      return null
    }

    const { data: membership, error } = await supabase
      .from('team_members')
      .select('agent_user_id')
      .eq('member_user_id', user.id)
      .maybeSingle()

    if (error) {
      // Most likely: Phase C migration not yet applied (table missing).
      console.warn('[getUserId] team_members lookup failed, falling back to own id:', error.message)
    }

    cachedUserId = (!error && membership?.agent_user_id) || user.id
    inFlight     = null
    return cachedUserId
  })()
  return inFlight
}

// Reset on login/logout — the next getUserId() call will re-resolve the
// effective id against team_members for the new session.
supabase.auth.onAuthStateChange((_event, _session) => {
  cachedUserId = null
  inFlight     = null
})
