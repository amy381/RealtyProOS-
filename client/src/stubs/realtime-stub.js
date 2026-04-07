// Stub for @supabase/realtime-js — not used in this app.
// Replaces the full package at build time to reduce bundle size.

export const REALTIME_LISTEN_TYPES              = { BROADCAST: 'broadcast', PRESENCE: 'presence', POSTGRES_CHANGES: 'postgres_changes' }
export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = { ALL: '*', INSERT: 'INSERT', UPDATE: 'UPDATE', DELETE: 'DELETE' }
export const REALTIME_PRESENCE_LISTEN_EVENTS    = { SYNC: 'sync', JOIN: 'join', LEAVE: 'leave' }
export const REALTIME_SUBSCRIBE_STATES          = { SUBSCRIBED: 'SUBSCRIBED', TIMED_OUT: 'TIMED_OUT', CLOSED: 'CLOSED', CHANNEL_ERROR: 'CHANNEL_ERROR' }
export const REALTIME_CHANNEL_STATES            = { closed: 'closed', errored: 'errored', joined: 'joined', joining: 'joining', leaving: 'leaving' }
export const WebSocketFactory                   = null

export class RealtimePresence {
  constructor() { this.state = {}; this.pendingJoinRef = null }
  track()   {}
  untrack() {}
}

export class RealtimeChannel {
  constructor() {}
  subscribe()      { return this }
  unsubscribe()    { return this }
  on()             { return this }
  send()           { return Promise.resolve('ok') }
  track()          { return Promise.resolve('ok') }
  untrack()        { return Promise.resolve('ok') }
}

export class RealtimeClient {
  constructor() { this.channels = [] }
  connect()          {}
  disconnect()       { return Promise.resolve({ error: null, data: null }) }
  channel()          { return new RealtimeChannel() }
  removeChannel()    { return Promise.resolve('ok') }
  removeAllChannels(){ return Promise.resolve([]) }
  getChannels()      { return [] }
  setAuth()          {}
}
