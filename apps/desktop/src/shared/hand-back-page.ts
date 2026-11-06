/**
 * The page a `pnpm dev` copy's loopback answers the browser with once it hands back (PAR-614). Installed apps hand back
 * through `parity://`, where the browser shows its own prompt instead.
 */

/** The mark as plain SVG, for a page Parity serves without React: the small drawing, which reads at 48 pixels. */
const markSvg = `<svg width="48" height="48" viewBox="0 0 1024 1024" fill="none" aria-label="Parity"><defs><linearGradient id="tile" x1="96" y1="48" x2="928" y2="976" gradientUnits="userSpaceOnUse"><stop stop-color="#8A74FF"/><stop offset="0.5" stop-color="#5432E6"/><stop offset="1" stop-color="#2C129E"/></linearGradient></defs><rect width="1024" height="1024" rx="232" fill="url(#tile)"/><path d="M432 306L226 512L432 718M592 306L798 512L592 718" stroke="#fff" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/><path d="M512 448L576 512L512 576L448 512Z" fill="#fff" stroke="#fff" stroke-width="56" stroke-linejoin="round"/></svg>`

/** Whether trading the code worked. */
export type HandBack = "signed-in" | "problem"

export const handBackText: Record<HandBack, { title: string; heading: string; text: string }> = {
  "signed-in": {
    title: "Signed in to Parity",
    heading: "You're signed in to Parity",
    text: "You can close this tab and go back to Parity."
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
</style>
</head>
<body>
<main>${markSvg}<div><h1>${said.heading}</h1><p>${said.text}</p></div></main>
</body>
</html>`
}
