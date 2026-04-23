import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const API_BASE       = import.meta.env.DEV ? 'http://localhost:3001' : ''
const SUPRA_SENDER   = 'suprashowing@suprasystems.com'
const SUPRA_LABEL_ID = 'processed-supra'
const SHOWING_REGEX  = /The showing by (.+?) \(([^)]+)\) \( ?([^)]+)\) at (.+?) \(KeyBox#[^)]+\) began (\d{2}\/\d{2}\/\d{4}) (\d+:\d+[AP]M)/

function parseShowingDate(dateStr) {
  const [mm, dd, yyyy] = dateStr.split('/')
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

function decodeBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
  } catch {
    return atob(base64)
  }
}

function extractPlainText(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part)
      if (text) return text
    }
  }
  return ''
}

export function useSyncSupraShowings(transactions) {
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    setSyncing(true)
    console.log('[SupraSync] Sync started')
    try {
      // Get access token from server
      const tokenRes = await fetch(`${API_BASE}/api/google/token`)
      if (!tokenRes.ok) throw new Error('Gmail not connected — please re-authorise Google')
      const { access_token } = await tokenRes.json()

      // Thin wrapper for Gmail REST API
      const gmail = async (path, { method = 'GET', body } = {}) => {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
          method,
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })
        return res.json()
      }

      // Search for Supra emails that already have Label_53 (applied by Apps Script on arrival)
      const search = await gmail(
        `/messages?q=${encodeURIComponent(`from:${SUPRA_SENDER} label:${SUPRA_LABEL_ID}`)}&maxResults=100`
      )
      console.log('[SupraSync] Gmail search returned:', search.messages?.length ?? 0, 'messages', search)
      if (!search.messages?.length) return { inserted: 0, unmatched: [] }

      // Fetch existing gmail_message_ids — sole duplicate check
      const { data: existing } = await supabase
        .from('showings')
        .select('gmail_message_id')
        .not('gmail_message_id', 'is', null)
      const existingIds = new Set((existing || []).map(s => s.gmail_message_id))
      console.log('[SupraSync] Existing gmail_message_ids in showings table:', existingIds.size, [...existingIds])

      let inserted = 0
      const unmatched = []

      for (const { id: msgId } of search.messages) {
        console.log('[SupraSync] Processing message id:', msgId)

        // Skip if already in our showings table
        if (existingIds.has(msgId)) {
          console.log('[SupraSync] SKIP — already in showings:', msgId)
          continue
        }

        // Fetch full message for body parsing
        const full = await gmail(`/messages/${msgId}?format=full`)
        console.log('[SupraSync] Message snippet:', full.snippet)
        const body = extractPlainText(full.payload)
        console.log('[SupraSync] Raw body text:', body)
        const match = body.match(SHOWING_REGEX)

        if (!match) {
          console.log('[SupraSync] SKIP — regex did not match for message:', msgId)
          continue
        }

        const [, agent_name, agent_phone, agent_email, address, date, time] = match
        console.log('[SupraSync] Regex matched — groups:', { agent_name, agent_phone, agent_email, address, date, time })

        // Strip city/state/zip — DB stores only the street portion
        const streetAddr = address.split(',')[0].trim()
        console.log('[SupraSync] Stripped street address:', streetAddr)

        // Exact ILIKE match against active/pending seller transactions
        const STATUS_FILTER = ['active-listing', 'pending']
        let { data: txMatches } = await supabase
          .from('transactions')
          .select('id')
          .eq('rep_type', 'Seller')
          .in('status', STATUS_FILTER)
          .ilike('property_address', streetAddr)
        console.log('[SupraSync] Exact ILIKE match results for', JSON.stringify(streetAddr), ':', txMatches)

        // Fallback: match on street number only if exactly one result
        if (!txMatches?.length) {
          const streetNumber = streetAddr.split(' ')[0]
          console.log('[SupraSync] No exact match — trying street number fallback:', streetNumber)
          const { data: fallback } = await supabase
            .from('transactions')
            .select('id')
            .eq('rep_type', 'Seller')
            .in('status', STATUS_FILTER)
            .ilike('property_address', `${streetNumber}%`)
          console.log('[SupraSync] Fallback results for', `${streetNumber}%`, ':', fallback)
          txMatches = fallback?.length === 1 ? fallback : []
          if (fallback?.length !== 1) console.log('[SupraSync] Fallback skipped —', fallback?.length ?? 0, 'results (need exactly 1)')
        }

        const tx = txMatches?.[0] ?? null

        if (!tx) {
          console.log('[SupraSync] UNMATCHED — no transaction found for:', streetAddr)
          unmatched.push(streetAddr)
          continue
        }

        console.log('[SupraSync] Matched transaction id:', tx.id, '— inserting showing…')
        const { error } = await supabase.from('showings').insert({
          transaction_id:     tx.id,
          agent_name:         agent_name.trim(),
          agent_phone:        agent_phone.trim(),
          agent_email:        agent_email.trim(),
          showing_date:       parseShowingDate(date),
          showing_time:       time,
          gmail_message_id:   msgId,
          feedback_requested: false,
        })

        if (!error) {
          console.log('[SupraSync] INSERT OK — showing saved for message:', msgId)
          inserted++
          existingIds.add(msgId)
        } else {
          console.error('[SupraSync] INSERT ERROR for message', msgId, ':', error.message)
        }
      }

      console.log('[SupraSync] Sync complete — inserted:', inserted, '| unmatched:', unmatched)
      return { inserted, unmatched }
    } finally {
      setSyncing(false)
    }
  }, [transactions])

  return { sync, syncing }
}
