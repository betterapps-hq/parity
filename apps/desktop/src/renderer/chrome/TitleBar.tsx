import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn"
import { ChevronDown } from "lucide-react"
import { type ReactNode, useState } from "react"
import { AccountMenu } from "../account/AccountMenu.tsx"
import { useSaveStatus } from "../project-doc.ts"
import { folderName } from "../start/projects.ts"
import { type Project, useProject, useRecentProjects, workspace } from "../workspace.ts"
import { actions } from "./actions.ts"
import { AppMenu } from "./AppMenu.tsx"
import { iconFor } from "./command-icons.ts"
import { Hint } from "./Hint.tsx"
import { shortcutOf } from "./keymap.ts"
import { isMac } from "./keys.ts"
import { Name } from "./Name.tsx"

const mac = isMac()

/**
 * The window's title bar: the app's menus, the open project's name in the middle, which opens the project's menu, then
 * your account. The system's window buttons sit after it. There are no tabs: the window holds one project, and Home
 * shows under it when none is open. `account` replaces the account menu, as an exploration does.
 */
export function TitleBar({ account = <AccountMenu /> }: { account?: ReactNode }) {
  const project = useProject()

  return (
    <header className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] border-b bg-neutral-100 [-webkit-app-region:drag] dark:bg-[#0a0a0a]">
      <div className={`flex min-w-0 items-end ${mac ? "pl-20" : "pl-2"}`}>
        <AppMenu />
      </div>
      <div className="flex min-w-0 items-center">{project && <ProjectMenu project={project} />}</div>
      <div className="flex min-w-0 items-end justify-end pr-[150px]">{account}</div>
    </header>
  )
}

/**
 * The project's name, which opens what can be done with it: open another in its place, one opened before, or close
 * it, which leaves the window on Home. A dot after the name says it has unsaved changes. Its hint names its folder.
 */
function ProjectMenu({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)
  // A save that failed leaves the changes unsaved too.
  const status = useSaveStatus(project.session)
  const unsaved = status === "unsaved" || status === "failed"
  const root = project.session?.info.root ?? project.id
  const recent = useRecentProjects().filter((candidate) => candidate !== root)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Hint
        label={project.session?.info.root ?? project.message ?? project.title}
        detail={unsaved ? "Unsaved changes" : undefined}
        side="bottom"
        wait
        hidden={open}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={unsaved ? `${project.title}, unsaved changes` : undefined}
              className="h-7 max-w-80 gap-1.5 px-2.5 font-medium [-webkit-app-region:no-drag] aria-expanded:bg-accent"
            />
          }
        >
          <Name className="min-w-0">{project.title}</Name>
          {unsaved && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/80" />}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="center" className="w-72">
        <DropdownMenuItem onClick={() => void actions.openFolder.run("menu")}>
          {iconFor("openFolder")} Open project folder…
          <DropdownMenuShortcut>{shortcutOf("openFolder")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        {recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Recent</DropdownMenuLabel>
              {recent.map((candidate) => (
                <DropdownMenuItem
                  key={candidate}
                  onClick={() => void workspace.open(candidate)}
                  className="flex-col items-start gap-0"
                >
                  <span>{folderName(candidate)}</span>
                  <span className="text-xs wrap-anywhere text-muted-foreground">{candidate}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void actions.closeTab.run("menu")}>
          {iconFor("closeTab")} Close project
          <DropdownMenuShortcut>{shortcutOf("closeTab")}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
