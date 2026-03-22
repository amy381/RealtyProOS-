import { useEffect } from 'react'

/**
 * useKeyboardShortcuts
 * Registers global keyboard shortcuts. Shortcuts are skipped when focus is
 * inside an input, textarea, or contenteditable element.
 *
 * @param {Object} shortcuts - map of key name → handler function
 *   e.g. { Escape: () => goBack(), 'Shift+/': () => openHelp() }
 */
export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      // Skip when typing in form fields
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

      const key = [
        e.metaKey  && 'Meta',
        e.ctrlKey  && 'Ctrl',
        e.altKey   && 'Alt',
        e.shiftKey && 'Shift',
        e.key,
      ].filter(Boolean).join('+')

      const fn = shortcuts[key] ?? shortcuts[e.key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
