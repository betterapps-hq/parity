import { accessTokenClaims } from "./schemas.ts"

/** What Parity reads from an access token. Times are milliseconds since the epoch. */
export interface AccessToken {
  userId: string
  sessionId: string
  organizationId?: string
  role?: string
  permissions: string[]
  issuedAt?: number
  expiresAt: number
}

/**
 * Reads an access token's claims without checking its signature. Main gets the token straight from WorkOS over HTTPS
 * and only reads when it expires and who it names; Parity's service checks signatures against WorkOS's keys (PAR-615).
 * A token that isn't a JWT with the claims Parity needs throws `TypeError`.
 */
export function readAccessToken(token: string): AccessToken {
  const parts = token.split(".")
  const payload = parts[1]
  if (parts.length !== 3 || !payload) throw new TypeError("The access token isn't a JWT")
  let json: unknown
  try {
    json = JSON.parse(decodeBase64Url(payload))
  } catch {
    throw new TypeError("The access token's claims aren't JSON")
  }
  const parsed = accessTokenClaims.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new TypeError(`The access token's ${issue?.path.join(".") || "claims"}: ${issue?.message ?? "invalid"}`)
  }
  const claims = parsed.data
  return {
    userId: claims.sub,
    sessionId: claims.sid,
    ...(claims.org_id !== undefined && { organizationId: claims.org_id }),
    ...(claims.role !== undefined && { role: claims.role }),
    permissions: claims.permissions ?? [],
    ...(claims.iat !== undefined && { issuedAt: claims.iat * 1000 }),
    expiresAt: claims.exp * 1000
  }
}

function decodeBase64Url(text: string): string {
  const base64 = text
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=")
  const binary = atob(base64)
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}
