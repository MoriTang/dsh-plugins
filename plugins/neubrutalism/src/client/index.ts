import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ui-renderer service merge (ctx.slots), the ui-layout
// SlotMap merge (shell.overlay), and the ui-slots types through the Client
// assembly boundary.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NeubrutalismTheme } from './NeubrutalismTheme.tsx'

/** Required services: slots (shell.overlay registration). */
export const inject = ['slots']

/**
 * Browser half: mounts the neubrutalism theme stylesheet on the root-scoped
 * `shell.overlay` slot so it styles the whole app, both light and dark.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'neubrutalism',
    // Keep it early so the stylesheet exists before content paints.
    order: 0,
  }, NeubrutalismTheme))
}

export { NeubrutalismTheme }
