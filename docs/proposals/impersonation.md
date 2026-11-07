# Proposal: signing in as someone else's account for support

Status: draft, 2026-11-06 (PAR-693). The screens are the stories under Parity/Explorations/Impersonation
([Impersonation.stories.tsx](../../apps/desktop/src/renderer/explorations/Impersonation.stories.tsx)). It builds on
[sign-in.md](sign-in.md), and the work is PAR-695 to PAR-697.

## In one line

Someone at Better Apps starts a session as a customer's account from WorkOS's dashboard, with a reason. Parity asks
before it switches, shows a band under the tabs for as long as the session lasts, and signs out when it ends.

## Who may impersonate

Only people on Better Apps' WorkOS team (your call). WorkOS starts impersonation only from its dashboard, under a user's
Danger Zone, and has no API for it. So who may impersonate is who has a seat in Parity's WorkOS environments, and the
environment's admin turns the feature on. Organization admins impersonating their own members would need Parity's
service to mint sessions itself, which WorkOS can't, so it isn't planned.

## How it starts

1. **In WorkOS's dashboard,** the support person opens the user, chooses Impersonate User, picks the organization if the
   user is in more than one, and types a reason. WorkOS requires the reason.
2. **WorkOS sends the browser to Parity's Initiate login URI,** set in the dashboard under the application's Redirects.
   It points at Parity's sign-in, not the callback, so Parity starts an ordinary sign-in with its own `state` and PKCE
   verifier. A code sent straight to the callback would be refused, since no copy of Parity started it.
3. **AuthKit hands back a code for the impersonated user,** and main trades it as it trades any code. The answer has an
   `impersonator` with the support person's `email` and `reason`, and the access token carries an `act` claim with the
   same email.
4. **Parity asks before switching** (the Starting story): whose account, who started it and why, and that the person's
   own account is signed out until it ends. Cancel keeps their own session. Nothing changes until they choose Sign in
   as.

The Initiate login URI is the one thing to check first: WorkOS documents it for web apps, and Parity has no https
sign-in route. It's `parity://auth/start` for installed apps if WorkOS takes a custom scheme, and otherwise a page of
Parity's website that opens that link (PAR-695).

## What the person sees

- **A band under the tabs, on every tab,** in amber: "You're signed in as Andrew Craswell (andrew@kestrel.dev) for
  support", and a small End session button. It can't be closed or hidden. It can't go above the menus: that row is the
  window's title bar, and the system draws its window buttons over it.
- **No countdown** (your call). WorkOS documents that impersonation sessions expire after 60 minutes, but neither its
  answer nor the token says when, so Parity ends the session itself 60 minutes after it started.
- **An amber ring around the window,** so a screenshot that crops the band still shows it.
- **The account menu and everything else are the user's,** as they'd see them.

## What's blocked

Nothing (your call). The point is to reproduce what the user sees and does, so everything works as it does for them,
including what changes their organization's data once the service exists. Every change is attributed to the support
person as well as the user (see [Audit](#audit)).

## How it ends

- **End session** in the band, or Sign out in the account menu.
- **WorkOS's 60 minutes run out.** Its refresh is refused, and Parity treats that as the end rather than Session ended.
- **Parity quits.** The impersonated refresh token stays in main's memory and never goes to `safeStorage`, so the next
  launch is signed out.

Each ends signed out, with a toast that says so. The support person signs back in to their own account as usual. Parity
doesn't keep their own session aside to restore it, since a session kept beside someone else's is one more token to
leak.

## Audit

- **WorkOS records each one:** a `session.created` event with the `impersonator`'s email and reason, shown on the user's
  page in the dashboard and readable from the events API.
- **Telemetry tags every event** in the session with `impersonated: true` and the support person's email, so a trace or
  replay from it isn't read as the user's own.
- **Parity's service records the impersonator** with every change it keeps, once it exists (PAR-615), reading `act` from
  the token it already checks.
- **The user isn't told** (your call). It shows nowhere in their account or their organization's activity.

## Where the code goes

- **`@parity-app/account`** (PAR-696): read `impersonator` from the authenticate answer and `act` from the token, and
  report a refusal of an impersonated session's refresh as its end.
- **The app** (PAR-697): the confirmation, the band and ring, keeping the token in memory only, ending it, and the
  telemetry tags.
- **WorkOS, by hand** (PAR-695): turn impersonation on in the sandbox and production, and set the Initiate login URI.

## Still to check

- Whether WorkOS takes `parity://` as an Initiate login URI (PAR-695).
- The exact shape of the `act` claim, from a real impersonated token (PAR-696).
- Whether a refresh can outlast the 60 minutes. Parity ends the session at 60 minutes from its start either way.
