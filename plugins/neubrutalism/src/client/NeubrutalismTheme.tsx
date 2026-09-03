import { useEffect } from 'react'
import { neubrutalismCss } from './theme.css.ts'

/**
 * Injects the neubrutalism stylesheet at the document root and renders
 * nothing. Mounted on the root-scoped `shell.overlay` slot so it lives for the
 * whole app (all sessions) regardless of which conversation is open.
 */
export const NeubrutalismTheme = () => {
  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-neubrutalism-theme', '')
    style.textContent = neubrutalismCss
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])
  return null
}
