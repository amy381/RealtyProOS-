// Centralized helpers for rendering agent and TC names, initials, and assignee
// option lists. Replaces hardcoded TC_NAMES / ASSIGNEE_OPTIONS / INITIALS_MAP /
// "Amy Casanova" literals scattered across the app.

// Two-letter initials from a full name; falls back to the email's local-part
// (e.g. "sarah.mitchell.legacy" → "SM"). Returns "?" if both are blank.
export function deriveInitials(name, email) {
  const source = (name || '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map(p => p[0]).join('')
    if (letters) return letters.toUpperCase()
  }
  const local = (email || '').split('@')[0]
  if (local) {
    const parts = local.split(/[._-]+/).filter(Boolean)
    const letters = parts.slice(0, 2).map(p => p[0]).join('')
    if (letters) return letters.toUpperCase()
    return local[0].toUpperCase()
  }
  return '?'
}

// First whitespace-separated token of a name. Used for short filter pill labels
// ("Rachel Torres" → "Rachel"). Empty input returns empty string.
export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

// "Me" → the agent's realtor_name. Anything else passes through unchanged.
// If no agent name is configured, "Me" stays as "Me" rather than becoming "".
export function resolveMeName(rawName, agentName) {
  if (rawName === 'Me') return agentName || 'Me'
  return rawName || ''
}

// All configured TC names — for filter pills and "show all TCs" lists.
export function getTcNames(tcSettings) {
  return (tcSettings || []).map(t => t.name).filter(Boolean)
}

// Assignee dropdown options: "Me" plus every TC except the agent themselves
// (the agent is already represented by the "Me" sentinel).
export function getAssigneeOptions(tcSettings, agentName) {
  const names = getTcNames(tcSettings).filter(n => n !== agentName)
  return ['Me', ...names]
}
