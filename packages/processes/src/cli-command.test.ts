import { describe, expect, it } from "vite-plus/test"
import { cliFolder, cliLaunchers, cliMarker, pathHasFolder, pathWithFolder } from "./cli-command.ts"

describe("cliFolder", () => {
  it("is Parity's own folder in local app data on Windows", () => {
    expect(
      cliFolder({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\ana\\AppData\\Local" }, home: "C:\\Users\\ana" })
    ).toBe("C:\\Users\\ana\\AppData\\Local\\Parity\\bin")
    expect(cliFolder({ platform: "win32", env: {}, home: "C:\\Users\\ana\\" })).toBe(
      "C:\\Users\\ana\\AppData\\Local\\Parity\\bin"
    )
  })

  it("is a folder already on PATH on macOS and Linux", () => {
    expect(cliFolder({ platform: "darwin", env: {}, home: "/Users/ana" })).toBe("/usr/local/bin")
    expect(cliFolder({ platform: "linux", env: {}, home: "/home/ana" })).toBe("/home/ana/.local/bin")
  })
})

describe("cliLaunchers", () => {
  const windows = {
    platform: "win32",
    executable: "C:\\Programs\\Parity 100%\\Parity.exe",
    entry: "C:\\Programs\\Parity 100%\\resources\\app.asar.unpacked\\cli\\dist\\bin.mjs"
  } as const

  it("runs the app as Node on the CLI from Command Prompt, PowerShell and Git Bash on Windows", () => {
    const [cmd, shell] = cliLaunchers(windows)

    expect(cmd).toEqual({
      name: "parity.cmd",
      text: [
        "@echo off",
        `rem ${cliMarker}`,
        "setlocal",
        'set "ELECTRON_RUN_AS_NODE=1"',
        '"C:\\Programs\\Parity 100%%\\Parity.exe" "C:\\Programs\\Parity 100%%\\resources\\app.asar.unpacked\\cli\\dist\\bin.mjs" %*',
        ""
      ].join("\r\n")
    })
    expect(shell).toEqual({
      name: "parity",
      text: [
        "#!/bin/sh",
        `# ${cliMarker}`,
        "ELECTRON_RUN_AS_NODE=1 exec 'C:/Programs/Parity 100%/Parity.exe' 'C:/Programs/Parity 100%/resources/app.asar.unpacked/cli/dist/bin.mjs' \"$@\"",
        ""
      ].join("\n")
    })
  })

  it("quotes a path with a single quote for the shell", () => {
    const [launcher] = cliLaunchers({
      platform: "darwin",
      executable: "/Applications/Ana's Parity.app/Contents/MacOS/Parity",
      entry: "/Applications/Ana's Parity.app/Contents/Resources/app.asar.unpacked/cli/dist/bin.mjs"
    })

    expect(launcher.name).toBe("parity")
    expect(launcher.text).toContain(
      "exec '/Applications/Ana'\\''s Parity.app/Contents/MacOS/Parity' '/Applications/Ana'\\''s Parity.app/Contents/Resources/app.asar.unpacked/cli/dist/bin.mjs' \"$@\""
    )
  })

  it("finds the CLI beside the mounted executable for an AppImage, with parity standing in for the script", () => {
    const [launcher] = cliLaunchers({ platform: "linux", executable: "/home/ana/Parity.AppImage", entry: undefined })

    expect(launcher.text).toContain("exec '/home/ana/Parity.AppImage' -e '")
    expect(launcher.text).toContain("resources/app.asar.unpacked/cli/dist/bin.mjs")
    expect(launcher.text).toMatch(/' parity "\$@"\n$/)
  })
})

describe("pathWithFolder", () => {
  const folder = "C:\\Users\\ana\\AppData\\Local\\Parity\\bin"

  it("adds the folder at the end, keeping variables as written", () => {
    expect(pathWithFolder("%USERPROFILE%\\bin;C:\\tools", folder, "win32")).toBe(
      `%USERPROFILE%\\bin;C:\\tools;${folder}`
    )
    expect(pathWithFolder("C:\\tools;", folder, "win32")).toBe(`C:\\tools;${folder}`)
    expect(pathWithFolder("", folder, "win32")).toBe(folder)
  })

  it("leaves a PATH that has it alone, in any case or with a trailing slash on Windows", () => {
    expect(pathWithFolder(`C:\\tools;${folder.toUpperCase()}\\`, folder, "win32")).toBeUndefined()
    expect(pathHasFolder("/usr/bin:/home/ana/.local/bin/", "/home/ana/.local/bin", "linux")).toBe(true)
  })

  it("tells folders apart by case outside Windows", () => {
    expect(pathHasFolder("/home/ana/.Local/bin", "/home/ana/.local/bin", "linux")).toBe(false)
  })
})
