import type { Meta, StoryObj } from "@storybook/react-vite"
import { type HandBack, handBackHtml, handBackText } from "../../shared/hand-back-page.ts"
import { useResolvedTheme } from "../theme.ts"

/** The page a `pnpm dev` copy shows in the browser once sign-in hands back (PAR-614). Installed apps hand back through `parity://`, and the browser shows its own prompt. */
const meta = {
  title: "Parity/Sign in/Browser page",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The browser tab once it hands back to a `pnpm dev` copy: the page its loopback serves, in the app's theme. */
function HandBackPage({ outcome }: { outcome: HandBack }) {
  const theme = useResolvedTheme()

  return (
    <iframe
      title={handBackText[outcome].title}
      className="block h-screen min-h-[560px] w-full border-0"
      srcDoc={handBackHtml(outcome, theme)}
    />
  )
}

/**
 * The browser after it has handed back to a `pnpm dev` copy, once the code is traded: plain HTML with no scripts, in
 * the system's light or dark. Installed apps hand back through `parity://`, and the browser shows its own prompt.
 */
export const SignedIn: Story = { render: () => <HandBackPage outcome="signed-in" /> }

/** The same page when the code couldn't be traded: Parity's window says why, so the page only points there. */
export const Problem: Story = { render: () => <HandBackPage outcome="problem" /> }

/** Handed back with only an organization left to pick in Parity, which finishes there (PAR-1143). */
export const PickAnOrganization: Story = { render: () => <HandBackPage outcome="choose-organization" /> }

/** Handed back with one more step in Parity, such as single sign-on. */
export const OneMoreStep: Story = { render: () => <HandBackPage outcome="continue" /> }
