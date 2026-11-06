import type { PictureFrame, ProjectPicture } from "../../shared/protocol.ts"
import dashboardDesktop from "./example-pictures/dashboard-desktop.webp?inline"
import dashboardMobile from "./example-pictures/dashboard-mobile.webp?inline"
import teamMembersDesktop from "./example-pictures/team-members-desktop.webp?inline"
import teamMembersMobile from "./example-pictures/team-members-mobile.webp?inline"

const desktop = (src: string, width = 1280): PictureFrame => ({ src, mode: "Desktop Light", width, height: 800 })
const mobile = (src: string): PictureFrame => ({ src, mode: "Mobile Light", width: 390, height: 844 })

/**
 * The example's first screens, shipped with Parity so the start page can show them before the example has opened and
 * its own picture is kept (PAR-188).
 */
export const examplePicture: ProjectPicture = {
  taken: 0,
  screens: [
    { name: "Dashboard", main: desktop(dashboardDesktop), phone: mobile(dashboardMobile) },
    { name: "Team members", main: desktop(teamMembersDesktop, 1243), phone: mobile(teamMembersMobile) }
  ]
}
