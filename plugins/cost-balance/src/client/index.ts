import type { Context } from '@deepseek-ai/cordis'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the ui-conversation SlotMap merge (composer.dock) through
// the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { CostBalanceView } from '../projection.ts'
import { CostBalanceLine } from './CostBalanceLine.tsx'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    costBalance: CostBalanceView
  }
}

/** Required services: slots (composer.dock registration). */
export const inject = ['slots']

/**
 * Browser half: registers the cost/balance readout on the composer dock,
 * beside the shipped stats line. The session's spend rides
 * `useProjection('costBalance')`; the account balance is polled from the
 * host's `/cost-balance/balance` route (an external account fact, not a
 * session-log fold).
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'cost-balance',
    // After the stats line (order 0) so the readout trails the token stats.
    order: 10,
  }, CostBalanceLine))
}

export { CostBalanceLine }

export type { CostBalanceLineProps } from './CostBalanceLine.tsx'
export type { UseProjection }
