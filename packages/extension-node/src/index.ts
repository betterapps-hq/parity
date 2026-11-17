/*
 * Helpers for an extension's Node code (PAR-1130), beside `@parity-app/extension`, which stays pure so its types and
 * manifest check run anywhere. An extension runs in a Node host of its own, so it can use these to run the project's
 * own copy of its tool.
 */

/**
 * The project's own installed packages, found as Parity finds them: through pnpm's links and Yarn Plug'n'Play too, from
 * the project's root or from a package that depends on the one wanted; and the file to load from one.
 */
export {
  type EntryUse,
  findPackage,
  type InstalledPackage,
  packageEntry,
  type PackageFolder
} from "@parity-app/project/packages"
