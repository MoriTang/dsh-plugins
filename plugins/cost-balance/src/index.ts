import type { Context } from '@deepseek-ai/cordis'
import type { ServerResponse } from 'node:http'
import type { IncomingMessage } from 'node:http'
// Type-only: pulls the webServer Context merge and its WebRoute type.
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the timer service mixin (ctx.setInterval) into Context.
import type {} from '@deepseek-ai/cordis-plugin-timer'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { costBalanceDefinition, type Pricing } from './projection.ts'

/** One balance line from the DeepSeek /user/balance response. */
interface BalanceInfo {
  currency: 'CNY' | 'USD'
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

interface BalanceResponse {
  is_available: boolean
  balance_infos: BalanceInfo[]
}

export interface Config {
  /** Per-million-token prices in `currency` units. */
  pricing: Pricing
  /** Currency the prices are expressed in (display only). */
  currency: string
  /** Credential reference (environment-variable name) for the API key. */
  apiKeyEnv: string
  /** Endpoint base; `/user/balance` is appended. */
  baseURL: string
  /** Balance refresh interval in milliseconds. */
  refreshMs: number
}

export const Config: z.ZodType<Config> = z.object({
  pricing: z.object({
    inputPerM: z.number().nonnegative(),
    outputPerM: z.number().nonnegative(),
    cacheReadPerM: z.number().nonnegative(),
    cacheWritePerM: z.number().nonnegative(),
  }),
  currency: z.string().default('¥'),
  apiKeyEnv: z.string().default('DEEPSEEK_API_KEY'),
  baseURL: z.string().default('https://api.deepseek.com'),
  refreshMs: z.number().int().positive().default(60_000),
})

export const name = 'cost-balance'
export const inject = ['sessionProjections', 'webServer', 'timer']

/**
 * Host half: registers the per-session cost projection (token usage folded
 * into an estimated spend) and serves the account balance over an exact
 * webserver route the browser half polls.
 *
 * Balance is an external account fact, not a session-log fold, so it cannot
 * ride the projection wire (pure event folding) and must not pollute the
 * durable session log with synthetic events. An exact `/cost-balance/balance`
 * route keeps the two concerns apart: the client fetches the current cached
 * balance on an interval and re-renders when it changes.
 */
export function apply(ctx: Context, config: Config): void {
  const ref: CredentialRef = credentialRef(config.apiKeyEnv)

  // Per-session cost fold: prices captured at registration; a config
  // hot-reload unloads this fiber and re-registers with fresh prices.
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(costBalanceDefinition(config.pricing, config.currency))
  })

  // Balance cache + periodic refresh. The route serves whatever the last
  // successful refresh produced; failures keep the previous value and log.
  let balance: BalanceResponse | undefined
  let checkedAt = 0
  let lastError: string | undefined

  const refresh = async (): Promise<void> => {
    try {
      const credentials = ctx.get('credentials')
      let apiKey: string | undefined
      if (credentials !== undefined) {
        const hit = await credentials.resolve(ref)
        apiKey = hit?.value
      } else {
        apiKey = process.env[config.apiKeyEnv]
      }
      if (apiKey === undefined || apiKey.length === 0) {
        lastError = `no API key for ${config.apiKeyEnv}`
        return
      }
      const res = await fetch(`${config.baseURL}/user/balance`, {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        lastError = `balance fetch failed: HTTP ${res.status}`
        return
      }
      const body = (await res.json()) as BalanceResponse
      balance = body
      checkedAt = Date.now()
      lastError = undefined
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  // The timer service's setInterval is an effect: it is cleared when this
  // fiber unloads (config hot-reload, shutdown).
  ctx.setInterval(() => void refresh(), config.refreshMs)

  // Fire one refresh shortly after activation so the route has data fast.
  void refresh()

  const handler = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      balance: balance ?? null,
      checkedAt,
      lastError: lastError ?? null,
    }))
  }
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/cost-balance/balance', handler }),
    'cost-balance: balance route',
  )
}
