import type { Context } from '@deepseek-ai/cordis'
import styles from './neubrutalism.css'
import { TOKEN_OVERRIDES } from './tokens.ts'

const PACKAGE_NAME = 'dsh-neubrutalism-theme'
const STYLE_ATTRIBUTE = 'data-dsh-neubrutalism-theme'

/** The base ThemeRuntime is the only required browser service. */
export const inject = ['theme']

/** Install the reversible token layer, local fonts, and global treatment. */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.theme.overrideTokens(PACKAGE_NAME, TOKEN_OVERRIDES),
    'neubrutalism-theme: token layer',
  )
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const element = document.createElement('style')
    element.setAttribute(STYLE_ATTRIBUTE, '')
    element.textContent = `${__DSH_NEUBRUTALISM_FONT_CSS__}\n${styles}`
    document.head.append(element)
    return () => { element.remove() }
  }, 'neubrutalism-theme: document treatment')
}

export { TOKEN_OVERRIDES } from './tokens.ts'
