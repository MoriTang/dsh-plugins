import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ui-renderer service merge (ctx.slots), the
// ui-conversation SlotMap merge (conversation.composer.dock), and the ui-slots
// types through the Client assembly.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { ToolAuditDock } from './ToolAuditDock.tsx'

/** Required services: slots (composer.dock registration). */
export const inject = ['slots']

/**
 * Browser half: registers the tool-call audit readout on the composer dock.
 * The panel polls the host's `/tool-audit/recent` route for the current
 * session's recent tool calls (duration, settle outcome, slow/error flags).
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'tool-audit',
    // After the stats line (order 0) and the cost/balance readout (order 10).
    order: 20,
  }, ToolAuditDock))
}

export { ToolAuditDock }

export type { ToolAuditDockProps, ToolAuditRecentPayload } from './ToolAuditDock.tsx'
