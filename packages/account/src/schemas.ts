import { z } from "zod"

/*
 * WorkOS's answers, as its AuthKit reference describes them. They're third-party JSON, so each is a loose object that
 * reads only the fields Parity uses (decisions.md, "Data Parity didn't make is checked with zod"). Fields WorkOS lists
 * as optional may come back as null.
 */

/** A WorkOS user. */
export const workosUser = z.looseObject({
  id: z.string(),
  email: z.string(),
  email_verified: z.boolean(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  profile_picture_url: z.string().nullish()
})

/** What `/user_management/authenticate` answers to a code or a refresh. */
export const authenticateResponse = z.looseObject({
  user: workosUser,
  organization_id: z.string().nullish(),
  access_token: z.string(),
  refresh_token: z.string(),
  authentication_method: z.string().nullish()
})

/**
 * What WorkOS answers when it turns a request down. Some errors come as `code` and `message`, others as `error` and
 * `error_description`.
 */
export const workosError = z.looseObject({
  code: z.string().optional().catch(undefined),
  message: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  error_description: z.string().optional().catch(undefined),
  /** The account it turned down, which WorkOS names when it requires single sign-on or a verified email. */
  email: z.string().optional().catch(undefined),
  /** Who signed in, which WorkOS gives when they have to choose an organization. */
  user: z.looseObject({ email: z.string() }).optional().catch(undefined),
  /** The organizations to choose from, with `organization_selection_required`. */
  organizations: z
    .array(z.looseObject({ id: z.string(), name: z.string() }).transform(({ id, name }) => ({ id, name })))
    .optional()
    .catch(undefined)
})

/** The access token's claims: a short-lived JWT naming the person, their session, organization, role and permissions. */
export const accessTokenClaims = z.looseObject({
  sub: z.string(),
  sid: z.string(),
  org_id: z.string().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  /** Seconds since the epoch. */
  exp: z.number(),
  /** Seconds since the epoch. */
  iat: z.number().optional()
})
