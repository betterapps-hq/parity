// Electron under Parity's name and icon, for `pnpm dev`. Each system names and draws an app from its program rather than
// its windows: Task Manager and the taskbar on Windows, the Dock, menu bar and Activity Monitor on macOS, and the process
// list on Linux. So the app runs from a copy of Electron that carries Parity's name and icon, made once for each
// Electron version and icon under `apps/desktop/node_modules/.cache`. Packaging the app does the same for good.
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { dirname, join, resolve } from "node:path"

const appDir = resolve(import.meta.dirname, "..")
const cacheDir = join(appDir, "node_modules/.cache")

/**
 * The program to run the app with: a copy of Electron named Parity, with Parity's icon. Electron as installed if the
 * copy can't be made, with a warning, since the app still runs.
 */
export function parityElectron(electron: string): string {
  const make = { win32: windows, darwin: mac, linux }[process.platform as string]
  if (!make) return electron
  try {
    return make(electron)
  } catch (error) {
    console.warn(`[dev] running as Electron, since Parity's copy of it couldn't be made: ${String(error)}`)
    return electron
  }
}

/**
 * Makes a copy in a folder named for Electron's version and the icon, unless it's there, and returns its program.
 * It's made beside where it goes and moved there whole, since another copy of the app may be starting at the same time.
 * Copies for other versions or icons are removed, unless they're running.
 */
function cached(version: string, icon: string, program: string, fill: (folder: string) => void): string {
  const hash = createHash("sha256")
    .update(readFileSync(join(appDir, "resources", icon)))
    .digest("hex")
    .slice(0, 8)
  const name = `parity-electron-${version}-${hash}`
  const target = join(cacheDir, name)
  if (existsSync(join(target, program))) return join(target, program)
  const making = `${target}-${process.pid}`
  try {
    mkdirSync(making, { recursive: true })
    fill(making)
    renameSync(making, target)
  } catch (error) {
    if (!existsSync(join(target, program))) throw error
  } finally {
    rmSync(making, { recursive: true, force: true })
  }
  for (const old of readdirSync(cacheDir)) {
    if (!old.startsWith("parity-electron-") || old === name) continue
    try {
      rmSync(join(cacheDir, old), { recursive: true })
    } catch {
      // In use by a copy of the app that's still running.
    }
  }
  return join(target, program)
}

/**
 * Windows reads an app's name from its executable's version information and its icon from the executable's icon
 * resources, so the copy is Parity.exe with both changed. Its other files are links to Electron's.
 */
function windows(electron: string): string {
  const dist = dirname(electron)
  const version = readFileSync(join(dist, "version"), "utf8").trim()
  return cached(version, "icon.ico", "Parity.exe", (folder) => {
    linkAll(dist, folder, new Set(["electron.exe", "debug.log"]))
    const binary = readFileSync(electron)
    if (!nameParity(binary)) throw new Error("its version information has no name to change")
    const exe = join(folder, "Parity.exe")
    writeFileSync(exe, binary)
    const replaced = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(replaceIcon, "utf16le").toString("base64")],
      {
        env: { ...process.env, PARITY_ICON_EXE: exe, PARITY_ICON_FILE: join(appDir, "resources/icon.ico") },
        encoding: "utf8",
        windowsHide: true
      }
    )
    if (replaced.status !== 0) throw new Error(`its icon couldn't be replaced: ${replaced.stderr.trim()}`)
  })
}

/**
 * macOS reads an app's name and icon from its bundle, so the copy is Parity.app: Electron's bundle with its program
 * renamed, its Info.plist naming Parity and its icon file drawn from Parity's. Electron finds its helpers by its own
 * name first, so they keep theirs. The bundle is cloned, which costs no space on APFS, and signed again, ad hoc, since
 * the changes void Electron's signature.
 */
function mac(electron: string): string {
  const bundle = resolve(electron, "../../..")
  const version = readFileSync(join(dirname(bundle), "version"), "utf8").trim()
  return cached(version, "dock.png", "Parity.app/Contents/MacOS/Parity", (folder) => {
    const app = join(folder, "Parity.app")
    cpSync(bundle, app, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE })
    renameSync(join(app, "Contents/MacOS/Electron"), join(app, "Contents/MacOS/Parity"))
    const plist = join(app, "Contents/Info.plist")
    for (const key of ["CFBundleExecutable", "CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", "Parity", plist])
    }
    const iconFile = execFileSync("plutil", ["-extract", "CFBundleIconFile", "raw", plist], { encoding: "utf8" }).trim()
    const icns = join(app, "Contents/Resources", iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`)
    execFileSync("sips", ["-s", "format", "icns", join(appDir, "resources/dock.png"), "--out", icns], {
      stdio: "ignore"
    })
    execFileSync("codesign", ["--force", "--sign", "-", app], { stdio: "ignore" })
  })
}

/**
 * Linux names a process by its program's file, so the copy is Electron's folder with the program linked as `parity`.
 * The window's icon is set by the app itself. Linking keeps the sandbox helper owned by root and setuid, as a copy
 * wouldn't, so a helper that can't be linked is left out and Chromium sandboxes another way.
 */
function linux(electron: string): string {
  const dist = dirname(electron)
  const version = readFileSync(join(dist, "version"), "utf8").trim()
  return cached(version, "icon.png", "parity", (folder) => {
    linkAll(dist, folder, new Set(["debug.log"]), new Set(["chrome-sandbox"]))
    linkSync(electron, join(folder, "parity"))
  })
}

/**
 * Links each of a folder's files into another, but those `skipped`, copying any that can't be linked unless they're
 * `linkedOnly`.
 */
function linkAll(from: string, to: string, skipped: Set<string>, linkedOnly = new Set<string>()): void {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue
    const source = join(from, entry.name)
    const copy = join(to, entry.name)
    if (entry.isDirectory()) {
      linkAll(source, copy, skipped, linkedOnly)
      continue
    }
    try {
      linkSync(source, copy)
    } catch (error) {
      if (!linkedOnly.has(entry.name)) copyFileSync(source, copy)
      else console.warn(`[dev] ${entry.name} couldn't be linked, so it's left out: ${String(error)}`)
    }
  }
}

/**
 * Changes Electron's name to Parity in an executable's version information, where the description and product name
 * say Electron, in place: Parity is shorter, so the rest is padded with zeros and every length stays as it was.
 */
function nameParity(binary: Buffer): boolean {
  const key = Buffer.from("VS_VERSION_INFO", "utf16le")
  let start = -1
  // The resource begins with its length, which the key's other appearances, in code, don't have.
  for (let at = binary.indexOf(key); at !== -1 && start === -1; at = binary.indexOf(key, at + 1)) {
    const length = binary.readUInt16LE(at - 6)
    if (length > 64 && length < 8192) start = at - 6
  }
  if (start === -1) return false
  const end = start + binary.readUInt16LE(start)
  const electron = Buffer.from("Electron", "utf16le")
  const parity = Buffer.concat([Buffer.from("Parity", "utf16le"), Buffer.alloc(electron.length - 12)])
  let named = false
  for (let at = binary.indexOf(electron, start); at !== -1 && at < end; at = binary.indexOf(electron, at + 1)) {
    parity.copy(binary, at)
    named = true
  }
  return named
}

/**
 * Replaces an executable's icons with an icon file's, through Windows' resource calls: every icon and icon group it
 * has is removed, then the file's images go in as icons and its directory as the one group, in the language the old
 * group had.
 */
const replaceIcon = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
public static class Icons {
  delegate bool EnumNames(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
  delegate bool EnumLanguages(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr param);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  [DllImport("kernel32.dll")] static extern bool EnumResourceNames(IntPtr module, IntPtr type, EnumNames callback, IntPtr param);
  [DllImport("kernel32.dll")] static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, EnumLanguages callback, IntPtr param);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr BeginUpdateResource(string path, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateResource(IntPtr update, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool EndUpdateResource(IntPtr update, bool discard);
  const int Icon = 3, Group = 14;

  public static void Replace(string exe, string file) {
    var old = new List<int[]>();
    ushort language = 1033;
    IntPtr module = LoadLibraryEx(exe, IntPtr.Zero, 0x2);
    if (module == IntPtr.Zero) throw new Exception("couldn't read " + exe);
    foreach (int type in new[] { Group, Icon }) {
      EnumResourceNames(module, (IntPtr)type, (m, t, name, p) => {
        if (((long)name >> 16) != 0) return true;
        EnumResourceLanguages(m, t, name, (m2, t2, n2, lang, p2) => {
          old.Add(new[] { type, (int)name, lang });
          if (type == Group) language = lang;
          return true;
        }, IntPtr.Zero);
        return true;
      }, IntPtr.Zero);
    }
    FreeLibrary(module);

    byte[] ico = File.ReadAllBytes(file);
    int count = BitConverter.ToUInt16(ico, 4);
    var group = new byte[6 + count * 14];
    Array.Copy(ico, 0, group, 0, 6);
    IntPtr update = BeginUpdateResource(exe, false);
    if (update == IntPtr.Zero) throw new Exception("couldn't open " + exe + " to change");
    foreach (int[] resource in old) UpdateResource(update, (IntPtr)resource[0], (IntPtr)resource[1], (ushort)resource[2], null, 0);
    for (int index = 0; index < count; index++) {
      int entry = 6 + index * 16;
      int size = BitConverter.ToInt32(ico, entry + 8);
      int offset = BitConverter.ToInt32(ico, entry + 12);
      var image = new byte[size];
      Array.Copy(ico, offset, image, 0, size);
      if (!UpdateResource(update, (IntPtr)Icon, (IntPtr)(index + 1), language, image, (uint)size)) throw new Exception("couldn't add an icon");
      Array.Copy(ico, entry, group, 6 + index * 14, 12);
      BitConverter.GetBytes((ushort)(index + 1)).CopyTo(group, 6 + index * 14 + 12);
    }
    if (!UpdateResource(update, (IntPtr)Group, (IntPtr)1, language, group, (uint)group.Length)) throw new Exception("couldn't add the icon group");
    if (!EndUpdateResource(update, false)) throw new Exception("couldn't save " + exe + ": " + Marshal.GetLastWin32Error());
  }
}
'@
[Icons]::Replace($env:PARITY_ICON_EXE, $env:PARITY_ICON_FILE)
`
