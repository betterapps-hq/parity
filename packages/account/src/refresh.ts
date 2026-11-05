import type { AccessToken } from "./token.ts"

/** How long before an access token expires that main refreshes it. WorkOS's tokens last 5 minutes. */
export const refreshLead = 60_000

/**
 * How long to wait from `now` before refreshing: a minute before the token expires, or halfway through its life when
 * that's later, so a short-lived token isn't refreshed straight away. Zero when it's already due, as after the computer
 * wakes from sleep.
 */
export function refreshDelay(token: AccessToken, now: number): number {
  const lifetime = token.issuedAt === undefined ? Infinity : token.expiresAt - token.issuedAt
  const at = token.expiresAt - Math.min(refreshLead, lifetime / 2)
  return Math.max(0, at - now)
}

/**
 * How long to wait before trying an unavailable refresh again: 5 seconds, doubling with each failure in a row, up to 5
 * minutes. A refused refresh isn't tried again; the person signs in again.
 */
export function retryDelay(failures: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, failures - 1), 300_000)
}
