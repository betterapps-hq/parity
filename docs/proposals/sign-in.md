# Proposal: signing in with WorkOS

Status: draft, 2026-11-05 (PAR-610). `@parity-app/account` is built (PAR-613), and so is the app's side (PAR-612),
except trying it in an installed build. The screens are the stories under Parity/Explorations/Sign in
([SignIn.stories.tsx](../../apps/desktop/src/renderer/explorations/SignIn.stories.tsx)), and the account menu is the
start page's ([page.tsx](../../apps/desktop/src/renderer/explorations/start/page.tsx), `AccountMenu`). The calls made
are in [decisions.md](../decisions.md#signing-in-goes-through-workos-in-the-browser-par-610), and the work is in Linear,
PAR-611 to PAR-616.

## In one line

People sign in with Google, GitHub, Microsoft or their company's single sign-on, in their browser, through WorkOS
AuthKit. The desktop app is a public client: it carries WorkOS's client ID and never its API key, so signing in needs no
server of Parity's own. What does need the API key, such as listing someone's organizations or creating one, waits for
the portal's service.

## Why WorkOS

You chose it on 2026-11-05 for its organizations. A WorkOS organization has members with roles, can sign in through its
own identity provider (Okta, Entra ID, Google Workspace) on a verified domain, and can add SCIM later. That's what the
portal's plans sell: single sign-on with Organization and SCIM with Enterprise (decisions.md, "The portal"). It's also
the tech stack's choice for B2B apps, and Better Apps already has a WorkOS identity adapter.

## How signing in works

1. **A button builds WorkOS's authorize URL** (`/user_management/authorize`) with Parity's client ID, a `state` and a
   PKCE challenge. Google, GitHub and Microsoft set `provider` to `GoogleOAuth`, `GitHubOAuth` or `MicrosoftOAuth`,
   which skips AuthKit's own page. The work email sets `provider=authkit` and `login_hint`, and AuthKit takes it from
   there: to the company's identity provider when its domain has single sign-on, or to a code by email when it doesn't.
2. **Parity opens the URL in the person's browser** and shows Waiting for browser. The person is often signed in to
   Google or their company there already, and Parity never sees a password.
3. **WorkOS sends the browser back to Parity** with a code and the `state`. Where it sends it is the next section.
4. **Main trades the code and the PKCE verifier for a session** at `/user_management/authenticate`, with the client ID
   and no secret. The answer is the user, an access token and a refresh token. The access token is a short-lived JWT
   that names the organization (`org_id`), the role and its permissions.
5. **Main refreshes the access token before it expires.** WorkOS can hand back a new refresh token each time, and only
   the newest one works. A refused refresh, because the organization's session limit ran out or an admin removed the
   person, shows Session ended. Open projects and unsaved changes stay as they are.

Someone in more than one organization picks one on AuthKit's page when sign-in goes through it, until Parity can list
their organizations itself (see [What needs a server](#what-needs-a-server)). What happens when a button skips that page
is in [Still to check](#still-to-check).

## Where the browser hands back to

Several copies of Parity can run at once: the person's app, a session's `pnpm dev`, `pnpm perf` (decisions.md, "Agents'
calls go to the copy that has their project open"). The copy that started a sign-in has to get its answer.

- **Installed apps use `parity://auth/callback`,** against WorkOS's production environment. The installer registers the
  scheme, so the system sends the link to the installed app. On macOS the running app gets it as `open-url`. On Windows
  and Linux the system starts a second Parity process with the link, since Parity holds no single-instance lock.
- **A copy that gets a link it didn't start passes it on.** It finds the other copies in the agent registry
  (`~/.parity/agents/`), asks each one's local service whether the link's `state` is its own, and gives the link to the
  one that says yes. A process started only for the link quits once it has passed it on. The code is no use without the
  PKCE verifier, which only the copy that started sign-in has.
- **`pnpm dev` copies use a loopback address,** `http://127.0.0.1:<port>/auth/callback` on a free port, against WorkOS's
  sandbox. WorkOS allows http, and a port wildcard on loopback addresses, only in a sandbox; production refuses http and
  localhost. A dev copy never needs the scheme, which the system only registers for an installed app.

## What's kept where

- **The refresh token is kept with Electron's `safeStorage`,** encrypted with the system keychain, in Parity's app data.
  It never goes in a project, a `.par` file or local storage, like the connections and secrets in
  [web-and-backend.md](web-and-backend.md). Where `safeStorage` would fall back to plain text (Linux without a keyring),
  Parity doesn't keep it, and the person signs in each time Parity starts.
- **The access token stays in main's memory.** The window gets the person (name, email and picture), their organization
  and their role over IPC, checked with zod, and never a token. Later, main sends the access token to Parity's service.
- **Signing out forgets both tokens.**

## Where the code goes

As [packages.md](packages.md) sets out, the logic takes data and returns data:

- **`@parity-app/account`, a new package** (PAR-613): the authorize URL, PKCE, reading the link the browser hands back,
  the requests for the code and for a refresh, zod schemas for WorkOS's answers and the token's claims, and when to
  refresh. `fetch` is passed in, so its tests run without Electron or the network. The CLI can use it later.
- **The app's main process** (PAR-612): opening the browser, the URL scheme and the loopback listener, passing links
  between copies, `safeStorage`, refreshing, and IPC.
- **The window** (PAR-612): the screens, built from the stories.

**No new library** (your call). WorkOS's endpoints are plain HTTPS and JSON, and zod is already in use. WorkOS has an
Electron package, `@workos/authkit-electron`, but it's at 0.1.2, needs `@workos-inc/node` ^10.4 where Better Apps uses
12, and brings `electron-store` and its own React provider.

## The screens

From the Sign in stories, which work as one prototype (PAR-614). The calls behind them are in
[decisions.md](../decisions.md#the-rest-of-signing-in-is-designed-par-614).

| Story                                               | Used                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Centered form                                       | The sign-in screen (your call), and the same in a dialog from the title bar              |
| Live canvas                                         | No. It's the same form beside a showcase                                                 |
| Email first, with its single sign-on and code steps | No. The browser does these steps, and typing the code into Parity needs WorkOS's API key |
| Waiting for browser                                 | After any button                                                                         |
| Browser never hands back                            | After 30 seconds of waiting                                                              |
| Sign in canceled                                    | When the browser hands back `access_denied`                                              |
| Sign in failed                                      | When the browser hands back another error, or trading the code fails                     |
| Account refused                                     | When WorkOS turns the account down                                                       |
| Single sign on required                             | When the account's organization requires its single sign-on                              |
| Session ended                                       | When a refresh is refused                                                                |
| Choose organization                                 | Once Parity's service can list organizations (PAR-616)                                   |
| Signed out                                          | Home after skipping the sign-in screen                                                   |
| After signing out                                   | Home after Sign out                                                                      |
| No organization                                     | Signed in, in no organization yet                                                        |
| Signed in until quit                                | Signed in where `safeStorage` has no keyring                                             |
| Browser after handing back, and after a problem     | The page a `pnpm dev` copy's loopback serves                                             |
| AuthKit pages                                       | WorkOS's branding settings, and AuthKit's pages in them (PAR-611)                        |

- **The account menu is the start page's:** the avatar at the end of the title bar, with the person's name, their
  organization and role, and Sign out. Someone in no organization sees their email instead. The built start page left it
  out until sign-in exists (decisions.md, "The start page is built"). Home's organization switcher shows the session's
  organization, or Personal alone.
- **Signing in is optional** (your call). The first launch shows the sign-in screen, and "Open a folder on this computer
  without signing in" opens the folder picker over Home and is remembered. Nothing that works on local folders asks
  anyone to sign in.
- **Signed out, the account spot is an outline of an avatar,** whose menu offers Sign in and keeps agents, settings and
  help. For you offers Sign in too, and Home lists every project on this computer with no organization switcher, so
  nothing looks signed in (your call while trying PAR-612). Sign in opens the sign-in screen in a dialog over Home.
- **Waiting for browser ends with a session or says what happened:** canceled, an error, an account WorkOS turned down,
  or an organization that requires single sign-on. Each says what to do next, and nothing open changes. It never stops
  waiting on its own.
- **Without a keyring,** a toast after signing in and a line in the account menu say Parity keeps you signed in only
  until it quits.

## What needs a server

WorkOS's API key can't ship in an app, so these wait for Parity's service, the portal's backend:

- listing someone's organizations and the invitations waiting for them, Join and Decline, and Create an organization
  (PAR-616);
- anything Parity keeps for a person or an organization, such as comments.

The service will run on Better Apps, whose WorkOS identity reads only AuthKit's `wos-session` cookie. The desktop app
has an access token instead, so the adapter needs to accept it as a bearer token, checked against WorkOS's keys
(PAR-615).

## Setting up WorkOS

By hand, in WorkOS's dashboard and each provider's console (PAR-611):

1. A sandbox and a production environment for Parity.
2. Google, GitHub and Microsoft turned on in each. The sandbox can use WorkOS's demo credentials. Production needs
   Parity's own Google OAuth client, GitHub OAuth app and Microsoft Entra app.
3. The redirects: `parity://auth/callback` in production, and `http://127.0.0.1:*/auth/callback` in the sandbox.
4. The roles: admin, billing admin, member and guest (decisions.md, "The portal").
5. Each environment's client ID, which goes in Parity's code. Client IDs are public. The API key stays in WorkOS's
   dashboard until the service needs it.

## Still to check

PAR-612 tries these and records what it finds in decisions.md:

- **Whether a public client can refresh, and switch organization:** it can, both with the client ID alone, tried in
  Staging on 2026-11-05 (decisions.md, "Signing in is built").
- **Whether WorkOS asks Parity to pick an organization** when a button skips AuthKit's page, and whether a public client
  can answer without the API key.
- **The URL scheme on each system's installed build,** which only a packaged build can show: unsigned macOS builds
  (PAR-399), and Linux's AppImage, which has no installer to register it.
