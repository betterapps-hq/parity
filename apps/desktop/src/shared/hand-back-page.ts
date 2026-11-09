/**
 * The page a `pnpm dev` copy's loopback answers the browser with once it hands back (PAR-614). Installed apps hand back
 * through `parity://`, where the browser shows its own prompt instead.
 */

/** The mark as plain SVG, for a page Parity serves without React: the small drawing, which reads at 48 pixels. */
const markSvg = `<svg width="48" height="48" viewBox="0 0 1024 1024" fill="none" aria-label="Parity"><defs><linearGradient id="tile" x1="96" y1="48" x2="928" y2="976" gradientUnits="userSpaceOnUse"><stop stop-color="#8A74FF"/><stop offset="0.5" stop-color="#5432E6"/><stop offset="1" stop-color="#2C129E"/></linearGradient></defs><rect width="1024" height="1024" rx="232" fill="url(#tile)"/><path d="M432 306L226 512L432 718M592 306L798 512L592 718" stroke="#fff" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/><path d="M512 448L576 512L512 576L448 512Z" fill="#fff" stroke="#fff" stroke-width="56" stroke-linejoin="round"/></svg>`

/** Whether trading the code worked, or Parity needs one more step, such as choosing an organization. */
export type HandBack = "signed-in" | "continue" | "problem"

/**
 * A badge on the mark's corner that says at a glance how it went (your call): a check on green, an arrow on Parity's
 * purple for one more step, or a warning on amber as the app's own problem screens show it. The icons are Lucide's
 * check, arrow-right and triangle-alert.
 */
const badges: Record<HandBack, { color: string; icon: string }> = {
  "signed-in": { color: "#16a34a", icon: '<path d="M20 6 9 17l-5-5"/>' },
  continue: { color: "#5432e6", icon: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' },
  problem: {
    color: "#d97706",
    icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
  }
}

function badge(outcome: HandBack): string {
  const { color, icon } = badges[outcome]

  return `<span class="badge" style="background:${color}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span>`
}

export const handBackText: Record<HandBack, { title: string; heading: string; text: string }> = {
  "signed-in": {
    title: "Signed in to Parity",
    heading: "You're signed in to Parity",
    text: "You can close this tab and go back to Parity."
  },
  continue: {
    title: "Continue in Parity",
    heading: "Continue in Parity",
    text: "There's one more step to finish signing in. You can close this tab."
  },
  problem: {
    title: "Parity couldn't sign you in",
    heading: "Parity couldn't sign you in",
    text: "Go back to Parity to see why and try again. You can close this tab."
  }
}

/**
 * The whole HTML document: no scripts, nothing loaded, light or dark as the system is. It answers once the code is
 * traded, so it can say whether that worked. `theme` pins a scheme, for the story that shows it.
 */
export function handBackHtml(outcome: HandBack, theme?: "light" | "dark"): string {
  const said = handBackText[outcome]
  const light = "--bg:#ffffff;--fg:#0a0a0a;--muted:#737373;--glow:rgb(84 50 230 / 0.12)"
  const dark = "--bg:#0a0a0a;--fg:#fafafa;--muted:#a1a1a1;--glow:rgb(138 116 255 / 0.16)"

  return `<!doctype html>
<html lang="en"${theme ? ` data-theme="${theme}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${said.title}</title>
<style>
:root{color-scheme:light dark;${light}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}
:root[data-theme=dark]{color-scheme:dark;${dark}}
:root[data-theme=light]{color-scheme:light}
html,body{height:100%;margin:0}
body{display:grid;place-items:center;background:radial-gradient(60% 50% at 50% 0%,var(--glow),transparent 70%) var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px;max-width:360px}
h1{margin:0 0 6px;font-size:22px;font-weight:600;letter-spacing:-0.01em}
p{margin:0;color:var(--muted)}
.mark{position:relative;width:48px;height:48px}
.mark>svg{display:block}
.badge{position:absolute;right:-10px;bottom:-10px;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;box-shadow:0 0 0 3px var(--bg)}
</style>
</head>
<body>
<main><div class="mark">${markSvg}${badge(outcome)}</div><div><h1>${said.heading}</h1><p>${said.text}</p></div></main>
</body>
</html>`
}
