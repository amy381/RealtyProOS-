/**
 * dragGuard — Global drag-select protection
 *
 * Tracks the element where the most recent mousedown occurred.
 * Inline edit blur handlers call mouseDownIsInside(el) to detect when blur
 * fired because the user dragged outside the element boundary (rather than
 * genuinely navigating away), and suppress the commit in that case.
 *
 * Reset is deferred one animation frame so that blur / click handlers that
 * fire synchronously during the same mouseup cycle can still read the value.
 */

let _mouseDownTarget = null

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', e => {
    _mouseDownTarget = e.target
  }, true)

  document.addEventListener('mouseup', () => {
    requestAnimationFrame(() => { _mouseDownTarget = null })
  }, true)
}

/**
 * Returns true if the last mousedown event originated inside `el`.
 * Pass `e.currentTarget` from an onBlur handler, or a React ref's `.current`.
 */
export function mouseDownIsInside(el) {
  return !!(el && _mouseDownTarget && el.contains(_mouseDownTarget))
}
