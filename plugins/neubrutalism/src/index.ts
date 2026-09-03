/**
 * Neubrutalism theme pack — host half.
 *
 * The whole theme lives in the BROWSER half (styles injected via the
 * root-scoped `shell.overlay` slot). The host half exists only so the profile
 * loader can mount the package by name and wire the client bundle; it carries
 * no configuration and performs no work.
 */

import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

export interface Config {
  /** Reserved for future tuning (palette overrides). Currently unused. */
  variant: 'light-dark'
}

export const Config: z.ZodType<Config> = z.object({
  variant: z.enum(['light-dark']).default('light-dark'),
})

export const name = 'neubrutalism'
export const inject: string[] = []

export function apply(_ctx: Context): void {
  // Intentionally empty: theming is browser-side only.
}
