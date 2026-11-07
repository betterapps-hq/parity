import { describe, expect, it } from "vite-plus/test"
import { createScrubber, envSecrets, isSecretName, redacted } from "./index.ts"

const scrubber = createScrubber()

/** A made-up key, joined here so secret scanners don't take the test's source for a leaked one. */
function key(prefix: string, rest: string): string {
  return prefix + rest
}

// Realistic shapes, made up for these tests. None of them is a live key.
const keys = {
  openai: key("sk-", "proj-4fJ8kQ2mZx9LwR7tVb3NcY6hPd1sGe5uA0iKoTqWj"),
  anthropic: key("sk-", "ant-api03-Xb7Rk2LmQ9vNw4TzPc8YhJd6Sg1Fe3UaKo5Ir0EtWy-AbCdEf"),
  stripe: key("sk_", "live_51HqT9xKZb2Vn8Rm4Lp7Yc3Wd"),
  github: key("ghp_", "R7tVb3NcY6hPd1sGe5uA0iKoTqWj4fJ8kQ2m"),
  githubOAuth: key("gho_", "9vNw4TzPc8YhJd6Sg1Fe3UaKo5Ir0EtWyXb7R"),
  githubFineGrained: key("github_pat_", "11ABCDE2F0aBcDeFgHiJkL_mNoPqRsTuVwXyZ0123456789abcdefGHIJKLmnop"),
  slack: key("xoxb-", "2048-1234567890-AbCdEfGhIjKlMnOpQrStUvWx"),
  awsAccessKey: key("AKIA", "IOSFODNN7EXAMPLE"),
  jwt: key(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.",
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  ),
  npm: key("npm_", "Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9St1Uv3Wx5Y")
}

describe("text", () => {
  it.each(Object.entries(keys))("replaces a %s key wherever it appears", (_, key) => {
    expect(scrubber.text(`Request failed with ${key} after 3 tries`)).toBe(
      `Request failed with ${redacted} after 3 tries`
    )
  })

  it("keeps the word Bearer and replaces the token after it", () => {
    expect(scrubber.text("authorization header was Bearer abc123.def456-ghi789")).toBe(
      `authorization header was Bearer ${redacted}`
    )
  })

  it("replaces a URL's password and keeps its scheme, user, host and path", () => {
    expect(scrubber.text("connect ECONNREFUSED postgres://admin:hunter2-prod@db.internal:5432/app")).toBe(
      `connect ECONNREFUSED postgres://admin:${redacted}@db.internal:5432/app`
    )
  })

  it("replaces the values of secret names in env lines, query strings, JSON and messages", () => {
    expect(scrubber.text("DATABASE_PASSWORD=correct-horse STRIPE_KEY=pk_abc PORT=3000")).toBe(
      `DATABASE_PASSWORD=${redacted} STRIPE_KEY=${redacted} PORT=3000`
    )
    expect(scrubber.text("GET https://api.example.com/v1/me?access_token=abc123&page=2")).toBe(
      `GET https://api.example.com/v1/me?access_token=${redacted}&page=2`
    )
    expect(scrubber.text('{"user":"ada","password":"hunter2","clientSecret":"s3cr3t value"}')).toBe(
      `{"user":"ada","password":"${redacted}","clientSecret":"${redacted}"}`
    )
    expect(scrubber.text("login failed, password: hunter2")).toBe(`login failed, password: ${redacted}`)
  })

  it("replaces long random strings with no known shape", () => {
    expect(scrubber.text("webhook signing key 9Rk2LmQ9vNw4TzPc8YhJd6Sg1Fe3UaKo rejected")).toBe(
      `webhook signing key ${redacted} rejected`
    )
    expect(scrubber.text("aws secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")).toBe(`aws secret ${redacted}`)
  })

  it("replaces the values it's given, longest first, and ignores short ones", () => {
    const withEnv = createScrubber({ secrets: ["my-shop-secret", "my-shop-secret-2", "3000", "true"] })
    expect(withEnv.text("calling with my-shop-secret-2 then my-shop-secret on port 3000: true")).toBe(
      `calling with ${redacted} then ${redacted} on port 3000: true`
    )
  })

  it("replaces a private key block whole", () => {
    const block = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW",
      "QyNTUxOQAAACBkZXZlbG9wbWVudC1vbmx5LW5vdC1hLXJlYWwta2V5LWF0LWFsbAAAAJg=",
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n")
    expect(scrubber.text(`read ${block} from disk`)).toBe(`read ${redacted} from disk`)
  })

  describe("keeps as written", () => {
    it.each([
      ["a path with a content hash", "/Users/ada/acme/dist/assets/index-B3kd9fA2.js"],
      [
        "a file named by a SHA-256",
        ".parity/bitmaps/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.png"
      ],
      ["a file named by a base64url hash", "cache/Xk2LmQ9vNw4TzPc8YhJd6Sg1Fe3UaKo5Ir0EtWyAb7R.webp"],
      ["a commit SHA", "built from 3f2a9c1e7b4d8f6a0c5e2b9d1f7a3c8e6b0d4f2a"],
      ["a UUID", "install 550e8400-e29b-41d4-a716-446655440000"],
      ["a trace ID", "traceparent 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"],
      [
        "base64 image data in a short preview",
        "src: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
      ],
      ["an oklch colour", "--primary: oklch(0.623 0.214 259.815)"],
      ["a long custom property", "var(--color-sidebar-primary-foreground-hover)"],
      ["a shadow", "box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"],
      [
        "a Tailwind class list",
        "inline-flex items-center gap-2 rounded-md text-sm shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]"
      ],
      ["a design token", "token: --color-primary-foreground"],
      ["a component and its props", "Button variant=outline size=sm in src/components/ui/navigation-menu/Trigger2.tsx"],
      ["a long camel-case identifier", "useHighlightedCodeForComponentPreview2 threw"],
      ["another", "getElementById2InShadowRootForCanvasFrames"],
      ["a route with names and digits", "GET v1/projects/9f8e/designs/Card2Header/states/Default"],
      ["a version", "parity@0.14.2-beta.3 on electron 38.2.1"],
      ["an error message", "Cannot read properties of undefined (reading 'children') at Layers.tsx:142:17"]
    ])("%s", (_, text) => {
      expect(scrubber.text(text)).toBe(text)
    })
  })
})

describe("value", () => {
  it("scrubs every string in a Sentry event, stack frames included, without changing the original", () => {
    const event = {
      event_id: "fc6d8c0c43fc4630ad850ee518f1b9d0",
      message: `Upload failed for ${keys.github}`,
      tags: { process: "main", release: "parity@0.14.2" },
      exception: {
        values: [
          {
            type: "Error",
            value: "401 from https://deploy:hunter2-prod@registry.example.com",
            stacktrace: {
              frames: [
                {
                  filename: "app:///out/main/index.js",
                  lineno: 812,
                  context_line: `  const client = new Client({ apiKey: "${keys.openai}" })`,
                  vars: { apiKey: "anything at all", retries: 3, project: "/Users/ada/acme" }
                }
              ]
            }
          }
        ]
      },
      request: { headers: { Authorization: "Basic YWRhOmh1bnRlcjI=", Accept: "application/json" } }
    }
    const before = structuredClone(event)

    const scrubbed = scrubber.value(event)

    expect(event).toEqual(before)
    expect(scrubbed.event_id).toBe(event.event_id)
    expect(scrubbed.message).toBe(`Upload failed for ${redacted}`)
    expect(scrubbed.tags).toEqual(event.tags)
    const exception = scrubbed.exception.values[0]
    expect(exception?.value).toBe(`401 from https://deploy:${redacted}@registry.example.com`)
    const frame = exception?.stacktrace.frames[0]
    expect(frame?.filename).toBe("app:///out/main/index.js")
    expect(frame?.context_line).toBe(`  const client = new Client({ apiKey: "${redacted}" })`)
    expect(frame?.vars).toEqual({ apiKey: redacted, retries: 3, project: "/Users/ada/acme" })
    expect(scrubbed.request.headers).toEqual({ Authorization: redacted, Accept: "application/json" })
  })

  it("replaces the whole value of a secret field, whatever it holds", () => {
    expect(
      scrubber.value({ cookies: { session: "abc" }, refreshToken: 12345, password: null, hasPassword: false })
    ).toEqual({
      cookies: redacted,
      refreshToken: redacted,
      password: null,
      hasPassword: false
    })
  })

  it("copies an error as its own class, with its message, stack, fields and cause scrubbed", () => {
    class SaveError extends Error {
      override readonly name = "SaveError"
      path = "/Users/ada/acme/.env"
    }
    const error = new SaveError(`couldn't write token ${keys.slack}`, { cause: new Error(`Bearer ${keys.jwt}`) })

    const scrubbed = scrubber.value(error)

    expect(scrubbed).toBeInstanceOf(SaveError)
    expect(scrubbed.message).toBe(`couldn't write token ${redacted}`)
    expect(scrubbed.stack).not.toContain(keys.slack)
    expect(scrubbed.path).toBe(error.path)
    expect(scrubbed.cause).toBeInstanceOf(Error)
    expect(scrubbed.cause instanceof Error && scrubbed.cause.message).toBe(`Bearer ${redacted}`)
  })

  it("keeps cycles and objects that aren't plain", () => {
    const at = new Date(Date.UTC(2026, 10, 6))
    const node: { name: string; at: Date; self?: unknown } = { name: "Card", at }
    node.self = node

    const scrubbed = scrubber.value(node)

    expect(scrubbed.self).toBe(scrubbed)
    expect(scrubbed.at).toBe(at)
  })
})

describe("isSecretName", () => {
  it.each([
    "password",
    "DB_PASSWORD",
    "clientSecret",
    "api_key",
    "OPENAI_API_KEY",
    "STRIPE_KEY",
    "GITHUB_TOKEN",
    "accessToken",
    "refresh_token",
    "id-token",
    "Authorization",
    "set-cookie",
    "privateKey"
  ])("%s is secret", (name) => {
    expect(isSecretName(name)).toBe(true)
  })

  it.each(["token", "tokens", "designToken", "tokenName", "key", "sessionId", "installId", "pwd", "monkey"])(
    "%s isn't",
    (name) => {
      expect(isSecretName(name)).toBe(false)
    }
  )
})

describe("envSecrets", () => {
  it("reads the values worth scrubbing from a .env file", () => {
    const file = [
      "# Local development",
      "export STRIPE_SECRET_KEY=shop_test_abcdefghijklmnop",
      'DATABASE_URL="postgres://ada:hunter2-local@localhost:5432/acme" # main database',
      "SESSION_SECRET='a long session secret'",
      "PORT=3000",
      "DEBUG=true",
      "NODE_ENV=dev",
      "PUBLIC_NAME=Acme Store # shown in the header",
      "",
      "not a line"
    ].join("\r\n")

    expect(envSecrets(file)).toEqual([
      "shop_test_abcdefghijklmnop",
      "postgres://ada:hunter2-local@localhost:5432/acme",
      "a long session secret",
      "Acme Store"
    ])
  })
})
