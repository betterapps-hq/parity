// Whether someone has signed in, kept in this browser only: enough for the example's guarded Dashboard.

const key = "acme-signed-in"

export function isSignedIn(): boolean {
  return localStorage.getItem(key) === "yes"
}

export function signIn(): void {
  localStorage.setItem(key, "yes")
}
