import type { AccountPerson, Organization } from "../../shared/account.ts"

/** Personal's green, apart from every organization's hue. */
const personalHue = 162

/** An organization's first letter in a color of its own, from its ID; Personal in green. */
export function OrganizationBadge({ organization, size = 36 }: { organization?: Organization; size?: number }) {
  let hue = personalHue
  if (organization) {
    hue = 0
    for (const char of organization.id) hue = (hue * 31 + char.charCodeAt(0)) % 360
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.4),
        background: `oklch(0.55 0.14 ${hue})`
      }}
    >
      {(organization?.name ?? "Personal").charAt(0).toUpperCase()}
    </span>
  )
}

/** What Parity calls an organization it knows only by ID, until its service can look it up (PAR-616). */
const unnamed = "Your organization"

/**
 * The organization the session is in, by WorkOS's name when Parity knows it, or none when the person is in no
 * organization yet, which Parity calls Personal.
 */
export function currentOrganization(account: AccountPerson): Organization | undefined {
  const { organizationId, organizations = [] } = account
  if (!organizationId) return undefined
  return organizations.find(({ id }) => id === organizationId) ?? { id: organizationId, name: unnamed }
}

/** The organizations to switch between: the ones Parity knows, with the session's first if it has no name for it. */
export function knownOrganizations(account: AccountPerson): Organization[] {
  const organizations = account.organizations ?? []
  const current = currentOrganization(account)
  return current && !organizations.some(({ id }) => id === current.id) ? [current, ...organizations] : organizations
}
