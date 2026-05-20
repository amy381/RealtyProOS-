import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cache the authenticated user's id so every insert/upsert doesn't round-trip
// to /auth/v1/user. The cache is reset when auth state changes.
let cachedUserId = null
let inFlight = null

export async function getUserId() {
  if (cachedUserId) return cachedUserId
  if (inFlight) return inFlight
  inFlight = supabase.auth.getUser().then(({ data: { user } }) => {
    cachedUserId = user?.id ?? null
    inFlight = null
    return cachedUserId
  })
  return inFlight
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null
})
