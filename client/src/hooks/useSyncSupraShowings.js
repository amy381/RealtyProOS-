import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const API_BASE       = import.meta.env.DEV ? 'http://localhost:3001' : ''
const SUPRA_SENDER   = 'suprashowing@suprasystems.com'
const SUPRA_LABEL_ID = 'Label_53'
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

function normalizeAddress(addr) {
  return (addr || '').trim().toLowerCase().split(',')[0].replace(/\s+/g, ' ')
}

export function useSyncSupraShowings(transactions) {
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    setSyncing(true)
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

      // Search inbox for all emails from Supra (max 100)
      const search = await gmail(
        `/messages?q=${encodeURIComponent(`from:${SUPRA_SENDER}`)}&maxResults=100`
      )
      if (!search.messages?.length) return { inserted: 0, unmatched: [] }

      // Fetch existing gmail_message_ids to detect duplicates
      const { data: existing } = await supabase
        .from('showings')
        .select('gmail_message_id')
        .not('gmail_message_id', 'is', null)
      const existingIds = new Set((existing || []).map(s => s.gmail_message_id))

      // Seller transactions for address matching
      const sellerTx = transactions.filter(t => t.rep_type === 'Seller')

      let inserted = 0
      const unmatched = []

      for (const { id: msgId } of search.messages) {
        // Fetch minimal first (fast) to check if already labeled
        const minimal = await gmail(`/messages/${msgId}?format=minimal`)
        const hasLabel = minimal.labelIds?.includes(SUPRA_LABEL_ID)

        // Already processed — ensure label is applied and skip
        if (existingIds.has(msgId)) {
          if (!hasLabel) await gmail(`/messages/${msgId}/modify`, { method: 'POST', body: { addLabelIds: [SUPRA_LABEL_ID] } })
          continue
        }

        // Already labeled but not in our DB — skip (was processed on another device or manually)
        if (hasLabel) continue

        // Fetch full message for body parsing
        const full = await gmail(`/messages/${msgId}?format=full`)
        const body = extractPlainText(full.payload)
        const match = body.match(SHOWING_REGEX)

        // Always apply label regardless of parse result
        await gmail(`/messages/${msgId}/modify`, { method: 'POST', body: { addLabelIds: [SUPRA_LABEL_ID] } })

        if (!match) continue

        const [, agent_name, agent_phone, agent_email, address, date, time] = match
        const normalAddr = normalizeAddress(address)

        // Case-insensitive address match against seller transactions
        const tx = sellerTx.find(t => {
          const txNorm = normalizeAddress(t.property_address)
          return txNorm === normalAddr
            || txNorm.startsWith(normalAddr)
            || normalAddr.startsWith(txNorm)
        })

        if (!tx) {
          unmatched.push(address.trim())
          continue
        }

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
          inserted++
          existingIds.add(msgId)
        }
      }

      return { inserted, unmatched }
    } finally {
      setSyncing(false)
    }
  }, [transactions])

  return { sync, syncing }
}
