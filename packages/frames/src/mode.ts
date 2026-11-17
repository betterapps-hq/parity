/** The mode a route's page draws in: the classes and attributes on its `<html>`, and its color scheme (PAR-1076). */
export interface PageMode {
  classes: string[]
  attributes: Record<string, string>
  /** What `prefers-color-scheme` answers: the mode's theme's, when it has one that's dark or light. */
  scheme?: "dark" | "light"
}
