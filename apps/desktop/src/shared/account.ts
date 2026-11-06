import { z } from "zod"

/*
 * What main and the window say to each other about signing in (PAR-612). Main keeps every token; the window gets the
 * accounts signed in, which one you're in, each one's organization and role, and how far a sign-in has got (PAR-669).
 * Both sides check what they receive against these schemas, since IPC is data from outside (conventions.md, "Data from
 * outside is checked where it comes in").
 */

/** How a person signs in: Google, GitHub or Microsoft in the browser, or AuthKit for a work email. */
export const signInProvider = z.enum(["GoogleOAuth", "GitHubOAuth", "MicrosoftOAuth", "authkit"])
export type SignInProvider = z.infer<typeof signInProvider>

/** What the window asks main to start: a provider, and for AuthKit the work email it fills in. */
export const signInRequest = z.strictObject({
  provider: signInProvider,
  email: z.string().trim().min(1).max(320).optional(),
  /** The organization chosen in Parity, when WorkOS asked which one. */
  organizationId: z
    .string()
    .regex(/^org_\w+$/)
    .optional()
})
export type SignInRequest = z.infer<typeof signInRequest>

/** An organization, as WorkOS names it. */
export const organization = z.strictObject({ id: z.string(), name: z.string() })
export type Organization = z.infer<typeof organization>

/** Someone signed in, as the window knows them: no tokens. */
export const accountPerson = z.strictObject({
  email: z.string(),
  name: z.string().optional(),
  pictureUrl: z.string().optional(),
  /** Their organization in this session; none when they're in no organization yet. */
  organizationId: z.string().optional(),
  /** Their role in that organization, such as `member` or `admin`. */
  role: z.string().optional(),
  /**
   * The organizations Parity knows they're in, with WorkOS's names, as it named them when they chose one. Until
   * Parity's service can list them (PAR-616), someone in one organization has none here.
   */
  organizations: z.array(organization).optional()
})
export type AccountPerson = z.infer<typeof accountPerson>

/** Which organization the window asks main to move the session to. */
export const organizationId = z.string().regex(/^org_\w+$/)

/** Which account the window asks main to switch to or sign out of, by its email. */
export const accountEmail = z.string().min(1).max(320)

/**
 * Ways a sign-in ends without a session: turned down in the browser, an error, an account WorkOS turns down, an
 * organization that requires its single sign-on, or someone in several organizations who has to choose one.
 */
export const signInProblem = z.enum(["canceled", "failed", "refused", "single-sign-on", "choose-organization"])
export type SignInProblem = z.infer<typeof signInProblem>

/** A sign-in under way: waiting for the browser, or ended without a session. */
export const signInAttempt = z.discriminatedUnion("at", [
  z.strictObject({
    at: z.literal("waiting"),
    provider: signInProvider,
    email: z.string().optional(),
    /** WorkOS's page, to open again or copy. It holds no secret: the verifier stays in main. */
    url: z.string()
  }),
  z.strictObject({
    at: z.literal("problem"),
    provider: signInProvider,
    problem: signInProblem,
    /** The account WorkOS named, when it turned one down or sent it to single sign-on. */
    email: z.string().optional(),
    /** What WorkOS said, to copy for help. */
    details: z.string().optional(),
    /** The organizations to choose from, as WorkOS names them. */
    organizations: z.array(organization).optional()
  })
])
export type SignInAttempt = z.infer<typeof signInAttempt>

/** An account signed in, among the several a person can be: who, how they signed in, and whether WorkOS ended it. */
export const signedInAccount = accountPerson.extend({
  provider: signInProvider,
  /** WorkOS ended its session on refresh. It stays listed, to sign in to again, until it's removed. */
  ended: z.literal(true).optional()
})
export type SignedInAccount = z.infer<typeof signedInAccount>

export const accountState = z.strictObject({
  /** The account you're in, or null. `untilQuit` when the system has no keyring to keep the session. */
  account: accountPerson.extend({ untilQuit: z.boolean() }).nullable(),
  /** Every account signed in, the one you're in among them, in the order they were added. */
  accounts: z.array(signedInAccount),
  attempt: signInAttempt.nullable(),
  /**
   * The session of the account you were in, which WorkOS ended on refresh: who it was and how they signed in, to sign
   * in again the same way.
   */
  ended: z.strictObject({ person: accountPerson, provider: signInProvider }).nullable()
})
export type AccountState = z.infer<typeof accountState>

export const signedOut: AccountState = { account: null, accounts: [], attempt: null, ended: null }

/**
 * A link the browser handed to a copy of Parity that didn't start its sign-in, passed to another copy's local service
 * (`POST /auth/link`), which answers whether it was that copy's.
 */
export const passedLink = z.strictObject({ link: z.string().max(8192) })
export const passedLinkAnswer = z.looseObject({ taken: z.boolean() })
