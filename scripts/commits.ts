// Checks commit messages, so none that would look out of place in a pull request gets pushed: the commit-msg hook checks
// each as it's written, and the pre-push hook the commits a push sends, which mustn't include fixups meant to be
// squashed away first.
// Usage:
//   node scripts/commits.ts message <file>  checks a commit message (the commit-msg hook)
//   node scripts/commits.ts push <remote>   checks the commits a push sends, from the refs git gives the pre-push hook
//   node scripts/commits.ts title <title>   checks a pull request's title, which squash merging makes a subject (CI)
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const types = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"]
const conventional = new RegExp(`^(${types.join("|")})(\\([\\w./, -]+\\))?!?: \\S`)
const longest = 100

/** The subject of a commit message as git hands it to the commit-msg hook: its first line that isn't a comment. */
export function subjectOf(message: string): string {
  return (
    message
      .split("\n")
      .map((line) => line.trimEnd())
      .find((line) => line !== "" && !line.startsWith("#")) ?? ""
  )
}

/**
 * What's wrong with a commit's subject, or undefined when nothing is. A fixup commit can be made but not pushed, and
 * the merge and revert commits git writes itself are left as they are.
 */
export function subjectProblem(subject: string, pushing: boolean): string | undefined {
  if (/^(fixup|squash|amend)! /.test(subject)) {
    return pushing ? "it's a fixup: squash it into its commit with `git rebase --autosquash` first" : undefined
  }
  if (subject.startsWith("Merge ") || subject.startsWith('Revert "')) return undefined
  if (/\bwip\b/i.test(subject)) return "it's work in progress: finish it, or squash it into the commit it belongs to"
  if (!conventional.test(subject)) {
    return `it needs a conventional type, such as \`fix(desktop): …\`, from ${types.join(", ")}`
  }
  if (subject.length > longest)
    return `it's ${subject.length} characters: keep it to ${longest}, with detail in the body`
  if (subject.endsWith(".")) return "it ends with a full stop"
  return undefined
}

const root = join(import.meta.dirname, "..")

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function lines(text: string): string[] {
  return text.split("\n").filter(Boolean)
}

/**
 * The commits a push sends that the remote doesn't have yet, from the lines git writes to the pre-push hook: a local
 * ref, its commit, a remote ref and its commit. The first push to a remote sends history from before these checks, so
 * it's left alone.
 */
function pushedCommits(remote: string, refs: string): { commit: string; subject: string }[] {
  if (git("for-each-ref", "--count=1", `refs/remotes/${remote}/`).trim() === "") return []
  const tips = lines(refs)
    .map((line) => line.split(" ")[1] ?? "")
    .filter((commit) => commit !== "" && !/^0+$/.test(commit))
  if (tips.length === 0) return []
  return lines(git("log", "--no-merges", "--format=%h %s", ...tips, "--not", `--remotes=${remote}`)).map((line) => ({
    commit: line.slice(0, line.indexOf(" ")),
    subject: line.slice(line.indexOf(" ") + 1)
  }))
}

function main(): void {
  const [command, argument] = process.argv.slice(2)

  if (command === "message" && argument) {
    const subject = subjectOf(readFileSync(argument, "utf8"))
    const problem = subjectProblem(subject, false)
    if (!problem) return
    console.error(`The commit's subject won't do, as ${problem}:\n  ${subject}`)
    process.exit(1)
  }

  if (command === "push" && argument) {
    const problems = pushedCommits(argument, readFileSync(0, "utf8")).flatMap(({ commit, subject }) => {
      const problem = subjectProblem(subject, true)
      return problem ? [`  ${commit} ${subject}\n    ${problem}`] : []
    })
    if (problems.length === 0) return
    console.error(`Commits this push sends need their messages fixed:\n${problems.join("\n")}`)
    console.error("Reword the last with `git commit --amend`, or earlier ones with a rebase, then push again.")
    process.exit(1)
  }

  if (command === "title" && argument) {
    const problem = subjectProblem(argument, true)
    if (!problem) return
    console.error(
      `The pull request's title becomes the commit's subject when it merges, and it won't do, as ${problem}.`
    )
    process.exit(1)
  }

  console.error("Usage: node scripts/commits.ts message <file> | push <remote> | title <title>")
  process.exit(1)
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main()
