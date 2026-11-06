# Sentry

Where Parity's own telemetry goes, how Sentry is set up for it, and what was done by hand. The plan for what's sent is
[proposals/product-telemetry.md](proposals/product-telemetry.md), and the calls are in
[decisions.md](decisions.md#sentry-is-set-up-in-better-apps-by-hand-par-617).

## The organisation

- **Organisation:** [better-apps](https://better-apps.sentry.io/), in Sentry's US region, owned by
  `admin@betterapps.io`. Its only member is that account; people's own accounts aren't members.
- **Plan:** a 14-day Business trial, started on 2026-11-05, so a second member could be added during the handover. When
  it ends on 2026-11-19, the organisation drops to the free Developer plan unless it's upgraded.
- **Team:** `parity`, which owns every project below.

## Projects

Each surface has its own project, so its releases, quotas and alerts stay apart. DSNs are public by design: they only
let a client send events, so they live here, and in each surface's build config once it adds Sentry's SDK.

| Project            | What sends to it                                      | DSN                                                                                               |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `parity-desktop`   | The Electron app: main, windows, the service, workers | `https://1367d69a56a94bcd328db394a4a5a2d4@o4512381874274304.ingest.us.sentry.io/4512381906190336` |
| `parity-cli`       | The `parity` CLI and its MCP server                   | `https://65d0cf052034375c83fb8f442e40e7f8@o4512381874274304.ingest.us.sentry.io/4512381906255872` |
| `parity-web`       | Parity's web app                                      | `https://79f6a3f6a9ac82ce8e9afb77d1e7dfbd@o4512381874274304.ingest.us.sentry.io/4512381906386944` |
| `parity-dashboard` | The dashboard site                                    | `https://511064c456cb0b3c31754b26b440b523@o4512381874274304.ingest.us.sentry.io/4512381906452480` |
| `parity-api`       | Parity's API                                          | `https://56d4bb2b70a4a7321c489e7faf0c0111@o4512381874274304.ingest.us.sentry.io/4512381906518016` |

Only `parity-desktop` and `parity-cli` have code in this repository. The other three wait for their surfaces.

## Environments

Every event is tagged `development`, `ci` or `tester`. Sentry creates an environment the first time an event names it,
so there's nothing to set up ahead of the SDKs.

## Integrations

- **Linear** is installed for the Better Apps workspace, so alert rules can file issues in PAR and resolving one side
  resolves the other.
- **GitHub** is installed for `betterapps-hq`, limited to `parity`, for commits in releases, suspect commits and stack
  trace links.
- **Sentry's MCP server** is how agents read an issue's events, trace and replay. It signs in with OAuth, as
  `admin@betterapps.io`.

## Secrets

- **`SENTRY_AUTH_TOKEN`** on `betterapps-hq/parity` is the `parity-ci` organisation token, scoped to `org:ci`: uploading
  source maps and debug files, and creating releases. Builds don't need it to send events.

## Done by hand

None of this is in Terraform yet. The pipelines' Terraform templates only pass Cloudflare, GitHub and Neon credentials,
so a Sentry module needs them to take a Sentry token first. Until then, these were done in Sentry's UI:

1. Created the organisation, the `parity` team and the five projects, which made each project's default DSN.
2. Moved ownership to `admin@betterapps.io`: it asked to join, was approved as Owner, and the personal account left.
3. Started the Business trial, which raised the one-member limit for the handover.
4. Installed the Linear integration from Settings > Integrations > Linear, approved in Linear.
5. Installed the GitHub integration from Settings > Integrations > GitHub, approved in GitHub for `betterapps-hq`.
6. Created the `parity-ci` organisation token and stored it with `gh secret set SENTRY_AUTH_TOKEN`.
